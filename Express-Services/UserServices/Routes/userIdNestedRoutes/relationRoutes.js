const router = require('express').Router();
const Joi = require('joi');

const { UserRelationSchemaWithDatabaseKeys } = require('../../Schemas/UserRelation');

const { usernameSortIndex, timestampSortIndex, dynamoClient, tableName } = require('../../config');


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

    if (socialRelation === "followings") { bitChecker = 'B5'; }
    else if (socialRelation === "followers") { bitChecker = 'B4'; }
    else if (socialRelation === "requests_sent") { bitChecker = 'B3'; }
    else if (socialRelation === "requests_received") { bitChecker = 'B2'; }
    else if (socialRelation === "friends") { bitChecker = 'B1'; }
    else {
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
                AttributeValueList: [{ bitChecker: true }]

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
                socialRelation: data["Items"],
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

    const addAction = req.query.action;

    try {
        await Joi.string().required().validateAsync(foreignUserId);
        await Joi.string().valid("follow", "send_friend_request", "accept_friend_request").required().validateAsync(addAction);
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
    };
    let oldRelationDoc;
    try {
        oldRelationDoc = (await dynamoClient.get(oldRelationDocQuery).promise())['Item'];
    } catch (error) {
        console.log('no old doc exists for this request hence this is a new relation');
    }

    let _transactQuery;

    if (oldRelationDoc) {
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

        }
        else if (addAction === "accept_friend_request") {
            primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #rIO.#b4 = :fal, #rIO.#b1 = :tr, #tsp = :tsp  ';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b4': 'B4',
                '#b1': 'B1',
                '#tsp': 'timestamp',
            };
            primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':fal': false,
                ':tsp': newTimestmap,
            };

            foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #rIO.#b3 = :fal, #rIO.#b2 = :tr, #tsp = :tsp  ';
            foreignUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b3': 'B3',
                '#b2': 'B2',
                '#tsp': 'timestamp',
            };
            foreignUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':fal': false,
                ':tsp': newTimestmap,
            };
        }

        _transactQuery = {
            TransactItems:
                [
                    { Update: primaryUserRelationDocUpdateQuery },
                    { Update: foreignUserRelationDocUpdateQuery },
                ]
        };

    } else {
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
            newPrimaryUserRelationDoc["relationIndexObj"]["B5"] = true;

            newForeignUserRelationDoc["relationIndexObj"]["B4"] = true;
        }
        else if (addAction === "send_friend_request") {
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
            TransactItems: [
                { Put: newPrimaryUserRelationDocQuery },
                { Put: newForeignUserRelationDocQuery },
            ]
        };

    }

    dynamoClient.transactWrite(_transactQuery, (err, data) => {
        if (err) {
            console.log(err);
            res.status(404).json(err);
        } else {
            res.status(202).json(`${addAction} successfull!`);
        }
    });


});

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

    const removeAction = req.query.action;

    try {
        await Joi.string().required().validateAsync(foreignUserId);
        await Joi.string().valid("unfollow", "delete_friend_request", "unfriend").required().validateAsync(removeAction);
    } catch (error) {
        res.status(400).json(error);
        return;
    }
    const newTimestmap = Date.now();

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

        primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b3 = :fal, #rIO.#b2 = :fal, #tsp = :tsp';
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
        TransactItems: [
            { Update: primaryUserRelationDocUpdateQuery },
            { Update: foreignUserRelationDocUpdateQuery },
        ]
    };

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
                TransactItems: [
                    {
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
