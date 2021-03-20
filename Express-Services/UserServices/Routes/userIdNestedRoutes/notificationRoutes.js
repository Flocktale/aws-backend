const router = require('express').Router();


const {
    dynamoClient,
    myTable,
    sns,
    platformEndpointCreateParams,
    timestampSortIndex,
} = require('../../config');
const Constants = require('../../constants');

const {
    SNSEndpointSchemaWithDatabaseKeys
} = require('../../Schemas/snsEndpointSchema');

const {
    pushToWsMsgQueue
} = require('../../Functions/sqsFunctions');

const {
    sendNotifDataToSQS
} = require('../../Functions/notificationFunctions');
const {
    acceptFriendRequest
} = require('../../Functions/addRelationFunctions');

const {
    deleteFriendRequest
} = require('../../Functions/removeRelationFunctions');
const {
    decrementAudienceCount,
    getNoOfParticipants
} = require('../../Functions/clubFunctions');

// required
// body - {"deviceToken"}
router.post("/device-token", async (req, res) => {
    const userId = req.userId;
    const deviceToken = req.body.deviceToken;

    if (!deviceToken) {
        return res.status(400).json("deviceToken is required");
    }

    const _tokenQuery = {
        TableName: myTable,
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


    // creating platform endpoint in sns
    const params = {
        ...platformEndpointCreateParams,
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
            TableName: myTable,
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
        TableName: myTable,
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
        TableName: myTable,
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
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `NOTIFICATION#${notificationId}`,
        },
        ProjectionExpression: '#data.#type, #data.opened, #data.targetResourceId',
        ExpressionAttributeNames: {
            '#data': 'data',
            '#type': 'type'
        },
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
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${userId}`,
            },
            AttributesToGet: ['invitationId', 'status', 'audience'],
        }

        const _audienceData = (await dynamoClient.get(_audienceQuery).promise())['Item'];

        if (!_audienceData.invitationId) {
            responseString = 'INVITATION_EXPIRED';
        } else {
            const _audienceUpdateQuery = {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `AUDIENCE#${userId}`,
                },
                UpdateExpression: 'REMOVE invitationId',

                // can't leave them empty, generates error if finally remain empty :(,

                // ExpressionAttributeNames: {},
                // ExpressionAttributeValues: {},
            };
            const _transactQuery = {
                TransactItems: []
            };

            if (action === 'accept') {

                _audienceUpdateQuery['ExpressionAttributeNames'] = {};
                _audienceUpdateQuery['ExpressionAttributeValues'] = {};

                // first checking the no of participants including owner.
                const oldParticipantCount = await getNoOfParticipants(clubId);

                // not allowing more than 10 participant at current.
                if (oldParticipantCount >= Constants.maxParticipantLimit) {
                    return res.status(400).json('MAX_LIMIT_REACHED');
                }



                const _clubLiveQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CLUBMETA#${clubId}`,
                    },
                    AttributesToGet: ['status'],
                }

                const _clubData = (await dynamoClient.get(_clubLiveQuery).promise())['Item'];

                if (!_clubData || (_clubData.status !== Constants.ClubStatus.Live)) {
                    return res.status(403).json('NOT_LIVE_YET');
                }



                _audienceUpdateQuery['UpdateExpression'] += ' SET #status = :status, AudienceDynamicField = :adf';
                _audienceUpdateQuery['ExpressionAttributeNames']['#status'] = 'status';

                _audienceUpdateQuery['ExpressionAttributeValues'][':status'] = Constants.AudienceStatus.Participant;
                _audienceUpdateQuery['ExpressionAttributeValues'][':adf'] = Constants.AudienceStatus.Participant + '#' + Date.now() + '#' + userId;


                const _updateParticipantCounterQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CountParticipant#`,
                    },
                    UpdateExpression: 'ADD #cnt :counter', // incrementing
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

                // inserting this new participant's username in club data.
                const _participantInClubUpdateQuery = {
                    TableName: myTable,
                    Key: {
                        P_K: `CLUB#${clubId}`,
                        S_K: `CLUBMETA#${clubId}`,
                    },
                    UpdateExpression: 'ADD participants :prtUser',
                    ExpressionAttributeValues: {
                        ':prtUser': dynamoClient.createSet([_audienceData.audience.username]),
                    }
                };

                _transactQuery.TransactItems.push({
                    Update: _participantInClubUpdateQuery
                });

            }

            _transactQuery.TransactItems.push({
                Update: _audienceUpdateQuery,
            });


            await dynamoClient.transactWrite(_transactQuery).promise();

            if (action === 'accept') {

                await Promise.all([
                    // sending updated participant list to all subscribed users of this club.
                    pushToWsMsgQueue({
                        action: Constants.WsMsgQueueAction.postParticipantList,
                        MessageGroupId: clubId,
                        attributes: {
                            clubId: clubId,
                        }
                    }),
                    //decrementing audience count as this user is converted from audience to participant
                    decrementAudienceCount(clubId),

                ]);

            }

        }

    }


    // notification will be deleted by either response from user (automatically handled inside corresponding action handlers).
    if (_notification.data.type === 'FR#new') {
        if (action !== 'accept' && action !== 'cancel') {
            return res.status(400).json('action value is required in query parameters for this notification');
        }

        const foreignUserId = _notification.data.targetResourceId;


        const _functionParams = {
            userId: userId,
            foreignUserId: foreignUserId
        };
        try {
            if (action === 'accept') {
                await acceptFriendRequest(_functionParams);
            } else {
                await deleteFriendRequest(_functionParams);
            }
            return res.status(202).json('response to friend request is successful');

        } catch (error) {

            return res.status(400).json('error in modifying notification of friend request type');
        }



    } else {

        // in all other cases, just updating the notification

        const _updateQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `NOTIFICATION#${notificationId}`,
            },
            ConditionExpression: '#data.opened = :fal ',
            UpdateExpression: 'SET #data.opened = :tr',
            ExpressionAttributeNames: {
                '#data': 'data'
            },
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