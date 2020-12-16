const router = require('express').Router();
const Joi = require('joi');

const { FollowRequestSchemaWithDatabaseKeys } = require('../../Schemas/FollowRequest');
const { FollowingSchemaWithDatabaseKeys } = require('../../Schemas/Following');
const { FollowerSchemaWithDatabaseKeys } = require('../../Schemas/Follower');

const { receivedFollowRequestIndex, sortedSocialRelationByUsernameIndex, dynamoClient, tableName } = require('../../config');


//required
// body : FollowRequestSchemaWithDatabaseKeys validated
//! send a follow-request
router.post('/', async (req, res) => {

    const userId = req.userId;

    try {
        const result = await FollowRequestSchemaWithDatabaseKeys.validateAsync(req.body);

        const _putQuery = {
            TableName: tableName,
            Item: result,
        };

        dynamoClient.put(_putQuery, (err, data) => {
            if (err) res.status(304).json(`Error sending follow-request : ${err}`);
            else {
                console.log(data);
                res.status(201).json('follow-request sent');
            }
        });

    } catch (e) {
        res.status(400).json('Invalid body');
    }

});


// required
// query parameters - "sortby" (possible value = "username")  (optional)
// headers - "lastevaluatedkey"  (optional)

// ! Note - sorting by username is only available in case of sent requests but not for received becasuse for later case, we need to query a GSI.
router.get('/sent', (req, res) => {
    const userId = req.userId;
    const query = {
        TableName: tableName,
        AttributesToGet: [
            'requestedUserId', 'requestedUsername', 'requestedName', 'requestedAvatar', 'timestamp'
        ],
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };


    //! prefix of value of sort key has different cases. 
    if (req.query.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;
        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "SocialConnectionUsername": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['FollowRequest#']
            },
        };

    } else {
        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "S_K": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['FOLLOWREQUEST#']
            },
        };
    }
    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json({
            'requestedUsers': data["Items"],
            'lastevaluatedkey': data["LastEvaluatedKey"]
        });
    });


});

// required
// headers - "lastevaluatedkey"  (optional)

//! get received follow requests
router.get('/received', (req, res) => {
    const userId = req.userId;
    const query = {
        TableName: tableName,
        AttributesToGet: [
            'userId', 'username', 'name', 'avatar', 'timestamp'
        ],
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };

    query["IndexName"] = receivedFollowRequestIndex;
    query["KeyConditions"] = {
        "FollowRequestReceiver": {
            "ComparisonOperator": "EQ",
            "AttributeValueList": [`FOLLOWREQUEST-RECEIVED#${userId}`]
        },

    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else res.status(200).json({
            'receivedUsers': data["Items"],
            'lastevaluatedkey': data["LastEvaluatedKey"]
        });
    });

});

//required
// query parameters - "timestamp" , "requestedUserId"

//! delete follow-request sent by user
router.delete('/sent', async (req, res) => {

    const userId = req.userId;

    const timestamp = req.query.timestamp;
    const requestedUserId = req.query.requestedUserId;

    try {
        const _schema = Joi.object({
            timestamp: Joi.string().required(),
            requestedUserId: Joi.string().required()
        });
        await _schema.validateAsync({ timestamp: timestamp, requestedUserId: requestedUserId });
    } catch (e) {
        res.status(400).json('Timestamp and requestedUserId is required');
        return;
    }


    const _key = {
        P_K: `USER#${userId}`,
        S_K: `FOLLOWREQUEST#${timestamp}#${requestedUserId}`
    };

    const _deleteQuery = {
        TableName: tableName,
        Key: _key,
    };

    dynamoClient.delete(_deleteQuery, (err, data) => {
        if (err) res.status(304).json(`Error deleting follow request: ${err}`);
        else res.status(204).json('deleted follow-request');
    });

});


//required
// body: FollowRequestSchemaWithDatabaseKeys validated
// query parameters : "requestaction" (possible values - "accept", "cancel") 

// accept or reject a follow-request...........
router.post('/received', async (req, res) => {

    var body;

    try {
        body = await FollowRequestSchemaWithDatabaseKeys.validateAsync(req.body);
    } catch (e) {
        res.status(400).json('Invalid Follow Request Model object');
        return;
    }


    try {
        const _schema = Joi.string().valid('accept', 'cancel').required();
        await _schema.validateAsync(req.query.requestaction);
    } catch (e) {
        res.status(400).json('Invalid Response action to follow request (accept/cancel)');
        return;
    }

    const reqAction = req.query.requestaction;


    const _deleteKey = {
        P_K: `USER#${body.userId}`,
        S_K: `FOLLOWREQUEST#${timestamp}#${body.requestedUserId}`
    };

    if (reqAction === 'accept') {

        const timestamp = new Date.now();

        const followingTableItem = await FollowingSchemaWithDatabaseKeys.validateAsync({
            userId: body.userId,
            followingUserId: body.requestedUserId,
            followingUsername: body.requestedUsername,
            followingName: body.requestedName,
            followingAvatar: body.requestedAvatar,
            timestamp: timestamp,

        });

        const followerTableItem = await FollowerSchemaWithDatabaseKeys.validateAsync({
            userId: body.requestedUserId,
            followerUserId: body.userId,
            followerUsername: body.username,
            followerName: body.name,
            followerAvatar: body.avatar,
            timestamp: timestamp,
        });


        const _acceptTransactionQuery = {
            TransactItems: [
                {
                    Delete: {
                        TableName: tableName,
                        Key: _deleteKey
                    }
                },
                {                   // putting in following document
                    Put: {
                        TableName: tableName,
                        Item: followingTableItem,
                    }
                },
                {                   // putting in follower document
                    Put: {
                        TableName: tableName,
                        Item: followerTableItem,
                    }
                },
                {                   // following count increment in user doc
                    Update: {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${body.userId}`,
                            S_K: `USERMETA#${body.userId}`
                        },
                        UpdateExpression: 'set followingCount = followingCount + :counter',
                        ExpressionAttributeValues: {
                            ':counter': 1,
                        }
                    }
                },
                {                   // follower count increment in user doc
                    Update: {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${body.requestedUserId}`,
                            S_K: `USERMETA#${body.requestedUserId}`
                        },
                        UpdateExpression: 'set followerCount = followerCount + :counter',
                        ExpressionAttributeValues: {
                            ':counter': 1,
                        }
                    }
                },


            ]
        };
        dynamoClient.transactWrite(_acceptTransactionQuery, (err, data) => {
            if (err) res.status(304).json(`Action failed : ${err}`);
            else res.status(200).json('Accepted follow request');
        });

    } else if (reqAction === 'cancel') {

        //? Transaction is not required here as only document in follow-request is need to be deleted.
        const _deleteQuery = {
            TableName: tableName,
            Key: _deleteKey
        };
        dynamoClient.delete(_deleteQuery, (err, data) => {
            if (err) res.status(304).json(`Error deleting follow request: ${err}`);
            else res.status(204).json('deleted the follow request.');
        });

    } else {
        console.log('Server side validation failed for Joi ');
        res.status(400).json('Server error');
    }

});

module.exports = router;
