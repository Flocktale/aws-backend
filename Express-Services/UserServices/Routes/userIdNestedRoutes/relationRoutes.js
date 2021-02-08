const router = require('express').Router();
const Joi = require('joi');

const {
    UserRelationSchemaWithDatabaseKeys
} = require('../../Schemas/UserRelation');

const {
    NotificationSchemaWithDatabaseKeys
} = require('../../Schemas/notificationSchema')

const {
    usernameSortIndex,
    timestampSortIndex,
    dynamoClient,
    tableName,
    sns
} = require('../../config');


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
    const query = {
        TableName: tableName,
        AttributesToGet: [
            'foreignUser', 'relationIndexObj', 'timestamp'
        ],
        QueryFilter: {
            'relationIndexObj': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [{
                    bitChecker: true
                }]

            },
        },
        ScanIndexForward: false,
        Limit: 10,
        ReturnConsumedCapacity: "INDEXES"
    };


    if (req.query.sortby === 'username') {
        query["IndexName"] = usernameSortIndex;

        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "UsernameSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['RELATION-SORT-USERNAME#']
            },
        };

    } else {
        query["IndexName"] = timestampSortIndex;

        query["KeyConditions"] = {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`USER#${userId}`]
            },
            "TimestampSortField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": ['RELATION-SORT-TIMESTAMP#']
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
                'users': data["Items"],
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

    // preparing notification object to be sent to foreign user in context.
    var notificationObj = {
        userId: foreignUserId,
        data: {
            type: "undefined",
            title: "undefined",
            avatar: `https://mootclub-public.s3.amazonaws.com/userAvatar/${foreignUserId}`,
            targetResourceId: userId,
            timestamp: Date.now(),
        },
    };

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

    const _primaryUserUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "SET friendsCount = friendsCount + :friendCounter, followingCount = followingCount + :followingCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 0,
            ':followingCounter': 1, // default, in case of already following, it has to be changed to 0.
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },

        UpdateExpression: "SET friendsCount = friendsCount + :friendCounter, followerCount = followerCount + :followerCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 0,
            ':followerCounter': 1, // default, in case of already being followed, it has to be changed to 0.
        },
    };

    if (addAction === "accept_friend_request") {

        _primaryUserUpdateQuery['ExpressionAttributeValues'][':friendCounter'] = 1;
        _foreignUserUpdateQuery['ExpressionAttributeValues'][':friendCounter'] = 1;

    }


    const oldRelationDocQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: ['primaryUser', 'relationIndexObj'], // primary user to get username for notification, relationIndexObj for conditions
    };
    let oldRelationDoc;
    try {
        oldRelationDoc = (await dynamoClient.get(oldRelationDocQuery).promise())['Item'];
    } catch (error) {
        console.log('no old doc exists for this request hence this is a new relation');
    }

    let _transactQuery;

    if (oldRelationDoc) {

        // user might already be following foreign user so we have to check for it (in case different than "follow" for which B5 is always false)
        if (oldRelationDoc.relationIndexObj.B5 === true) {
            //  user already follow, so no need to increment counts
            _primaryUserUpdateQuery['ExpressionAttributeValues'][':followingCounter'] = 0;

            _foreignUserUpdateQuery['ExpressionAttributeValues'][':followerCounter'] = 0;

        }


        const newTimestmap = Date.now();

        const primaryUserRelationDocUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `RELATION#${foreignUserId}`,
            },
        }

        const foreignUserRelationDocUpdateQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${foreignUserId}`,
                S_K: `RELATION#${userId}`,
            },
        }


        if (addAction === "follow") {

            if (oldRelationDoc.relationIndexObj.B5 === true) {
                return res.status(404).json('user is already following user');
            }

            notificationObj.data.type = "FLW#new";
            notificationObj.data.title = oldRelationDoc.primaryUser.username + " has started following you.";



            primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #tsp = :tsp';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#tsp': 'timestamp',
            };
            primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':tsp': newTimestmap,
            };



            foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b4 = :tr, #tsp = :tsp ';
            foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b4': 'B4',
                '#tsp': 'timestamp',
            };
            foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':tsp': newTimestmap,
            };


        } else if (addAction === "send_friend_request") {

            if (oldRelationDoc.relationIndexObj.B3 === true) {
                return res.status(404).json('there is already a pending friend request');
            } else if (oldRelationDoc.relationIndexObj.B2 === true) {
                return res.status(404).json('can not send friend request when you already have one incoming');
            } else if (oldRelationDoc.relationIndexObj.B1 === true) {
                return res.status(404).json('users are already friends, why sending friend request ?');
            }


            notificationObj.data.type = "FR#new";
            notificationObj.data.title = oldRelationDoc.primaryUser.username + " would like to be your friend.";



            primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #rIO.#b3 = :tr, #tsp = :tsp  ';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b3': 'B3',
                '#tsp': 'timestamp',
            };
            primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':tsp': newTimestmap,
            };



            foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b4 = :tr, #rIO.#b2 = :tr, #tsp = :tsp  ';
            foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b4': 'B4',
                '#b2': 'B2',
                '#tsp': 'timestamp',
            };
            foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':tsp': newTimestmap,
            };

        } else if (addAction === "accept_friend_request") {

            if (oldRelationDoc.relationIndexObj.B2 === false) {
                return res.status(404).json('there is no friend request to be accepted');
            } else if (oldRelationDoc.relationIndexObj.B1 === true) {
                return res.status(404).json('users are already friends, what in the air are you trying to accept ?');
            }


            notificationObj.data.type = "FR#accepted";
            notificationObj.data.title = "You and " + oldRelationDoc.primaryUser.username + " are now bound in a great friendship pact.";


            primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #rIO.#b2 = :fal, #rIO.#b1 = :tr, #tsp = :tsp  ';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b2': 'B2',
                '#b1': 'B1',
                '#tsp': 'timestamp',
            };
            primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':fal': false,
                ':tsp': newTimestmap,
            };

            foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b4 = :tr, #rIO.#b3 = :fal, #rIO.#b1 = :tr, #tsp = :tsp  ';
            foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b4': 'B4',
                '#b3': 'B3',
                '#b1': 'B1',
                '#tsp': 'timestamp',
            };
            foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':fal': false,
                ':tsp': newTimestmap,
            };
        }

        _transactQuery = {
            TransactItems: [{
                    Update: primaryUserRelationDocUpdateQuery
                },
                {
                    Update: foreignUserRelationDocUpdateQuery
                },
            ]
        };

    } else {

        // since it is a brand new relation, so using default update queries for incrementing follow/following/friend counters. 


        const primaryUser = await _getUserSummaryData(userId);
        const foreignUser = await _getUserSummaryData(foreignUserId);
        const newTimestmap = Date.now();

        const newPrimaryUserRelationDoc = await _prepareNewRelationDoc(primaryUser, foreignUser, newTimestmap);
        const newForeignUserRelationDoc = await _prepareNewRelationDoc(foreignUser, primaryUser, newTimestmap);

        if (!newPrimaryUserRelationDoc || !newForeignUserRelationDoc) {
            res.status(500).json('internal server issue, please check the logs');
            return;
        }
        if (addAction === "follow") {
            notificationObj.data.type = "FLW#new";
            notificationObj.data.title = primaryUser.username + " has started following you.";

            newPrimaryUserRelationDoc["relationIndexObj"]["B5"] = true;

            newForeignUserRelationDoc["relationIndexObj"]["B4"] = true;

        } else if (addAction === "send_friend_request") {

            notificationObj.data.type = "FR#new";
            notificationObj.data.title = primaryUser.username + " would like to be your friend.";

            newPrimaryUserRelationDoc["relationIndexObj"]["B5"] = true;
            newPrimaryUserRelationDoc["relationIndexObj"]["B3"] = true;

            newForeignUserRelationDoc["relationIndexObj"]["B4"] = true;
            newForeignUserRelationDoc["relationIndexObj"]["B2"] = true;
        }
        // in case of accepting friend request, oldRelationDoc != null 

        const newPrimaryUserRelationDocQuery = {
            TableName: tableName,
            Item: newPrimaryUserRelationDoc
        }

        const newForeignUserRelationDocQuery = {
            TableName: tableName,
            Item: newForeignUserRelationDoc
        }

        _transactQuery = {
            TransactItems: [{
                    Put: newPrimaryUserRelationDocQuery
                },
                {
                    Put: newForeignUserRelationDocQuery
                },
            ]
        };

    }

    _transactQuery.TransactItems.push({
        Update: _primaryUserUpdateQuery,
    });

    _transactQuery.TransactItems.push({
        Update: _foreignUserUpdateQuery,
    });

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        } else {

            // handling notification part
            _sendAndSaveNotification(notificationObj);

            res.status(202).json(`${addAction} successfull!`);
        }
    });


});

async function _sendAndSaveNotification(notificationObj) {
    if (!notificationObj) {
        console.log('no notificationObj was passed when _sendAndSaveNotification was called');
        return;
    }

    // first saving the notification in database.

    const notifData = await NotificationSchemaWithDatabaseKeys.validateAsync(notificationObj);

    const _notificationPutQuery = {
        TableName: tableName,
        Item: notifData,
    }

    await dynamoClient.put(_notificationPutQuery).promise();


    // fetching endpoint arn to publish notification.

    const _endpointQuery = {
        TableName: tableName,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${notifData.userId}`,
        },
        AttributesToGet: ['endpointArn'],
    };

    const endpointData = (await dynamoClient.get(_endpointQuery).promise())['Item'];

    if (!endpointData) {
        return console.log('no device token is registered for userId: ', notifData.userId);
    }

    // now publishing to push notification via sns.

    const snsPushNotificationObj = {
        GCM: JSON.stringify({
            notification: {
                title: notifData.data.title,
                image: notifData.data.avatar,
                sound: "default",
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                priority: 'high',
            },
        }),
    };


    var notifParams = {
        Message: JSON.stringify(snsPushNotificationObj),
        MessageStructure: 'json',
        TargetArn: endpointData.endpointArn,
    };

    await sns.publish(notifParams).promise();

}

async function _getUserSummaryData(userId) {
    const userDocQuery = {
        TableName: tableName,
        AttributesToGet: ['userId', 'username', 'avatar', 'name'],
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
    };
    try {
        const userDoc = (await dynamoClient.get(userDocQuery).promise())['Item'];

        return userDoc;
    } catch (error) {
        console.log('error in fetch user summary: ', error);
        return null;
    }
}

async function _prepareNewRelationDoc(primaryUser, foreignUser, timestamp) {
    if (!primaryUser || !foreignUser) {
        console.log("can't fetch either primary user: ", primaryUser, " or foreign user: ", foreignUser);
        return null;
    }

    try {
        const result = await UserRelationSchemaWithDatabaseKeys.validateAsync({
            primaryUser: primaryUser,
            foreignUser: foreignUser,
            timestamp: timestamp,
            relationIndexObj: {},
        });
        return result;
    } catch (error) {
        console.log(error);
        return null;
    }
}



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
        AttributesToGet: ['relationIndexObj'],
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

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
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

            dynamoClient.transactWrite(_deleteTransactQuery, (err, data) => {
                if (err) console.log(err);
                else console.log('deletion attempt of relation documents for users', data);
            });

            res.status(202).json(`${removeAction} successfull!`);
        }
    });


});

module.exports = router;