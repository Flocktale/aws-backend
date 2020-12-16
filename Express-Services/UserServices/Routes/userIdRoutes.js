const router = require('express').Router();

const { sortedSocialRelationByUsernameIndex, dynamoClient, tableName } = require('../config');


const avatarRouter = require('./userIdNestedRoutes/avatarRoutes');
const followRequestRouter = require('./userIdNestedRoutes/followRequestRoutes');

router.use('/avatar', avatarRouter);
router.use('/follow-requests', followRequestRouter);


//! Get user by userId
router.get("/", (req, res) => {

    const userId = req.userId;
    const query = {
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        AttributesToGet: [
            'userId', 'username', 'avatar', 'createdOn', 'modifiedOn', 'name', 'phone', 'email', 'bio', 'termsAccepted',
            'policyAccepted', 'lngPref', 'regionCode', 'geoLat', 'geoLong',
            'followerCount', 'followingCount', 'clubsCreated', 'clubsParticipated', 'kickedOutCount', 'clubsJoinRequests', 'clubsAttended'
        ],
        TableName: tableName
    };

    dynamoClient.get(query, (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        }
        else {
            console.log(data);
            res.status(200).json(data['Item']);
        }
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
    console.log('oldItem', _oldItem);

    const _newItemKeys = Object.keys(req.body);

    const attributeUpdates = {};

    console.log(req.body);
    for (let key of _newItemKeys) {
        if (_oldItem[key] !== req.body[key]) {
            console.log(key, _oldItem[key] + " => ", req.body[key]);
            attributeUpdates[key] = { "Action": "PUT", "Value": req.body[key] };
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
            res.status(304).json("Error updating profile");
        }
        else res.status(200).json('User profile updated successfully');
    });

});


// required
// query parameters - "sortby" (possible value = "username")  (optional)
// headers - "lastevaluatedkey"  (optional)

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
    if (req.query.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;
        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "SocialConnectionUsername": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['Following#']
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
                "AttributeValueList": ['FOLLOWING#']
            },
        };
    }

    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "followings": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });


});

// required
// query parameters - "sortby" (possible value = "username")  (optional)
// headers - "lastevaluatedkey"  (optional)

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
    if (req.query.sortby === 'username') {
        query["IndexName"] = sortedSocialRelationByUsernameIndex;

        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "SocialConnectionUsername": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['Follower#']
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
                "AttributeValueList": ['FOLLOWER#']
            },
        };
    }
    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    dynamoClient.query(query, (err, data) => {
        if (err) res.status(404).json(err);
        else {
            console.log(data);
            res.status(200).json({
                "followers": data["Items"],
                'lastevaluatedkey': data["LastEvaluatedKey"]
            });
        }
    });
});


module.exports = router;