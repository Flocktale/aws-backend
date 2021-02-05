const router = require('express').Router();
const Joi = require('joi');

const {
    sortedSocialRelationByUsernameIndex,
    dynamoClient,
    tableName,
    sns,
} = require('../config');

const {
    RelationIndexObjectSchema,
} = require('../Schemas/UserRelation');
const {
    SNSEndpointSchemaWithDatabaseKeys
} = require('../Schemas/snsEndpointSchema');


const avatarRouter = require('./userIdNestedRoutes/avatarRoutes');
const relationsRouter = require('./userIdNestedRoutes/relationRoutes');
const storyRouter = require('./userIdNestedRoutes/storyRoutes');

router.use('/avatar', avatarRouter);
router.use('/relations', relationsRouter);
router.use('/story', storyRouter);


// required
// body - {"deviceToken"}
router.post("/register-device-token", async (req, res) => {
    const userId = req.userId;
    const deviceToken = req.body.deviceToken;

    if (!deviceToken) {
        return res.status(400).json("deviceToken is required");
    }

    const _tokenQuery = {
        TableName: tableName,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${userId}`
        },
        AttributesToGet: ['deviceToken'],
    }
    var oldDeviceToken;
    try {
        const oldData = (await dynamoClient.get(_tokenQuery).promise())['Item'];
        if (oldData) {
            oldDeviceToken = oldData['deviceToken'];
        }
    } catch (error) {
        console.log('error while fetching old token data: ', error);
    }

    if (oldDeviceToken === deviceToken) {
        console.log('device token is already registered');
        return res.status(201).json('Token registered successfully');
    }

    // creating platform endpoint in sns (using platform application - "mootclub" which is GCM (FCM) enabled )
    const params = {
        PlatformApplicationArn: 'arn:aws:sns:us-east-1:556316647006:app/GCM/mootclub',
        Token: deviceToken,
    };

    try {
        const endpointArn = (await sns.createPlatformEndpoint(params).promise()).EndpointArn;
        const snsData = await SNSEndpointSchemaWithDatabaseKeys.validateAsync({
            userId: userId,
            deviceToken: deviceToken,
            endpointArn: endpointArn,
        });

        const _putQuery = {
            TableName: tableName,
            Item: snsData,
        }

        await dynamoClient.put(_putQuery).promise();

        return res.status(201).json('Token registered successfully');

    } catch (error) {
        console.log('error in registering endpoint: ', error);
        return res.status(500).json('error in registering endpoint');
    }

});

//query parameters - "primaryUserId"
//! Get user by userId
router.get("/", async (req, res) => {

    const userId = req.userId;
    let primaryUserId = req.query.primaryUserId;

    if (!primaryUserId) {
        primaryUserId = userId;
    }


    const query = {
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'createdOn', 'modifiedOn', 'name', 'phone', 'email', 'tagline', 'bio', 'termsAccepted',
            'policyAccepted', 'lngPref', 'regionCode', 'geoLat', 'geoLong',
            'followerCount', 'followingCount', 'clubsCreated', 'clubsParticipated', 'clubsJoinRequests', 'clubsAttended'
        ],
        TableName: tableName
    };
    var relationQuery;

    if (primaryUserId !== userId) {
        relationQuery = {
            Key: {
                P_K: `USER#${primaryUserId}`,
                S_K: `RELATION#${userId}`
            },
            AttributesToGet: ["relationIndexObj"],
            TableName: tableName,
        };
    }

    try {
        const userData = (await dynamoClient.get(query).promise())['Item'];
        var relationIndexObj;
        if (relationQuery) {
            relationIndexObj = (await dynamoClient.get(relationQuery).promise())['Item'].relationIndexObj;

            if (!relationIndexObj) {
                relationIndexObj = (await RelationIndexObjectSchema.validateAsync({
                    relationIndexObj: {}
                })).relationIndexObj;
            }
        }



        res.status(200).json({
            user: userData,
            relationIndexObj: relationIndexObj,
        });

    } catch (err) {
        console.log(err);
        res.status(404).json(err);
    }

});



//! Update profile of a user
router.patch("/", async (req, res) => {
    const userId = req.userId;
    const _key = {
        P_K: `USER#${userId}`,
        S_K: `USERMETA#${userId}`
    };

    const _getQuery = {
        Key: _key,
        TableName: tableName
    };

    var _oldItem;
    try {
        _oldItem = (await dynamoClient.get(_getQuery).promise()).Item;
    } catch (e) {
        console.log(e);
        res.status(404).json(`No data exists with user id: ${userId}`);
        return;
    }
    console.log('oldItem', _oldItem);

    const _newItemKeys = Object.keys(req.body);

    const attributeUpdates = {};

    console.log(req.body);
    for (let key of _newItemKeys) {
        if (_oldItem[key] !== req.body[key]) {
            console.log(key, _oldItem[key] + " => ", req.body[key]);
            attributeUpdates[key] = {
                "Action": "PUT",
                "Value": req.body[key]
            };
        }
    }

    let len = 0;
    for (var _ in attributeUpdates) {
        len++;
    }

    if (len === 0) {
        console.log('no attributes to update');
        res.status(200).json('Nothing to update');
        return;
    }
    console.log('attriubtes to update', attributeUpdates);

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
            res.status(404).json("Error updating profile");
        } else res.status(200).json('User profile updated successfully');
    });

});



module.exports = router;