const {
    myTable,
    dynamoClient
} = require('../../config');
const {
    CommunityHostSchemaWithDatabaseKeys
} = require('../../Schemas/communityUserSchema');

const router = require('express').Router();

// query parameters - 
//              memberId (required)
router.post('/', async (req, res) => {
    const communityId = req.communityId;
    const memberId = req.query.memberId;

    if (!memberId) {
        return res.status(400).json('memberId is required in query parameters');
    }

    const _memberKey = {
        P_K: `COMMUNITY#MEMBER#${communityId}`,
        S_K: `COMMUNITY#USER#${memberId}`,
    };

    const _memberUpdateQuery = {
        TableName: myTable,
        Key: _memberKey,
        UpdateExpression: 'SET invited = :inv',
        ExpressionAttributeValues: {
            ':inv': true,
        }
    };
    await dynamoClient.update(_memberUpdateQuery).promise();

    //TODO: send notification to affected user.

    return res.status(200).json('successful');

});


// query parameters - 
//              memberId (required)
//              response - "accept" or "cancel" (required)
router.post('/response', async (req, res) => {
    const communityId = req.communityId;
    const memberId = req.query.memberId;

    const response = req.query.response;

    if (!memberId || !response) {
        return res.status(400).json('memberId and response both are required in query parameters');
    }

    if (response !== 'accept' && response !== 'cancel') {
        return res.status(400).json('invalid response');
    }

    const _memberKey = {
        P_K: `COMMUNITY#MEMBER#${communityId}`,
        S_K: `COMMUNITY#USER#${memberId}`,
    };

    if (response === 'accept') {

        const _memberDeleteQuery = {
            TableName: myTable,
            Key: _memberKey,
            Expected: {
                invited: {
                    Value: true
                }
            },
            ReturnValues: 'ALL_OLD',
        };

        let data;

        try {
            data = (await dynamoClient.delete(_memberDeleteQuery).promise())['Attributes'];
        } catch (error) {
            return res.status(400).json('NOT_INVITED');
        }

        const newHost = await CommunityHostSchemaWithDatabaseKeys.validateAsync({
            community: data.community,
            user: data.user,
            subscriptionArn: data.subscriptionArn,
        });

        const newHostPutQuery = {
            TableName: myTable,
            Item: newHost,
        };

        const _communityDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#${communityId}`,
                S_K: `COMMUNITYMETA#${communityId}`
            },
            UpdateExpression: 'ADD hosts :host, memberCount :counter',
            ExpressionAttributeValues: {
                ':host': data.user.avatar,
                ':counter': -1,
            },
        }

        const _transactQuery = {
            TransactItems: [{
                Put: newHostPutQuery
            }, {
                Update: _communityDocUpdateQuery
            }],
        };


        await dynamoClient.transactWrite(_transactQuery).promise();

        return res.status(200).json({
            community: data.community,
            user: data.user,
            type: newHost.type,
        });

    } else if (response === 'cancel') {

        const _memberUpdateQuery = {
            TableName: myTable,
            Key: _memberKey,
            UpdateExpression: 'REMOVE invited'
        };
        try {
            await dynamoClient.update(_memberUpdateQuery).promise();
        } catch (error) {
            console.log('error in cancelling invitation to become host for community');
        }

        return res.status(200).json('successful');
    }


});


module.exports = router;