const router = require('express').Router();
const Joi = require('joi');



const {
    usernameSortIndex,
    timestampSortIndex,
    dynamoClient,
    tableName,
} = require('../../config');

const {
    followUser,
    sendFriendRequest,
    acceptFriendRequest,
} = require('../../Functions/addRelationFunctions');


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

        return res.status(202).json(`${addAction} successful`);
    } catch (error) {

        return res.status(400).json(error);
    }

});



//required
// query parameters - 
//      "foreignUserId" - user id of other user
//       "action" (possible values - "unfollow" , "delete_friend_request" , "unfriend" )

//! unfollow a user or delete friend request.
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


    const oldRelationDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: ['relationIndexObj', 'requestId'],
    };
    let oldRelationDoc;
    try {
        oldRelationDoc = (await dynamoClient.get(oldRelationDocQuery).promise())['Item'];
    } catch (error) {
        console.log('error in fetching oldRelationDoc: ', error);
        return res.status(400).json('error in checking existing social connection between users');
    }

    if (!oldRelationDoc) {
        return res.status(404).json('there is no existing social connection between users');
    }


    const newTimestmap = Date.now();

    const _primaryUserUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "SET friendsCount = friendsCount - :friendCounter, followingCount = followingCount - :followingCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 0,
            ':followingCounter': 0,
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },

        UpdateExpression: "SET friendsCount = friendsCount - :friendCounter, followerCount = followerCount - :followerCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 0,
            ':followerCounter': 0,
        },
    };



    const primaryUserRelationDocUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`,
        },
    };

    const foreignUserRelationDocUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `RELATION#${userId}`,
        },
    };

    if (removeAction === "unfollow") {

        if (oldRelationDoc.relationIndexObj.B5 === false) {
            return res.status(404).json('no follow exists to unfollow');
        }

        _primaryUserUpdateQuery["ExpressionAttributeValues"][":followingCounter"] = 1;
        _foreignUserUpdateQuery["ExpressionAttributeValues"][":followerCounter"] = 1;



        primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :fal, #tsp = :tsp';
        primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
            '#rIO': 'relationIndexObj',
            '#b5': 'B5',
            '#tsp': 'timestamp',
        };
        primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
            ':fal': false,
            ':tsp': newTimestmap,
        };


        foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b4 = :fal, #tsp = :tsp';
        foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
            '#rIO': 'relationIndexObj',
            '#b4': 'B4',
            '#tsp': 'timestamp',
        };
        foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
            ':fal': false,
            ':tsp': newTimestmap,
        };

    } else if (removeAction === "delete_friend_request") {
        // in this case, we are not checking if user deleted an already sent request or cancelled an incoming request.
        // because anyways it will not affect the following/follower relation between users.


        if (!(oldRelationDoc.relationIndexObj.B3 === true || oldRelationDoc.relationIndexObj.B2 === true)) {
            return res.status(404).json('there is no pending friend request from either users');
        } else if (oldRelationDoc.relationIndexObj.B1 === true) {
            return res.status(404).json('users are already friends, what in the air are you deleting ?');
        }

        // no effect on counts of following and follower

        primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b2 = :fal, #rIO.#b3 = :fal, #tsp = :tsp';
        primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
            '#rIO': 'relationIndexObj',
            '#b3': 'B3',
            '#b2': 'B2',
            '#tsp': 'timestamp',
        };
        primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
            ':fal': false,
            ':tsp': newTimestmap,
        };

        foreignUserRelationDocUpdateQuery['UpdateExpression'] = primaryUserRelationDocUpdateQuery['UpdateExpression'];
        foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'];
        foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'];

        if (oldRelationDoc.requestId && oldRelationDoc.relationIndexObj.B2 === true) {
            // this is the case of deleting arrived friend request.
            primaryUserRelationDocUpdateQuery['UpdateExpression'] += ' remove #rq';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames']['#rq'] = 'requestId';


        } else if (oldRelationDoc.relationIndexObj.B3 === true) {
            // this is the case of deleting sent friend request.

            foreignUserRelationDocUpdateQuery['UpdateExpression'] += ' remove #rq';
            foreignUserRelationDocUpdateQuery['ExpressionAttributeNames']['#rq'] = 'requestId';

            // we don't have requestId in this case, for which we will query later. 
            // delete that notification then.
        }

    } else if (removeAction === "unfriend") {
        // unfriend and unfollow

        if (oldRelationDoc.relationIndexObj.B1 === false) {
            return res.status(404).json('there was no friendship between them');
        }

        // checking if user follows foreign user
        if (oldRelationDoc.relationIndexObj.B5 === true) {
            // decrementing follow/following count from corresponding user data.
            _primaryUserUpdateQuery["ExpressionAttributeValues"][":followingCounter"] = 1;

            _foreignUserUpdateQuery["ExpressionAttributeValues"][":followerCounter"] = 1;
        }


        _primaryUserUpdateQuery["ExpressionAttributeValues"][":friendCounter"] = 1;

        _foreignUserUpdateQuery["ExpressionAttributeValues"][":friendCounter"] = 1;



        primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b1 = :fal, #rIO.#b5 = :fal, #tsp = :tsp';
        primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
            '#rIO': 'relationIndexObj',
            '#b1': 'B1',
            '#b5': 'B5',
            '#tsp': 'timestamp',
        };
        primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
            ':fal': false,
            ':tsp': newTimestmap,
        };


        foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b1 = :fal, #rIO.#b4 = :fal, #tsp = :tsp';
        foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
            '#rIO': 'relationIndexObj',
            '#b1': 'B1',
            '#b4': 'B4',
            '#tsp': 'timestamp',
        };
        foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
            ':fal': false,
            ':tsp': newTimestmap,
        };
    }

    const _transactQuery = {
        TransactItems: [{
                Update: primaryUserRelationDocUpdateQuery
            },
            {
                Update: foreignUserRelationDocUpdateQuery
            },
        ]
    };

    // except for deleting friend request, count values can change for users.
    if (removeAction !== "delete_friend_request") {
        _transactQuery.TransactItems.push({
            Update: _primaryUserUpdateQuery
        });
        _transactQuery.TransactItems.push({
            Update: _foreignUserUpdateQuery
        });
    }

    dynamoClient.transactWrite(_transactQuery, async (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        } else {

            const _conditionalDeleteQuery = {
                TableName: tableName,
                ConditionExpression: '#rIO.#b1 = :fal and #rIO.#b2 = :fal and #rIO.#b3 = :fal and #rIO.#b4 = :fal and #rIO.#b5 = :fal',
                ExpressionAttributeNames: {
                    '#rIO': 'relationIndexObj',
                    '#b1': 'B1',
                    '#b2': 'B2',
                    '#b3': 'B3',
                    '#b4': 'B4',
                    '#b5': 'B5',
                },
                ExpressionAttributeValues: {
                    ':fal': false,
                }
            };

            const _deleteTransactQuery = {
                TransactItems: [{
                        Delete: {
                            ..._conditionalDeleteQuery,
                            Key: {
                                P_K: `USER#${userId}`,
                                S_K: `RELATION#${foreignUserId}`,
                            }
                        }
                    },
                    {
                        Delete: {
                            ..._conditionalDeleteQuery,
                            Key: {
                                P_K: `USER#${foreignUserId}`,
                                S_K: `RELATION#${userId}`,
                            }
                        }
                    }
                ]
            };

            if (removeAction === "delete_friend_request") {
                var _notificationDeleteQuery;
                if (oldRelationDoc.requestId) {
                    // this is the case of deleting arrived friend request.
                    _notificationDeleteQuery = {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${userId}`,
                            S_K: `NOTIFICATION#${oldRelationDoc.requestId}`,
                        },
                    };

                } else if (oldRelationDoc.relationIndexObj.B3 === true) {
                    // this is the case of deleting sent friend request.

                    const _requestIdQuery = {
                        TableName: tableName,
                        Key: {
                            P_K: `USER#${foreignUserId}`,
                            S_K: `RELATION#${userId}`
                        },
                        AttributesToGet: ['requestId'],
                    };

                    const _requestData = (await dynamoClient.get(_requestData).promise())['Item'];
                    if (_requestData) {
                        _notificationDeleteQuery = {
                            TableName: tableName,
                            Key: {
                                P_K: `USER#${foreignUserId}`,
                                S_K: `NOTIFICATION#${_requestData.requestId}`,
                            },
                        };
                    }
                }
                if (_notificationDeleteQuery) {
                    _deleteTransactQuery.TransactItems.push({
                        Delete: _notificationDeleteQuery
                    });
                }
            }

            await dynamoClient.transactWrite(_deleteTransactQuery, (err, data) => {
                if (err) console.log(err);
                else console.log('deletion attempt of relation documents for users', data);
            }).promise();

            return res.status(202).json(`${removeAction} successfull!`);
        }
    });


});

module.exports = router;