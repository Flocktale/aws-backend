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
        const oldData = (await dynamoClient.delete(_tokenQuery).promise())['Attributes'];
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
        AttributesToGet: ['data'],
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
                data
            }) => {
                return data;
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
///     "action" (valid values are "accept","cancel") (required in case club invitation type)
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
        if (!(action !== 'accept' && action !== 'cancel')) {
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
                postParticipantListToWebsocketUsers(clubId);
            }

        }

    }


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
});


module.exports = router;