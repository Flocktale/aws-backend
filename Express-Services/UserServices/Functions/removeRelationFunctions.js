const {
    dynamoClient,
    myTable,
} = require('../config');
const {
    postSocialCountToBothUser
} = require('./websocketFunctions');



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

async function _relationDocConditionalDeleteTransaction({
    userId,
    foreignUserId
}) {

    const _conditionalDeleteQuery = {
        TableName: myTable,
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

    const _transactDeleteQuery = {
        TransactItems: [{
                Delete: {
                    ..._conditionalDeleteQuery,
                    Key: {
                        P_K: `USER#${userId}`,
                        S_K: `RELATION#${foreignUserId}`,
                    },
                }
            },
            {
                Delete: {
                    ..._conditionalDeleteQuery,
                    Key: {
                        P_K: `USER#${foreignUserId}`,
                        S_K: `RELATION#${userId}`,
                    },
                },
            }
        ],
    };

    try {
        await dynamoClient.transactWrite(_transactDeleteQuery).promise();

    } catch (error) {
        console.log('conditional delete relation doc transaction failed: ', error);
    }



}




async function deleteFriendRequest({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();

    const _transactQuery = {
        TransactItems: []
    };


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
        UpdateExpression: 'set #rIO.#b2 = :fal, #rIO.#b3 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b3': 'B3',
            '#b2': 'B2',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };

    const foreignUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `RELATION#${userId}`,
        },
        UpdateExpression: 'set #rIO.#b2 = :fal, #rIO.#b3 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b3': 'B3',
            '#b2': 'B2',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };

    if (oldRelationDoc.requestId && oldRelationDoc.relationIndexObj.B2 === true) {
        // this is the case of deleting arrived friend request.
        primaryUserRelationDocUpdateQuery['UpdateExpression'] += ' remove #rq';
        primaryUserRelationDocUpdateQuery['ExpressionAttributeNames']['#rq'] = 'requestId';


        // deleting the notification
        const _notificationDeleteQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `NOTIFICATION#${oldRelationDoc.requestId}`,
            },
        };

        _transactQuery.TransactItems.push({
            Delete: _notificationDeleteQuery
        });

    } else if (oldRelationDoc.relationIndexObj.B3 === true) {
        // this is the case of deleting sent friend request.

        foreignUserRelationDocUpdateQuery['UpdateExpression'] += ' remove #rq';
        foreignUserRelationDocUpdateQuery['ExpressionAttributeNames']['#rq'] = 'requestId';

        // we don't have requestId in this case, for which we will query now.

        const _requestIdQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${foreignUserId}`,
                S_K: `RELATION#${userId}`
            },
            AttributesToGet: ['requestId'],
        };

        const _requestData = (await dynamoClient.get(_requestIdQuery).promise())['Item'];

        if (_requestData) {
            const _notificationDeleteQuery = {
                TableName: myTable,
                Key: {
                    P_K: `USER#${foreignUserId}`,
                    S_K: `NOTIFICATION#${_requestData.requestId}`,
                },
            };

            _transactQuery.TransactItems.push({
                Delete: _notificationDeleteQuery
            });

        }

    }

    _transactQuery.TransactItems.push({
        Update: primaryUserRelationDocUpdateQuery
    });
    _transactQuery.TransactItems.push({
        Update: foreignUserRelationDocUpdateQuery
    });




    return new Promise(async (resolve, reject) => {

        if (!(oldRelationDoc.relationIndexObj.B3 === true || oldRelationDoc.relationIndexObj.B2 === true)) {
            reject('there is no pending friend request from either users');
        } else if (oldRelationDoc.relationIndexObj.B1 === true) {
            reject('users are already friends, what in the air are you deleting ?');
        }

        try {
            await dynamoClient.transactWrite(_transactQuery).promise();


            // deletion of relation doc itself after updation (if condition satisfies)
            await _relationDocConditionalDeleteTransaction({
                userId: userId,
                foreignUserId: foreignUserId
            });

            resolve('delete_friend_request successful');
        } catch (error) {
            reject(error);
        }

    });

}


/// unfriend and unfollow
async function unfriendUser({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();

    const _transactQuery = {
        TransactItems: []
    };


    const oldRelationDoc = await _fetchOldRelationDoc({
        userId: userId,
        foreignUserId: foreignUserId
    });

    if (!oldRelationDoc) {
        throw new Error('No relation exists between users');
    }

    const _primaryUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "SET friendsCount = friendsCount - :friendCounter, followingCount = followingCount - :followingCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 1,
            ':followingCounter': 0,
        },
    };

    const _foreignUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `USERMETA#${foreignUserId}`
        },

        UpdateExpression: "SET friendsCount = friendsCount - :friendCounter, followerCount = followerCount - :followerCounter",
        ExpressionAttributeValues: {
            ':friendCounter': 1,
            ':followerCounter': 0,
        },
    };

    // checking if user follows foreign user
    if (oldRelationDoc.relationIndexObj.B5 === true) {
        // decrementing follow/following count from corresponding user data.
        _primaryUserUpdateQuery["ExpressionAttributeValues"][":followingCounter"] = 1;

        _foreignUserUpdateQuery["ExpressionAttributeValues"][":followerCounter"] = 1;
    }

    _transactQuery.TransactItems.push({
        Update: _primaryUserUpdateQuery
    });
    _transactQuery.TransactItems.push({
        Update: _foreignUserUpdateQuery
    });



    const primaryUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`,
        },
        UpdateExpression: 'set #rIO.#b1 = :fal, #rIO.#b5 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b1': 'B1',
            '#b5': 'B5',
            '#tsp': 'timestamp',

        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };

    const foreignUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `RELATION#${userId}`,
        },
        UpdateExpression: 'set #rIO.#b1 = :fal, #rIO.#b4 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b1': 'B1',
            '#b4': 'B4',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };


    _transactQuery.TransactItems.push({
        Update: primaryUserRelationDocUpdateQuery
    });
    _transactQuery.TransactItems.push({
        Update: foreignUserRelationDocUpdateQuery
    });





    return new Promise(async (resolve, reject) => {

        if (oldRelationDoc.relationIndexObj.B1 === false) {
            return reject('there was no friendship between them');
        }

        try {
            await dynamoClient.transactWrite(_transactQuery).promise();


            // deletion of relation doc itself after updation (if condition satisfies)
            await _relationDocConditionalDeleteTransaction({
                userId: userId,
                foreignUserId: foreignUserId
            });

            // send updated social counters.
            await postSocialCountToBothUser({
                userId1: userId,
                userId2: foreignUserId
            });



            resolve('unfriend successful');
        } catch (error) {
            reject(error);
        }

    });

}

async function unfollowUser({
    userId,
    foreignUserId
}) {

    const newTimestmap = Date.now();

    const _transactQuery = {
        TransactItems: []
    };


    const oldRelationDoc = await _fetchOldRelationDoc({
        userId: userId,
        foreignUserId: foreignUserId
    });

    if (!oldRelationDoc) {
        throw new Error('No relation exists between users');
    }

    const _primaryUserUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        UpdateExpression: "SET followingCount = followingCount - :followingCounter",
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

        UpdateExpression: "SET followerCount = followerCount - :followerCounter",
        ExpressionAttributeValues: {
            ':followerCounter': 1,
        },
    };

    _transactQuery.TransactItems.push({
        Update: _primaryUserUpdateQuery
    });
    _transactQuery.TransactItems.push({
        Update: _foreignUserUpdateQuery
    });



    const primaryUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`,
        },
        UpdateExpression: 'set #rIO.#b5 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b5': 'B5',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };

    const foreignUserRelationDocUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${foreignUserId}`,
            S_K: `RELATION#${userId}`,
        },
        UpdateExpression: 'set #rIO.#b4 = :fal, #tsp = :tsp',
        ExpressionAttributeNames: {
            '#rIO': 'relationIndexObj',
            '#b4': 'B4',
            '#tsp': 'timestamp',
        },
        ExpressionAttributeValues: {
            ':fal': false,
            ':tsp': newTimestmap,
        },
    };


    _transactQuery.TransactItems.push({
        Update: primaryUserRelationDocUpdateQuery
    });
    _transactQuery.TransactItems.push({
        Update: foreignUserRelationDocUpdateQuery
    });





    return new Promise(async (resolve, reject) => {

        if (oldRelationDoc.relationIndexObj.B5 === false) {
            return reject('no follow exists to unfollow');
        }

        try {
            await dynamoClient.transactWrite(_transactQuery).promise();

            // deletion of relation doc itself after updation (if condition satisfies)
            await _relationDocConditionalDeleteTransaction({
                userId: userId,
                foreignUserId: foreignUserId
            });

            // send updated social counters.
            await postSocialCountToBothUser({
                userId1: userId,
                userId2: foreignUserId
            });

            resolve('unfollow successful');
        } catch (error) {
            reject(error);
        }

    });


}

module.exports = {
    deleteFriendRequest,
    unfriendUser,
    unfollowUser,
};