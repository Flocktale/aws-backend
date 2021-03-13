const {
    dynamoClient,
    myTable,
} = require('../config');
const Constants = require('../constants');


const {
    UserRelationSchemaWithDatabaseKeys
} = require('../Schemas/UserRelation');


const {
    sendAndSaveNotification
} = require('./notificationFunctions');
const {
    pushToWsMsgQueue
} = require('./sqsFunctions');




async function _getUserSummaryData(userId) {
    const userDocQuery = {
        TableName: myTable,
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

async function _fetchOldRelationDoc({
    userId,
    foreignUserId,
    AttributesToGet = ['primaryUser', 'relationIndexObj', 'requestId'],
}) {
    const oldRelationDocQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: AttributesToGet,
    };
    const oldRelationDoc = (await dynamoClient.get(oldRelationDocQuery).promise())['Item'];

    return oldRelationDoc;
}


async function acceptFriendRequest({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();


    const oldRelationDoc = await _fetchOldRelationDoc({
        userId: userId,
        foreignUserId: foreignUserId
    });


    if (!oldRelationDoc) {
        throw new Error('No relation exists between users');
    }


    const primaryUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`,
        },
        UpdateExpression: 'set #rIO.#b5 = :tr, #rIO.#b2 = :fal, #rIO.#b1 = :tr, #tsp = :tsp remove #rq',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b5': 'B5',
            '#b2': 'B2',
            '#b1': 'B1',
            '#tsp': 'timestamp',
            '#rq': 'requestId',
        },
        ExpressionAttributeValues: {
            ':tr': true,
            ':fal': false,
            ':tsp': newTimestmap,
        }
    };

    const foreignUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `RELATION#${userId}`,
        },
        UpdateExpression: 'set #rIO.#b4 = :tr, #rIO.#b3 = :fal, #rIO.#b1 = :tr, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b4': 'B4',
            '#b3': 'B3',
            '#b1': 'B1',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':tr': true,
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };


    const _primaryUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "Add friendsCount :friendCounter, followingCount :followingCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 1,
            ':followingCounter': 1, // default, in case of already following, it has to be changed to 0.
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },
        UpdateExpression: "ADD friendsCount :friendCounter, followerCount :followerCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 1,
            ':followerCounter': 1, // default, in case of already being followed, it has to be changed to 0.
        },
    };

    // user might already be following foreign user so we have to check for it (in case different than "follow" for which B5 is always false)
    if (oldRelationDoc.relationIndexObj.B5 === true) {
        //  user already follow, so no need to increment counts
        _primaryUserUpdateQuery['ExpressionAttributeValues'][':followingCounter'] = 0;
        _foreignUserUpdateQuery['ExpressionAttributeValues'][':followerCounter'] = 0;
    }


    // deleting notification (reference from requestId)
    const _notificationDeleteQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `NOTIFICATION#${oldRelationDoc.requestId}`,
        },
        ConditionExpression: `S_K = :sk`,
        ExpressionAttributeValues: {
            ':sk': `NOTIFICATION#${oldRelationDoc.requestId}`,
        },
    };

    const _transactQuery = {
        TransactItems: [{
                Update: primaryUserRelationDocUpdateQuery
            },
            {
                Update: foreignUserRelationDocUpdateQuery
            },
            {
                Update: _primaryUserUpdateQuery,
            },
            {
                Update: _foreignUserUpdateQuery,
            },
            {
                Delete: _notificationDeleteQuery,
            }
        ]
    };

    // preparing notification object to be sent to foreign user in context.
    const notificationObj = {
        userId: foreignUserId,
        data: {
            type: "FR#accepted",
            title: "You and " + oldRelationDoc.primaryUser.username + " are now bound in a great friendship pact.",
            avatar: Constants.UserAvatarUrl(userId),
            targetResourceId: userId,
            timestamp: Date.now(),
        },
    };


    return new Promise(async (resolve, reject) => {


        if (oldRelationDoc.relationIndexObj.B2 === false) {
            reject('there is no friend request to be accepted');
        } else if (oldRelationDoc.relationIndexObj.B1 === true) {
            reject('users are already friends, what in the air are you trying to accept ?');
        } else if (oldRelationDoc.relationIndexObj.B3 === true) {
            reject('you can not accept friend request you sent itself.');
        }

        try {

            await dynamoClient.transactWrite(_transactQuery).promise();

            const promises = [

                // handling notification part
                sendAndSaveNotification(notificationObj),

                // send updated social counters.
                pushToWsMsgQueue({
                    action: Constants.WsMsgQueueAction.postSocialCount,
                    MessageGroupId: userId,
                    attributes: {
                        userId1: userId,
                        userId2: foreignUserId
                    }
                })


            ];


            await Promise.all(promises);

            resolve('accept_friend_request successful');

        } catch (error) {
            reject(error);
        }

    });
}


async function sendFriendRequest({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();

    const _transactQuery = {
        TransactItems: [],
    };


    // preparing notification object to be sent to foreign user in context.
    const notificationObj = {
        userId: foreignUserId,
        data: {
            type: "FR#new",
            title: "undefined",
            avatar: Constants.UserAvatarUrl(userId),
            targetResourceId: userId,
            timestamp: Date.now(),
        },
    };


    const oldRelationDoc = await _fetchOldRelationDoc({
        userId: userId,
        foreignUserId: foreignUserId
    });


    const _primaryUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "ADD followingCount :followingCounter",
        ExpressionAttributeValues: {
            ':followingCounter': 1, // default, in case of already following, it has to be changed to 0.
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },

        UpdateExpression: "ADD followerCount :followerCounter",
        ExpressionAttributeValues: {
            ':followerCounter': 1, // default, in case of already being followed, it has to be changed to 0.
        },
    };

    if (oldRelationDoc) {

        notificationObj.data.title = oldRelationDoc.primaryUser.username + " would like to be your friend.";


        // user might already be following foreign user so we have to check for it (in case different than "follow" for which B5 is always false)
        if (oldRelationDoc.relationIndexObj.B5 === true) {
            //  user already follow, so no need to increment counts
            _primaryUserUpdateQuery['ExpressionAttributeValues'][':followingCounter'] = 0;
            _foreignUserUpdateQuery['ExpressionAttributeValues'][':followerCounter'] = 0;
        }


        const primaryUserRelationDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `RELATION#${foreignUserId}`,
            },
            UpdateExpression: 'set #rIO.#b5 = :tr, #rIO.#b3 = :tr, #tsp = :tsp ',
            ExpressionAttributeNames: {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b3': 'B3',
                '#tsp': 'timestamp',
            },
            ExpressionAttributeValues: {
                ':tr': true,
                ':tsp': newTimestmap,
            }
        };

        const foreignUserRelationDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${foreignUserId}`,
                S_K: `RELATION#${userId}`,
            },
            UpdateExpression: 'set #rIO.#b4 = :tr, #rIO.#b2 = :tr, #tsp = :tsp ',
            ExpressionAttributeNames: {
                '#rIO': 'relationIndexObj',
                '#b4': 'B4',
                '#b2': 'B2',
                '#tsp': 'timestamp',
            },
            ExpressionAttributeValues: {
                ':tr': true,
                ':tsp': newTimestmap,
            },
        };

        _transactQuery.TransactItems.push({
            Update: primaryUserRelationDocUpdateQuery
        });

        _transactQuery.TransactItems.push({
            Update: foreignUserRelationDocUpdateQuery
        });

    } else {

        // it is a brand new relation :)

        var primaryUser, foreignUser;

        await Promise.all([_getUserSummaryData(userId), _getUserSummaryData(foreignUserId)]).then((users) => {
            primaryUser = users[0];
            foreignUser = users[1];
        });

        notificationObj.data.title = primaryUser.username + " would like to be your friend.";

        var newPrimaryUserRelationDoc, newForeignUserRelationDoc;

        await Promise.all([_prepareNewRelationDoc(primaryUser, foreignUser, newTimestmap), _prepareNewRelationDoc(foreignUser, primaryUser, newTimestmap)])
            .then((relationDocs) => {
                newPrimaryUserRelationDoc = relationDocs[0];
                newForeignUserRelationDoc = relationDocs[1];
            })

        if (!newPrimaryUserRelationDoc || !newForeignUserRelationDoc) {
            throw new Error('internal server issue, please check the logs');
        }

        newPrimaryUserRelationDoc["relationIndexObj"]["B5"] = true;
        newPrimaryUserRelationDoc["relationIndexObj"]["B3"] = true;

        newForeignUserRelationDoc["relationIndexObj"]["B4"] = true;
        newForeignUserRelationDoc["relationIndexObj"]["B2"] = true;


        const newPrimaryUserRelationDocQuery = {
            TableName: myTable,
            Item: newPrimaryUserRelationDoc
        }

        const newForeignUserRelationDocQuery = {
            TableName: myTable,
            Item: newForeignUserRelationDoc
        }

        _transactQuery.TransactItems.push({
            Put: newPrimaryUserRelationDocQuery
        });
        _transactQuery.TransactItems.push({
            Put: newForeignUserRelationDocQuery
        });

    }


    _transactQuery.TransactItems.push({
        Update: _primaryUserUpdateQuery,
    });

    _transactQuery.TransactItems.push({
        Update: _foreignUserUpdateQuery,
    });



    return new Promise(async (resolve, reject) => {

        if (oldRelationDoc) {
            if (oldRelationDoc.relationIndexObj.B3 === true) {
                reject('there is already a pending friend request');
            } else if (oldRelationDoc.relationIndexObj.B2 === true) {
                reject('can not send friend request when you already have one incoming');
            } else if (oldRelationDoc.relationIndexObj.B1 === true) {
                reject('users are already friends, why sending friend request ?');
            }
        }

        try {
            await dynamoClient.transactWrite(_transactQuery).promise()

            const promises = [];

            // handling notification part
            const notifPromise = sendAndSaveNotification(notificationObj, async ({
                notificationId,
                type
            }) => {

                // this is the case of new friend request. (send_friend_request)
                // saving notificationId in user relation doc of foreign user.

                const _requestIdUpdateQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `USER#${foreignUserId}`,
                        S_K: `RELATION#${userId}`
                    },
                    UpdateExpression: 'SET #rq = :rq',
                    ExpressionAttributeNames: {
                        '#rq': 'requestId',
                    },
                    ExpressionAttributeValues: {
                        ':rq': notificationId,
                    },
                };

                await dynamoClient.update(_requestIdUpdateQuery).promise();
            });

            promises.push(notifPromise);

            // send updated social counters.
            promises.push(pushToWsMsgQueue({
                action: Constants.WsMsgQueueAction.postSocialCount,
                MessageGroupId: userId,
                attributes: {
                    userId1: userId,
                    userId2: foreignUserId
                }
            }));



            await Promise.all(promises);

            resolve('send_friend_request successful');

        } catch (error) {
            reject(error);
        }

    });

}

async function followUser({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();

    const _transactQuery = {
        TransactItems: [],
    };

    // preparing notification object to be sent to foreign user in context.
    const notificationObj = {
        userId: foreignUserId,
        data: {
            type: "FLW#new",
            title: "undefined",
            avatar: Constants.UserAvatarUrl(userId),
            targetResourceId: userId,
            timestamp: Date.now(),
        },
    };



    const oldRelationDoc = await _fetchOldRelationDoc({
        userId: userId,
        foreignUserId: foreignUserId
    });



    const _primaryUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "ADD followingCount :followingCounter",
        ExpressionAttributeValues: {
            ':followingCounter': 1,
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },

        UpdateExpression: "ADD followerCount :followerCounter",
        ExpressionAttributeValues: {
            ':followerCounter': 1,
        },
    };

    if (oldRelationDoc) {

        notificationObj.data.title = oldRelationDoc.primaryUser.username + " has started following you.";


        const primaryUserRelationDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `RELATION#${foreignUserId}`,
            },
            UpdateExpression: 'set #rIO.#b5 = :tr, #tsp = :tsp',
            ExpressionAttributeNames: {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#tsp': 'timestamp',
            },
            ExpressionAttributeValues: {
                ':tr': true,
                ':tsp': newTimestmap,
            },
        };

        const foreignUserRelationDocUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${foreignUserId}`,
                S_K: `RELATION#${userId}`,
            },

            UpdateExpression: 'set #rIO.#b4 = :tr, #tsp = :tsp',
            ExpressionAttributeNames: {
                '#rIO': 'relationIndexObj',
                '#b4': 'B4',
                '#tsp': 'timestamp',
            },
            ExpressionAttributeValues: {
                ':tr': true,
                ':tsp': newTimestmap,
            },
        };

        _transactQuery.TransactItems.push({
            Update: primaryUserRelationDocUpdateQuery
        });
        _transactQuery.TransactItems.push({
            Update: foreignUserRelationDocUpdateQuery
        });

    } else {

        // it is a brand new relation :)
        var primaryUser, foreignUser;

        await Promise.all([_getUserSummaryData(userId), _getUserSummaryData(foreignUserId)]).then((users) => {
            primaryUser = users[0];
            foreignUser = users[1];
        });


        notificationObj.data.title = primaryUser.username + " has started following you.";

        var newPrimaryUserRelationDoc, newForeignUserRelationDoc;

        await Promise.all([_prepareNewRelationDoc(primaryUser, foreignUser, newTimestmap), _prepareNewRelationDoc(foreignUser, primaryUser, newTimestmap)])
            .then((relationDocs) => {
                newPrimaryUserRelationDoc = relationDocs[0];
                newForeignUserRelationDoc = relationDocs[1];
            })

        if (!newPrimaryUserRelationDoc || !newForeignUserRelationDoc) {
            throw new Error('internal server issue, please check the logs');
        }

        newPrimaryUserRelationDoc["relationIndexObj"]["B5"] = true;
        newForeignUserRelationDoc["relationIndexObj"]["B4"] = true;



        const newPrimaryUserRelationDocQuery = {
            TableName: myTable,
            Item: newPrimaryUserRelationDoc
        }

        const newForeignUserRelationDocQuery = {
            TableName: myTable,
            Item: newForeignUserRelationDoc
        }

        _transactQuery.TransactItems.push({
            Put: newPrimaryUserRelationDocQuery
        });
        _transactQuery.TransactItems.push({
            Put: newForeignUserRelationDocQuery
        });

    }

    _transactQuery.TransactItems.push({
        Update: _primaryUserUpdateQuery,
    });

    _transactQuery.TransactItems.push({
        Update: _foreignUserUpdateQuery,
    });


    return new Promise(async (resolve, reject) => {
        if (oldRelationDoc) {
            if (oldRelationDoc.relationIndexObj.B5 === true) {
                reject('user is already following user');
            }
        }


        try {
            await dynamoClient.transactWrite(_transactQuery).promise();

            const promises = [

                // handling notification part
                sendAndSaveNotification(notificationObj),


                // send updated social counters.
                pushToWsMsgQueue({
                    action: Constants.WsMsgQueueAction.postSocialCount,
                    MessageGroupId: userId,
                    attributes: {
                        userId1: userId,
                        userId2: foreignUserId
                    }
                })
            ];

            await Promise.all(promises);


            resolve('follow successful');

        } catch (error) {
            reject(error);
        }

    });

}

module.exports = {
    acceptFriendRequest,
    sendFriendRequest,
    followUser
};