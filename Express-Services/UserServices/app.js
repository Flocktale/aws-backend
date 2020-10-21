
/* 
? Methods to implement =>
# Create user profile in database 
# Get profile by userId
# Get profile by username
# Update profile of user
! Delete user from database
# Get My followers
# Get whom I'm following
# send a follow request
# Get follow requests i have sent
# Get follow requests i have received
# cancel (delete) a sent follow request
# respond to received follow requests - delete , accept
*/

const express = require('express');
const app = express();
const cors = require('cors');

const Joi = require('joi');
const { UserBaseCompleteSchema } = require('./Schemas/UserBase');
const { FollowRequestSchemaWithDatabaseKeys } = require('./Schemas/FollowRequest');
const { FollowingSchemaWithDatabaseKeys } = require('./Schemas/Following');
const { FollowerSchemaWithDatabaseKeys } = require('./Schemas/Follower');

app.use(cors());
app.use(express.json());

const AWS = require('aws-sdk');


AWS.config.update({
    region: "us-east-1",
    // endpoint: "http://localhost:3000"        //this endpoint is used in case of local dynamodb on pc.
    // endpoint: "http://dynamodb.us-east-1.amazonaws.com"  // by default it is set according to region
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();

const tableName = "MyTable";
const searchByUsernameIndex = "SearchByUsernameIndex";
const sortedSocialRelationByUsernameIndex = 'SortedSocialRelationByUsernameIndex';
const receivedFollowRequestIndex = 'ReceivedFollowRequestIndex';

app.get("/", (req, res) => {
    res.send("Hello from server, this is root path, nothing to find here.");
});

app.get("/users", (req, res) => {
    // TODO: send list of users
    res.send('You have hit a TODO: Send list of users )');
});


app.post("/users/create", async (req, res) => {

    try {
        const result = await UserBaseCompleteSchema.validateAsync(req.body);
        const query = {
            TableName: tableName,
            Item: result,
        };
        dynamoClient.put(query, (err, data) => {
            if (err) res.status(304).send('Error creating profile');
            else res.status(201).send(data);

        });

    } catch (error) {
        res.status(400).send(error);
    }

});


//! Get user by userId
app.get("/users/:userId", (req, res) => {

    const userId = req.params.userId;
    const query = {
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        TableName: tableName
    };

    dynamoClient.get(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });

});

//! Update profile of a user
app.patch("/users/:userId", async (req, res) => {
    const userId = req.params.userId;
    const _key = {
        P_K: `USER#${userId}`,
        S_K: `USERMETA#${userId}`
    };

    const _getQuery = { Key: _key, TableName: tableName };

    var _oldItem;
    try {
        _oldItem = (await dynamoClient.get(_getQuery).promise()).Item;
    } catch (e) {
        res.status(404).send(`No data exists with user id: ${userId}`);
        return;
    }
    const _newItemKeys = Object.keys(req.body);

    const attributeUpdates = {};

    console.log(req.body);
    for (let key of _newItemKeys) {
        if (_oldItem[key] !== req.body[key]) {
            console.log(key, _oldItem[key] + " => ", req.body[key]);
            attributeUpdates[key] = { "Action": "PUT", "Value": req.body[key] };
        }
    }

    if (attributeUpdates.length === 0) {

        console.log('no attributes to update');
        res.status(200).send('Nothing to update');
        return;
    }

    const _updateQuery = {
        TableName: tableName,
        Key: _key,
        AttributeUpdates: attributeUpdates,
        ReturnConsumedCapacity: "INDEXES",
        ReturnItemCollectionMetrics: "SIZE"
    };

    // TODO: if {username, name} changes, then change all related documents 
    //! (vvimp)

    dynamoClient.update(_updateQuery, (err, data) => {
        if (err) res.status(304).send("Error updating profile");
        else res.status(200).send(data);
    });

});


//! Search list of users by username. (paginated with limit of 10 results)
app.get("/users/query/:username", async (req, res) => {

    const username = req.params.username;


    try {
        const _schema = Joi.string().min(3).max(25).token().required();
        await _schema.validateAsync(username);
    } catch (e) {
        res.status(400).send(e);
        return;
    }

    const query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,
        Limit: 10,
        KeyConditionExpression: 'PublicSearch = :hkey and begins_with ( FilterDataName , :filter )',
        ExpressionAttributeValues: {
            ":hkey": 1,
            ":filter": `USER#${username}`
        },
        ReturnConsumedCapacity: "INDEXES"
    };

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }
    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });

});

//! Get list of following users
app.get('/users/:userId/following', (req, res) => {

    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };

    //! prefix of value of sort key has different cases. 
    if (req.headers.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;
        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( SocialConnectionUsername , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'Following#'
        };

    } else {

        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( S_K , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'FOLLOWING#'
        };

    }

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });


});

//! Get list of followers
app.get('/users/:userId/followers', (req, res) => {

    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };


    //! prefix of value of sort key has different cases. 
    if (req.headers.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;
        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( SocialConnectionUsername , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'Follower#'
        };

    } else {

        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( S_K , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'FOLLOWER#'
        };

    }
    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });
});

// send a follow-request
app.post('/users/:userId/follow-requests', async (req, res) => {

    const userId = req.params.userId;

    try {
        const result = await FollowRequestSchemaWithDatabaseKeys.validateAsync(req.body);
        result['S_K'] = 'FOLLOWREQUEST#' + result.timestamp + '#' + result.requestedUserId;

        const _putQuery = {
            TableName: tableName,
            Item: result,
        };

        dynamoClient.put(_putQuery, (err, data) => {
            if (err) res.status(304).send('Error sending follow-request');
            else res.status(201).send(data);

        });

    } catch (e) {
        res.status(400).send('Invalid body');
    }

});


// ! Note - sorting by username is only available in case of sent requests but not for received becasuse for later case, we need to query a GSI.

app.get('/users/:userId/follow-requests/sent', (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };


    //! prefix of value of sort key has different cases. 
    if (req.headers.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;
        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( SocialConnectionUsername , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'FollowRequest#'
        };

    } else {

        query["KeyConditionExpression"] = 'P_K = :hkey and begins_with ( S_K , :skey )';
        query["ExpressionAttributeValues"] = {
            ":hkey": `USER#${userId}`,
            ":skey": 'FOLLOWREQUEST#'
        };

    }
    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });


})

// get received follow requests
app.get('/users/:userId/follow-requests/received', (req, res) => {
    const userId = req.params.userId;
    const query = {
        TableName: tableName,
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };

    query["IndexName"] = receivedFollowRequestIndex;
    query["KeyConditionExpression"] = 'FollowRequestReceiver = :hkey';
    query["ExpressionAttributeValues"] = {
        ":hkey": `FOLLOWREQUEST-RECEIVED#${userId}`,
    };


    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).send(err);
        else res.status(200).send(data);
    });

});

//* delete follow-request sent by user
app.delete('users/:userId/follow-requests/sent', async (req, res) => {


    const timestamp = req.headers.timestamp;
    const requestedUserId = req.headers.requestedUserId;

    try {
        const _schema = Joi.object({
            timestamp: Joi.string().required(),
            requestedUserId: Joi.string().required()
        });
        await _schema.validateAsync({ timestamp: timestamp, requestedUserId: requestedUserId });
    } catch (e) {
        res.status(400).send('Timestamp and requestedUserId is required');
        return;
    }

    const userId = req.params.userId;

    const _key = {
        P_K: `USER#${userId}`,
        S_K: `FOLLOWREQUEST#${timestamp}#${requestedUserId}`
    };

    const _deleteQuery = {
        TableName: tableName,
        Key: _key,
    };

    dynamoClient.delete(_deleteQuery, (err, data) => {
        if (err) res.status(304).send("Error deleting follow request");
        else res.status(204).send();
    });

});

// accept or reject a follow-request...........
// ! NOTE :  (req.body should conform to FollowRequest model)
app.post('/users/:userId/follow-requests/received', async (req, res) => {

    var body;

    try {
        body = await FollowRequestSchemaWithDatabaseKeys.validateAsync(req.body);
        body["S_K"] = 'FOLLOWREQUEST#' + body.timestamp + '#' + body.requestedUserId;
    } catch (e) {
        res.status(400).send('Invalid Follow Request Model object');
        return;
    }


    try {
        const _schema = Joi.string().valid('accept', 'cancel').required();
        await _schema.validateAsync(req.headers.requestaction);
    } catch (e) {
        res.status(400).send('Invalid Response action to follow request (accept/cancel)');
        return;
    }

    const userId = req.params.userId;
    const reqAction = req.headers.requestaction;


    const _deleteKey = {
        P_K: `USER#${userId}`,
        S_K: `FOLLOWREQUEST#${timestamp}#${body.requestedUserId}`
    };

    if (reqAction === 'accept') {

        const timestamp = new Date.now();

        const followingTableItem = await FollowingSchemaWithDatabaseKeys.validateAsync({
            userId: userId,
            followingUserId: body.requestedUserId,
            followingUsername: body.requestedUsername,
            followingName: body.requestedName,
            followingAvatar: body.requestedAvatar,
            timestamp: timestamp,

            S_K: 'FOLLOWING#' + timestamp + '#' + body.requestedUserId
        });

        const followerTableItem = await FollowerSchemaWithDatabaseKeys.validateAsync({
            userId: body.requestedUserId,
            followerUserId: body.userId,
            followerUsername: body.username,
            followerName: body.name,
            followerAvatar: body.avatar,
            timestamp: timestamp,

            S_K: 'FOLLOWER#' + timestamp + '#' + body.userId
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
                }

            ]
        };
        dynamoClient.transactWrite(_acceptTransactionQuery, (err, data) => {
            if (err) res.status(304).send('Action failed !');
            else res.status(200).send('Accepted follow request');
        });

    } else if (reqAction === 'cancel') {

        //? Transaction is not required here as only document in follow-request is need to be deleted.
        const _deleteQuery = {
            TableName: tableName,
            Key: _deleteKey
        };
        dynamoClient.delete(_deleteQuery, (err, data) => {
            if (err) res.status(304).send("Error deleting follow request");
            else res.status(204).send();
        });

    } else {
        console.log('Server side validation failed for Joi ');
        res.status(400).send();
    }

});




module.exports = app;





