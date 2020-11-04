const router = require('express').Router();
const AWS = require('aws-sdk');
const Joi = require('joi');
const multer = require('multer');

const { imageUploadConstParams, sortedSocialRelationByUsernameIndex, s3, dynamoClient, tableName } = require('../config');

const followRequestRouter = require('./followRequestRoutes');

router.use('/follow-requests', followRequestRouter);


//! Get user by userId
router.get("/", (req, res) => {

    const userId = req.userId;
    const query = {
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        TableName: tableName
    };

    dynamoClient.get(query, (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        }
        else res.status(200).json(data);
    });

});



//! Update profile of a user
router.patch("/", async (req, res) => {
    const userId = req.userId;
    const _key = {
        P_K: `USER#${userId}`,
        S_K: `USERMETA#${userId}`
    };

    const _getQuery = { Key: _key, TableName: tableName };

    var _oldItem;
    try {
        _oldItem = (await dynamoClient.get(_getQuery).promise()).Item;
    } catch (e) {
        console.log(e);
        res.status(404).json(`No data exists with user id: ${userId}`);
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
        res.status(200).json('Nothing to update');
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
        if (err) {
            console.log(err);
            res.status(304).json("Error updating profile");
        }
        else res.status(200).json(data);
    });

});

router.post("/avatar", multer().single('avatar'), (req, res) => {
    const userId = req.userId;

    if (!req.file) {
        res.status(400).send('Invalid request. File not found');
        return;
    }

    // TODO: process this file, may include - check for broken/corrupt file, valid image extension, cropping or resizing etc.
    const fileName = userId;

    var params = {
        ...imageUploadConstParams,
        Body: req.file.buffer,
        Key: `userAvatar/${fileName}`
    };

    s3.upload(params, (err, data) => {
        if (err) {
            res.json(`Error occured while trying to upload: ${err}`);
            return;
        }
        else if (data) {
            res.status(201).json('Image uploaded successfully');
        }
    });
});




//! Get list of following users
router.get('/following', (req, res) => {

    const userId = req.userId;
    const query = {
        TableName: tableName,
        AttributesToGet: [
            'followingUserId', 'followingUsername', 'followingName', 'followingAvatar', 'timestamp'
        ],
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
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });


});

//! Get list of followers
router.get('/followers', (req, res) => {

    const userId = req.userId;
    const query = {
        TableName: tableName,
        AttributesToGet: [
            'followerUserId', 'followerUsername', 'followerName', 'followerAvatar', 'timestamp'
        ],
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
        if (err) res.status(404).json(err);
        else res.status(200).json(data);
    });
});


module.exports = router;