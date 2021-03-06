const router = require('express').Router();

const {
    dynamoClient,
    myTable,
} = require('../config');

const {
    RelationIndexObjectSchema,
} = require('../Schemas/UserRelation');

const {
    isUsernameAvailable
} = require('../Functions/userFunctions');


const avatarRouter = require('./userIdNestedRoutes/avatarRoutes');
const relationsRouter = require('./userIdNestedRoutes/relationRoutes');
const storyRouter = require('./userIdNestedRoutes/storyRoutes');

const notificationRouter = require('./userIdNestedRoutes/notificationRoutes');

const clubsOfRelationRouter = require('./userIdNestedRoutes/clubsOfRelation');

router.use('/avatar', avatarRouter);
router.use('/relations', relationsRouter);
router.use('/story', storyRouter);
router.use('/notifications', notificationRouter);

router.use('/clubs', clubsOfRelationRouter);


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
            'followerCount', 'followingCount', 'friendsCount', 'clubsCreated', 'clubsParticipated', 'clubsJoinRequests', 'clubsAttended',
            'online',
        ],
        TableName: myTable
    };
    var relationQuery;

    if (primaryUserId !== userId) {
        relationQuery = {
            Key: {
                P_K: `USER#${primaryUserId}`,
                S_K: `RELATION#${userId}`
            },
            AttributesToGet: ["relationIndexObj"],
            TableName: myTable,
        };
    }

    try {
        var userData, relationIndexObj;
        const promises = [];

        promises.push(dynamoClient.get(query).promise().then(({
            Item
        }) => {
            userData = Item;
        }))

        if (relationQuery) {
            promises.push(new Promise(async (resolve, _) => {
                var tmp = (await dynamoClient.get(relationQuery).promise())['Item'];

                if (tmp) relationIndexObj = tmp.relationIndexObj;
                if (!relationIndexObj) {
                    relationIndexObj = (await RelationIndexObjectSchema.validateAsync({
                        relationIndexObj: {}
                    })).relationIndexObj;
                }
                resolve();
            }));
        }

        await Promise.all(promises);



        return res.status(200).json({
            user: userData,
            relationIndexObj: relationIndexObj,
        });

    } catch (err) {
        console.log(err);
        return res.status(404).json(err);
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
        TableName: myTable
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

            // this api is not used for updating username and name.
            if (key === 'username' || key === 'name') {
                continue;
            } else {
                attributeUpdates[key] = {
                    "Action": "PUT",
                    "Value": req.body[key]
                };
                console.log(key, _oldItem[key] + " => ", req.body[key]);
            }


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
        TableName: myTable,
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