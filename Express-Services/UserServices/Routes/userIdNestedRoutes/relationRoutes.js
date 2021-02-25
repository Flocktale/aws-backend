const router = require('express').Router();
const Joi = require('joi');



const {
    usernameSortIndex,
    timestampSortIndex,
    dynamoClient,
    tableName,
} = require('../../config');

const {
    RelationIndexObjectSchema
} = require('../../Schemas/UserRelation');

const {
    followUser,
    sendFriendRequest,
    acceptFriendRequest,
} = require('../../Functions/addRelationFunctions');
const {
    unfollowUser,
    deleteFriendRequest,
    unfriendUser
} = require('../../Functions/removeRelationFunctions');
const {
    fetchSocialRelationIndexObj,
    fetchSocialCountData
} = require('../../Functions/userFunctions');



// query parameters - "foreignUserId"
router.get('/object', async (req, res) => {
    const userId = req.userId;
    const foreignUserId = req.query.foreignUserId;


    const oldRelationDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: ['relationIndexObj'],
    };
    const oldRelationDoc = (await dynamoClient.get(oldRelationDocQuery).promise())['Item'];
    if (oldRelationDoc) {
        return res.status(200).json(oldRelationDoc.relationIndexObj);
    } else {

        const newRelationObject = await RelationIndexObjectSchema.validateAsync({
            relationIndexObj: {}
        });
        return res.status(200).json(newRelationObject.relationIndexObj);
    }



});


// required
// query parameters - 
//       "socialRelation" (possible "followings","followers", "requests_sent", "requests_received","friends"),  
//       "sortby" (possible value = "username" , "timestamp" (default))  (optional)
// headers - "lastevaluatedkey"  (optional)

//! Get list of followers/foillowing/requests_sent/requests_received//friends
router.get('/', async (req, res) => {

    const userId = req.userId;
    const socialRelation = req.query.socialRelation;

    try {
        const _schema = Joi.string().valid("followings", "followers", "requests_sent", "requests_received", "friends").required();
        await _schema.validateAsync(socialRelation);
    } catch (error) {
        res.status(400).json('invalid query , valid socialRelation =>"followings", "followers", "requests_sent", "requests_received", "friends"');
        return;
    }

    let bitChecker;

    if (socialRelation === "followings") {
        bitChecker = 'B5';
    } else if (socialRelation === "followers") {
        bitChecker = 'B4';
    } else if (socialRelation === "requests_sent") {
        bitChecker = 'B3';
    } else if (socialRelation === "requests_received") {
        bitChecker = 'B2';
    } else if (socialRelation === "friends") {
        bitChecker = 'B1';
    } else {
        res.status(501).json('request has hit a dead end');
        return;
    }

    var _indexName, _sortKey, _sortField;

    if (req.query.sortby === 'username') {
        _indexName = usernameSortIndex;
        _sortKey = 'UsernameSortField';
        _sortField = 'RELATION-SORT-USERNAME#';

    } else {
        _indexName = timestampSortIndex;
        _sortKey = 'TimestampSortField';
        _sortField = 'RELATION-SORT-TIMESTAMP#';
    }

    const query = {
        TableName: tableName,
        IndexName: _indexName,
        FilterExpression: 'relationIndexObj.#bit = :tr',
        KeyConditionExpression: 'P_K = :pk and begins_with(#sk,:sk)',

        ExpressionAttributeNames: {
            '#bit': bitChecker,
            '#sk': _sortKey,
        },
        ExpressionAttributeValues: {
            ':tr': true,
            ':pk': `USER#${userId}`,
            ':sk': _sortField,
        },
        ProjectionExpression: 'foreignUser',
        ScanIndexForward: false,
        Limit: 20,
    };


    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            const users = data['Items'].map(({
                foreignUser
            }) => {
                return foreignUser
            });
            res.status(200).json({
                'users': users,
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


//required
// query parameters - 
//      "foreignUserId" - user id of other user
//       "action" (possible values - "follow" , "send_friend_request" , "accept_friend_request")

//! follow a user or send friend request or accept friend request.
router.post('/add', async (req, res) => {

    const userId = req.userId;
    const foreignUserId = req.query.foreignUserId;

    if (userId === foreignUserId) {
        res.status(400).json('both user id should be unique');
        return;
    }

    const addAction = req.query.action;

    try {
        await Joi.string().required().validateAsync(foreignUserId);
        await Joi.string().valid("follow", "send_friend_request", "accept_friend_request").required().validateAsync(addAction);
    } catch (error) {
        res.status(400).json(error);
        return;
    }

    const _functionParams = {
        userId: userId,
        foreignUserId: foreignUserId
    };

    try {

        if (addAction === "follow") {

            await followUser(_functionParams);

        } else if (addAction === "send_friend_request") {

            await sendFriendRequest(_functionParams);

        } else if (addAction === "accept_friend_request") {

            await acceptFriendRequest(_functionParams);

        } else {

            return res.status(500).json('Dead end');
        }

        const newSocialRelationIndex = await fetchSocialRelationIndexObj({
            userId: userId,
            foreignUserId: foreignUserId
        });

        const newSocialCountOfForeignUser = await fetchSocialCountData(foreignUserId);

        return res.status(202).json({
            ...newSocialRelationIndex,
            ...newSocialCountOfForeignUser,
        });
    } catch (error) {

        return res.status(400).json(error);
    }

});



//required
// query parameters - 
//      "foreignUserId" - user id of other user
//       "action" (possible values - "unfollow" , "delete_friend_request" , "unfriend" )

//! unfollow a user or delete friend request or unfriend user.

router.post('/remove', async (req, res) => {
    const userId = req.userId;
    const foreignUserId = req.query.foreignUserId;


    if (userId === foreignUserId) {
        res.status(400).json('both user id should be unique');
        return;
    }

    const removeAction = req.query.action;

    try {
        await Joi.string().required().validateAsync(foreignUserId);
        await Joi.string().valid("unfollow", "delete_friend_request", "unfriend").required().validateAsync(removeAction);
    } catch (error) {
        res.status(400).json(error);
        return;
    }


    const _functionParams = {
        userId: userId,
        foreignUserId: foreignUserId
    };

    try {



        var newSocialCountOfForeignUser = {};


        if (removeAction === 'unfollow') {

            await unfollowUser(_functionParams);
            newSocialCountOfForeignUser = await fetchSocialCountData(foreignUserId);

        } else if (removeAction === 'delete_friend_request') {

            // social counters don't change in this case.
            await deleteFriendRequest(_functionParams);

        } else if (removeAction === 'unfriend') {

            await unfriendUser(_functionParams);
            newSocialCountOfForeignUser = await fetchSocialCountData(foreignUserId);

        } else {

            return res.status(500).json('Dead end');
        }



        const newSocialRelationIndex = await fetchSocialRelationIndexObj({
            userId: userId,
            foreignUserId: foreignUserId
        });


        return res.status(202).json({
            ...newSocialCountOfForeignUser,
            ...newSocialRelationIndex
        });

    } catch (error) {

        return res.status(400).json(error);

    }


});

module.exports = router;