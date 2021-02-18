const router = require('express').Router();


const {
    dynamoClient,
    tableName,
    sns,
    timestampSortIndex,
} = require('../../config');

const {
    SNSEndpointSchemaWithDatabaseKeys
} = require('../../Schemas/snsEndpointSchema');

const {
    postParticipantListToWebsocketUsers
} = require('../../Functions/websocketFunctions');

const {
    sendAndSaveNotification
} = require('../../Functions/notificationFunctions');

// required
// body - {"deviceToken"}
router.post("/device-token", async (req, res) => {
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
        AttributesToGet: ['deviceToken', 'endpointArn'],
    }
    var oldDeviceToken, oldEndpoint;
    try {
        const oldData = (await dynamoClient.get(_tokenQuery).promise())['Item'];
        if (oldData) {
            oldDeviceToken = oldData['deviceToken'];
            oldEndpoint = oldData['endpointArn'];
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

        // if this user already had a platform endpoint then delete it first.
        if (oldEndpoint) {
            await sns.deleteEndpoint({
                EndpointArn: oldEndpoint
            }).promise();
        }


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

router.delete("/device-token", async (req, res) => {
    const userId = req.userId;

    const _tokenDeleteQuery = {
        TableName: tableName,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${userId}`
        },
        ReturnValues: 'ALL_OLD',
    }
    try {
        const oldData = (await dynamoClient.delete(_tokenDeleteQuery).promise())['Attributes'];
        if (oldData) {
            const oldEndpoint = oldData['endpointArn'];
            await sns.deleteEndpoint({
                EndpointArn: oldEndpoint
            }).promise();

        }

        return res.status(201).json('Token deleted successfully');

    } catch (error) {
        console.log('error while fetching/deleting old token data: ', error);
        return res.status(400).json('error while deleting token');
    }

});



// required
// headers - "lastevaluatedkey"  (optional)
router.get("/", async (req, res) => {
    const userId = req.userId;
    const query = {
        TableName: tableName,
        IndexName: timestampSortIndex,
        KeyConditions: {
            'P_K': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [`USER#${userId}`]
            },
            'TimestampSortField': {
                ComparisonOperator: 'BEGINS_WITH',
                AttributeValueList: [`NOTIF-SORT-TIMESTAMP#`]
            }
        },
        AttributesToGet: ['notificationId', 'data'],
        ScanIndexForward: false,
        Limit: 20,

    }
    if (req.headers.lastevaluatedkey) {
        query['ExclusiveStartKey'] = JSON.parse(req.headers.lastevaluatedkey);
    }

    try {

        const notifData = (await dynamoClient.query(query).promise())['Items'];
        if (notifData) {
            const notifList = notifData.map(({
                notificationId,
                data
            }) => {
                return {
                    notificationId: notificationId,
                    ...data
                };
            });

            return res.status(200).json({
                notifications: notifList,
                lastevaluatedkey: notifData['LastEvaluatedKey'],
            });
        } else {
            return res.status(200).json({
                notifications: [],
            });
        }

    } catch (error) {
        console.log('error while fetching notifications list : ', error);
        return res.status(404).json('error in fetching notifications');
    }

});



// required
// query parameters - 
///     "notificationId"
///     "action" (valid values are "accept","cancel") (required in case of club invitation type and friend request)
router.post("/opened", async (req, res) => {
    const userId = req.userId;
    const notificationId = req.query.notificationId;
    const action = req.query.action;

    if (!notificationId) {
        return res.status(400).json('notificationId is required in query parameters');
    }

    const _notificationQuery = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `NOTIFICATION#${notificationId}`,
        },
        ProjectionExpression: 'data.type, data.opened, data.targetResourceId',
    }

    const _notification = (await dynamoClient.get(_notificationQuery).promise())['Item'];
    if (!_notification) {
        return res.status(404).json('No notification found');
    }
    if (_notification.data.opened === true) {
        return res.status(200).json('Notification is already opened');
    }

    var responseString;

    // handling club participation type invitation
    if (_notification.data.type === 'CLUB#INV#prt') {
        if (action !== 'accept' && action !== 'cancel') {
            return res.status(400).json('action value is required in query parameters for this notification');
        }

        const clubId = _notification.data.targetResourceId;

        const _audienceQuery = {
            TableName: tableName,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${userId}`,
            },
            AttributesToGet: ['invitationId', 'joinRequested'],
        }

        const _audienceData = (await dynamoClient.get(_audienceQuery).promise())['Item'];

        if (!_audienceData.invitationId) {
            responseString = 'INVITATION_EXPIRED';
        } else {

            const _audienceUpdateQuery = {
                TableName: tableName,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `AUDIENCE#${userId}`,
                },
                AttributeUpdates: {
                    invitationId: {
                        "Action": "DELETE"
                    }
                },
            };
            const _transactQuery = {
                TransactItems: []
            };

            if (action === 'accept') {
                if (_audienceData.joinRequested === true) {
                    _audienceUpdateQuery['AttributeUpdates']['joinRequested'] = {
                        "Action": "PUT",
                        "Value": false
                    };
                }

                _audienceUpdateQuery['AttributeUpdates']['isParticipant'] = {
                    "Action": "PUT",
                    "Value": true
                };

                _audienceUpdateQuery['AttributeUpdates']['AudienceDynamicField'] = {
                    "Action": "PUT",
                    "Value": 'Participant#' + Date.now() + '#' + userId,
                };

                const _updateParticipantCounterQuery = {
                    TableName: tableName,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CountParticipant#`,
                    },
                    UpdateExpression: 'set #cnt = #cnt + :counter', // incrementing
                    ExpressionAttributeNames: {
                        '#cnt': 'count'
                    },
                    ExpressionAttributeValues: {
                        ':counter': 1,
                    }
                }
                _transactQuery.TransactItems.push({
                    Update: _updateParticipantCounterQuery,
                });
            }

            _transactQuery.TransactItems.push({
                Update: _audienceUpdateQuery,
            });

            await dynamoClient.transactWrite(_transactQuery).promise();

            // sending updated participant list to all subscribed users of this club.
            if (action === 'accept') {
                await postParticipantListToWebsocketUsers(clubId);
            }

        }

    }

    if (_notification.data.type === 'FR#new') {
        if (action !== 'accept' && action !== 'cancel') {
            return res.status(400).json('action value is required in query parameters for this notification');
        }

        const foreignUserId = _notification.data.targetResourceId;

        const _oldRelationQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `RELATION#${foreignUserId}`
            },
            AttributesToGet: ['primaryUser', 'relationIndexObj'],
        };

        const oldRelationDoc = (await dynamoClient.get(_oldRelationQuery).promise())['Item'];

        if (!oldRelationDoc) {
            return res.status(404).json('there is no existing social connection between users');
        }

        const _transactQuery = {
            TransactItems: []
        };
        const newTimestmap = Date.now();

        // preparing notification object to be sent to foreign user in context. (when request is accepted)
        var notificationObj = {
            userId: foreignUserId,
            data: {
                type: "FR#accepted",
                title: "You and " + oldRelationDoc.primaryUser.username + " are now bound in a great friendship pact.",
                avatar: `https://mootclub-public.s3.amazonaws.com/userAvatar/${userId}`,
                targetResourceId: userId,
                timestamp: Date.now(),
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

        // update relation docs of users.
        if (action === 'accept') {

            if (oldRelationDoc.relationIndexObj.B2 === false) {
                return res.status(404).json('there is no friend request to be accepted');
            } else if (oldRelationDoc.relationIndexObj.B1 === true) {
                return res.status(404).json('users are already friends, what in the air are you trying to accept ?');
            }




            primaryUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b5 = :tr, #rIO.#b2 = :fal, #rIO.#b1 = :tr, #tsp = :tsp remove #rq';
            primaryUserRelationDocUpdateQuery['ExpressionAttributeNames'] = {
                '#rIO': 'relationIndexObj',
                '#b5': 'B5',
                '#b2': 'B2',
                '#b1': 'B1',
                '#tsp': 'timestamp',
                '#rq': 'requestId',
            };
            primaryUserRelationDocUpdateQuery['ExpressionAttributeValues'] = {
                ':tr': true,
                ':fal': false,
                ':tsp': newTimestmap,
            };

            foreignUserRelationDocUpdateQuery['UpdateExpression'] = 'set #rIO.#b4 = :tr, #rIO.#b3 = :fal, #rIO.#b1 = :tr, #tsp = :tsp ';
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

        } else {
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

            if (oldRelationDoc.relationIndexObj.B2 === true) {
                // this is the case of deleting arrived friend request.
                primaryUserRelationDocUpdateQuery['UpdateExpression'] += ' remove #rq';
                primaryUserRelationDocUpdateQuery['ExpressionAttributeNames']['#rq'] = 'requestId';
            }
        }

        _transactQuery.TransactItems.push({
            Update: primaryUserRelationDocUpdateQuery
        });
        _transactQuery.TransactItems.push({
            Update: foreignUserRelationDocUpdateQuery
        });

        // deleting notification also
        const _notificationDeleteQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `NOTIFICATION#${notificationId}`,
            },
        };

        _transactQuery.TransactItems.push({
            Delete: _notificationDeleteQuery,
        });


        try {
            await dynamoClient.transactWrite(_transactQuery).promise();

            if (action === 'accept') {
                await sendAndSaveNotification(notificationObj);
            }

            return res.status(202).json('response to friend request is successful');
        } catch (error) {
            console.log('error in modifying notification of friend request type: ', error);
            return res.status(400).json('error in modifying notification of friend request type');
        }

    } else {

        // in all other cases, just updating the notification

        const _updateQuery = {
            TableName: tableName,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `NOTIFICATION#${notificationId}`,
            },
            ConditionExpression: 'data.opened = :fal ',
            UpdateExpression: 'SET data.opened = :tr',
            ExpressionAttributeValues: {
                ":fal": false,
                ":tr": true,
            }
        };

        try {
            await dynamoClient.update(_updateQuery).promise();
            if (!responseString) {
                responseString = 'Notification open status saved successfully';
            }
            return res.status(202).json(responseString);
        } catch (error) {
            console.log('error in modifying notification open status: ', error);
            return res.status(400).json('error in modifying notification open status');
        }
    }
});


module.exports = router;