const {
    myTable,
    dynamoClient,
    timestampSortIndex,
    usernameSortIndex
} = require('../../config');
const {
    subscribeUserToCommunityTopic,
    unsubscribeUserFromCommunityTopic
} = require('../../Functions/communityFunctions');
const {
    CommunityHostSchemaWithDatabaseKeys,
    CommunityMemberSchemaWithDatabaseKeys
} = require('../../Schemas/communityUserSchema');

const router = require('express').Router();

const inviteRouter = require('./inviteRoutes');

router.use('/invite', inviteRouter);



//headers - lastevaluatedkey (optional)
// query parameters - 
//                  type - "HOST" or "MEMBER" (required) 
//                  searchString (optional)(to search members by username, only for member)
router.get('/', async (req, res) => {

    const communityId = req.communityId;

    const type = req.query.type;

    var searchString = req.query.searchString;

    if (type !== 'HOST' && type !== 'MEMBER') {
        return res.status(400).json('invalid value of type in query parameters');
    }


    const _query = {
        TableName: myTable,

        ProjectionExpression: '#user',
        ExpressionAttributeNames: {
            '#user': 'user'
        },
        ExclusiveStartKey: req.headers.lastevaluatedkey,
        ScanIndexForward: true,
        Limit: 20,
    };

    if (type === "HOST") {
        _query['KeyConditionExpression'] = 'P_K = :pk and begins_with(S_K,:sk)';

        _query['ExpressionAttributeValues'] = {
            ':pk': `COMMUNITY#HOST#${communityId}`,
            ':sk': 'COMMUNITY#USER#',
        };
    } else if (searchString) {

        searchString = searchString.toLowerCase();
        _query['IndexName'] = usernameSortIndex;

        _query['KeyConditionExpression'] = 'P_K = :pk and begins_with(UsernameSortField,:usf)';

        _query['ExpressionAttributeValues'] = {
            ':pk': `COMMUNITY#MEMBER#${communityId}`,
            ':usf': 'COMMUNITY-MEMBER-SORT-USERNAME#' + searchString,
        };

    } else {

        _query['IndexName'] = timestampSortIndex;
        _query['ScanIndexForward'] = false;

        _query['KeyConditionExpression'] = 'P_K = :pk and begins_with(TimestampSortField,:tsf)';

        _query['ExpressionAttributeValues'] = {
            ':pk': `COMMUNITY#MEMBER#${communityId}`,
            ':tsf': 'COMMUNITY-MEMBER-SORT-TIMESTAMP#',
        };
    }


    const data = await dynamoClient.query(_query).promise();
    const users = data['Items'].map(({
        user
    }) => {
        return user;
    });


    return res.status(200).json({
        users: users,
        lastevaluatedkey: data['LastEvaluatedKey']
    });

});


// MEMBER joining
// query parameters: 
//              userId  (required) 
router.post('/', async (req, res) => {

    const communityId = req.communityId;
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json('userId is required in query parameters');
    }

    const _userSummaryQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        AttributesToGet: ['userId', 'username', 'avatar'],
    };

    const _userSummaryDoc = (await dynamoClient.get(_userSummaryQuery).promise())['Item'];

    const _communitySummaryQuery = {
        TableName: myTable,
        Key: {
            P_K: 'COMMUNITY#DATA',
            S_K: `COMMUNITYMETA#${communityId}`
        },
        AttributesToGet: ['communityId', 'name', 'avatar'],
    };

    const _communitySummaryDoc = (await dynamoClient.get(_communitySummaryQuery).promise())['Item'];

    const communityUser = {
        community: _communitySummaryDoc,
        user: _userSummaryDoc,
    };

    const _transactQuery = {
        TransactItems: [],
    };

    const newMember = await CommunityMemberSchemaWithDatabaseKeys.validateAsync(communityUser);
    const newMemberPutQuery = {
        TableName: myTable,
        Item: newMember,
    }

    const _communityDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: 'COMMUNITY#DATA',
            S_K: `COMMUNITYMETA#${communityId}`
        },
        UpdateExpression: 'ADD memberCount :counter',
        ExpressionAttributeValues: {
            ':counter': 1,
        },
    };

    _transactQuery['TransactItems'] = [{
        Put: newMemberPutQuery
    }, {
        Update: _communityDocUpdateQuery,
    }];


    await dynamoClient.transactWrite(_transactQuery).promise();

    // subscribing this user to communityTopic
    await subscribeUserToCommunityTopic({
        communityId: communityId,
        userId: userId,
        type: "MEMBER",
    });

    return res.status(200).json('successful');

});


// query parameters: 
//              type - "HOST" or "MEMBER" (required) 
//              userId  (required) 
router.delete('/', async (req, res) => {
    const communityId = req.communityId;
    const type = req.query.type;
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json('userId is required in query parameters');
    }

    if (type !== 'HOST' && type !== 'MEMBER') {
        return res.status(400).json('invalid value of type in query parameters');
    }


    const _transactQuery = {
        TransactItems: [],
    };


    if (type === 'HOST') {

        const hostDeleteQuery = {
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#HOST#${communityId}`,
                S_K: `COMMUNITY#USER#${userId}`,
            },
        };

        const _communityDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: 'COMMUNITY#DATA',
                S_K: `COMMUNITYMETA#${communityId}`
            },
            UpdateExpression: 'DELETE hosts :host',
            ExpressionAttributeValues: {
                ':host': _userSummaryDoc.avatar
            },
        }


        _transactQuery['TransactItems'] = [{
            Delete: hostDeleteQuery
        }, {
            Update: _communityDocUpdateQuery
        }];

    } else if (type === 'MEMBER') {
        const memberDeleteQuery = {
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#MEMBER#${communityId}`,
                S_K: `COMMUNITY#USER#${userId}`,
            },
        };

        const _communityDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: 'COMMUNITY#DATA',
                S_K: `COMMUNITYMETA#${communityId}`
            },
            UpdateExpression: 'ADD memberCount :counter',
            ExpressionAttributeValues: {
                ':counter': -1,
            },
        };

        _transactQuery['TransactItems'] = [{
            Delete: memberDeleteQuery
        }, {
            Update: _communityDocUpdateQuery,
        }];
    }


    // first unsubscribing user from community topic.
    await unsubscribeUserFromCommunityTopic({
        communityId: communityId,
        userId: userId,
        type: type
    });

    await dynamoClient.transactWrite(_transactQuery).promise();

    return res.status(200).json('successful');

});


module.exports = router;