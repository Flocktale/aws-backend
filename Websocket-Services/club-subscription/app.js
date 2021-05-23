const {
    nanoid
} = require('nanoid');
const {
    incrementAudienceCount,
    decrementAudienceCount,
} = require('./clubFunctions');
const {
    WsTable,
    myTable,
    timestampSortIndex,
    audienceDynamicDataIndex,
    dynamoClient,
    wsInvertIndex,
    AWS,
    sqs,
} = require('./config');

const Constants = require('./constants');



exports.handler = async event => {
    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });


    const body = JSON.parse(event.body);
    const toggleMethod = body.toggleMethod;
    const clubId = body.clubId;

    console.log('body:', body);

    if ((!toggleMethod) || (!(toggleMethod === 'enter' || toggleMethod === 'exit' || toggleMethod === 'play' || toggleMethod === 'stop')) || (!clubId)) {
        return {
            statusCode: 400,
            body: 'Bad request. toggleMethod should be either enter/exit/play or stop. ClubId should also exist in headers'
        };
    }

    const connectionId = event.requestContext.connectionId;

    if (toggleMethod === 'enter') {

        try {
            const messageList = await _enterClub(connectionId, clubId);
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    what: 'ListOfWhat',
                    list: messageList,
                })
            }).promise();

            return {
                statusCode: 200,
                body: 'Subscribed to club: ' + clubId,
            };

        } catch (err) {
            return {
                statusCode: 500,
                body: 'Failed to subscribe: ' + JSON.stringify(err)
            };
        }
    } else if (toggleMethod === 'play') {
        await _playClub(apigwManagementApi, connectionId, clubId);
        return {
            statusCode: 200,
            body: 'Successful',
        };

    } else if (toggleMethod === 'exit') {
        const response = await _exitClub(connectionId, clubId);
        return response;
    } else if (toggleMethod === 'stop') {
        await _stopClub(apigwManagementApi, connectionId, clubId);
        return {
            statusCode: 200,
            body: 'Successful',
        };

    }
};



async function _stopClub(apigwManagementApi, connectionId, clubId) {

    var promises = [];

    const updateParams = {
        TableName: WsTable,
        Key: {
            connectionId: connectionId
        },
        UpdateExpression: 'SET clubStatus = :stat',
        ExpressionAttributeValues: {
            ':stat': 'STOPPED',
        },
        ReturnValues: 'ALL_OLD',
    };

    const {
        userId,
        clubStatus: oldClubStatus,
    } = (await dynamoClient.update(updateParams).promise())['Attributes'];


    // important
    if (oldClubStatus !== 'PLAYING') {
        // in events of calling this for just ensuring the stop event.
        return;
    }


    const _audienceDocQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${userId}`
        },
        AttributesToGet: ['status', 'isOwner', 'audience', 'invitationId']
    };

    const _audienceData = (await dynamoClient.get(_audienceDocQuery).promise())['Item'];
    const audienceStatus = _audienceData.status;

    if (_audienceData.isOwner === true) {
        //owner is stopping the club. This functionality will be handled by clubs/{clubId}/conclude REST API
        return;
    }

    if (audienceStatus === Constants.AudienceStatus.Blocked) {
        // All necessary database operations will be handled by REST API for block method.
        // including conditional decrement of audience count (if prior to blocking, user wasn't a participant)
        return;
    }

    const _audienceUpdateQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `AUDIENCE#${userId}`
        },
        UpdateExpression: '',
    };

    if (audienceStatus === Constants.AudienceStatus.Participant) {
        _audienceUpdateQuery['UpdateExpression'] = 'REMOVE #status, AudienceDynamicField';
        _audienceUpdateQuery['ExpressionAttributeNames'] = {
            '#status': 'status'
        };


        // if this participant is owner, then this code won't be executed (handled above)
        // deleting this participant's avatar from club data.
        const _participantInClubUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `CLUBMETA#${clubId}`,
            },
            UpdateExpression: 'DELETE participants :prtUser',
            ExpressionAttributeValues: {
                ':prtUser': dynamoClient.createSet([_audienceData.audience.avatar]),
            }
        };

        promises.push(dynamoClient.update(_participantInClubUpdateQuery).promise());

        // sending remove participant message to all connected users.
        promises.push(
            _sendParticipantActionToSqs(clubId, "Remove", _audienceData.audience)
        );


    } else if (audienceStatus === Constants.AudienceStatus.ActiveJoinRequest) {
        _audienceUpdateQuery['UpdateExpression'] = 'REMOVE #status, AudienceDynamicField, TimestampSortField, UsernameSortField';
        _audienceUpdateQuery['ExpressionAttributeNames'] = {
            '#status': 'status'
        };

        // decrementing audience count 
        promises.push(decrementAudienceCount(clubId));

    } else {
        // this user was just a listener.
        _audienceUpdateQuery['UpdateExpression'] = 'REMOVE TimestampSortField';

        // decrementing audience count 
        promises.push(decrementAudienceCount(clubId));
    }

    if (_audienceData.invitationId) {
        // removing invitation also.
        _audienceUpdateQuery['UpdateExpression'] += ', invitationId';

        const _updateNotificationQuery = {
            TableName: myTable,
            Key: {
                P_K: `USER#${userId}`,
                S_K: `NOTIFICATION#${_audienceData.invitationId}`,
            },
            UpdateExpression: 'SET #data.opened = :tr',
            ExpressionAttributeNames: {
                '#data': 'data'
            },
            ExpressionAttributeValues: {
                ":tr": true,
            }
        };

        promises.push(dynamoClient.update(_updateNotificationQuery).promise());

    }



    promises.push(dynamoClient.update(_audienceUpdateQuery).promise());

    await Promise.all(promises);

}


async function _playClub(apigwManagementApi, connectionId, clubId) {
    var promises = [];

    const updateParams = {
        TableName: WsTable,
        Key: {
            connectionId: connectionId
        },
        UpdateExpression: 'SET clubStatus = :stat',
        ExpressionAttributeValues: {
            ':stat': 'PLAYING',
        },
        ReturnValues: 'ALL_NEW',
    };

    const userId = (await dynamoClient.update(updateParams).promise())['Attributes']['userId'];


    try {

        // this operation will generate error if condition expression fails
        // which is the case when  participant reconnects after disconnect event for any reason.
        const _audienceUpdateQuery = {
            TableName: myTable,
            Key: {
                P_K: `CLUB#${clubId}`,
                S_K: `AUDIENCE#${userId}`
            },
            ConditionExpression: 'attribute_not_exists(#status)',
            UpdateExpression: 'set TimestampSortField = :tsf',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':tsf': `AUDIENCE-SORT-TIMESTAMP#${Date.now()}#${userId}`
            },
            ReturnValues: 'ALL_NEW',

        };


        const audienceData = (await dynamoClient.update(_audienceUpdateQuery).promise())['Attributes'];


        if (audienceData.isOwner === true) {
            // if this is owner and he is not a participant then
            const _ownerUpdateQuery = {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `AUDIENCE#${userId}`
                },
                UpdateExpression: 'set #status = :status, AudienceDynamicField = :adf REMOVE TimestampSortField',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':status': Constants.AudienceStatus.Participant,
                    ':adf': Constants.AudienceStatus.Participant + `#${Date.now()}#${userId}`,
                },
            };

            promises.push(dynamoClient.update(_ownerUpdateQuery).promise());

            const _participantInClubUpdateQuery = {
                TableName: myTable,
                Key: {
                    P_K: `CLUB#${clubId}`,
                    S_K: `CLUBMETA#${clubId}`,
                },
                UpdateExpression: 'ADD participants :prtUser',
                ExpressionAttributeValues: {
                    ':prtUser': dynamoClient.createSet([audienceData.audience.avatar]),
                }
            };

            promises.push(dynamoClient.update(_participantInClubUpdateQuery).promise());

            // sending owner as new participant to all connected users.
            promises.push(
                _sendParticipantActionToSqs(clubId, "Add", audienceData.audience)
            );



        } else { // incementing audience count 
            promises.push(incrementAudienceCount(clubId));
        }
    } catch (error) {
        console.log('error in playing club ', error);
    }


    await Promise.all(promises);

}


async function _exitClub(connectionId, clubId) {
    const updateParams = {
        TableName: WsTable,
        Key: {
            connectionId: connectionId
        },
        UpdateExpression: 'set skey = :skey',
        ExpressionAttributeValues: {
            ':skey': `EXIT#${clubId}`,
        }
    };
    try {
        await dynamoClient.update(updateParams).promise();
        return {
            statusCode: 200,
            body: 'Unsubscribed from club: ' + clubId
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: 'Failed to Unsubscribe: ' + JSON.stringify(err)
        };
    }
}

async function _enterClub(connectionId, clubId) {

    var promises = [];
    var messageList = [];

    const updateParams = {
        TableName: WsTable,
        Key: {
            connectionId: connectionId
        },
        UpdateExpression: 'SET skey = :skey',
        ExpressionAttributeValues: {
            ':skey': `CLUB#${clubId}`,
        }
    };
    try {
        promises.push(dynamoClient.update(updateParams).promise())


        promises.push(_getReactionCount(clubId, 2, async (err, data) => {
            if (data) {
                messageList.push(data);
            }
        }));


        promises.push(_getAudienceCount(clubId, async data => {
            messageList.push(data)
        }));


        promises.push(_getParticipantList(clubId, async data => {
            messageList.push(data)
        }));

        promises.push(_getOldComments(clubId, async data => {
            messageList.push(data)
        }))

        await Promise.all(promises);

        return messageList;

    } catch (err) {
        console.log('error while entering club in websocket: ', err);
        throw err;
    }
}


async function _getParticipantList(clubId, callback) {
    if (!clubId) return;

    const _participantQuery = {
        TableName: myTable,
        IndexName: audienceDynamicDataIndex,
        KeyConditions: {
            "P_K": {
                "ComparisonOperator": "EQ",
                "AttributeValueList": [`CLUB#${clubId}`]
            },
            "AudienceDynamicField": {
                "ComparisonOperator": "BEGINS_WITH",
                "AttributeValueList": [`Participant#`]
            },
        },
        AttributesToGet: ['audience'],
    }


    try {
        const participantList = (await dynamoClient.query(_participantQuery).promise())['Items'];
        console.log('participantList: ', participantList);

        return callback({
            what: "participantList",
            subAction: 'All',
            clubId: clubId,
            participantList: participantList.map(({
                audience
            }) => audience),
        });

    } catch (error) {
        console.log('error in fetching participant list: ', error);
    }
}

// returns callback with oldComments
async function _getOldComments(clubId, callback) {
    const _commentQuery = {
        TableName: myTable,
        IndexName: timestampSortIndex,
        KeyConditionExpression: 'P_K = :hkey and begins_with ( TimestampSortField , :filter )',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${clubId}`,
            ":filter": `COMMENT-SORT-TIMESTAMP#`
        },
        ProjectionExpression: '#usr, #bdy, #tsp',
        ExpressionAttributeNames: {
            '#usr': 'user',
            '#bdy': 'body',
            '#tsp': 'timestamp',
        },
        ScanIndexForward: false,
        Limit: 30,
    };
    try {

        const oldComments = (await dynamoClient.query(_commentQuery).promise())['Items'];
        return callback({
            what: "oldComments",
            clubId: clubId,
            oldComments: oldComments
        });

    } catch (error) {
        console.log('error in fetching old comments: ', error);
    }
}


// callback(err, data)
async function _getReactionCount(clubId, index, callback) {
    if (!(index === 0 || index === 1 || index === 2)) {
        console.log('invalid index value, should be in range of 0 to 2 , provided value: ', index);
        return callback('invalid index value');
    }
    const _reactionQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${index}`
        },
        AttributesToGet: ['count']
    };

    const doc = (await dynamoClient.get(_reactionQuery).promise())['Item'];

    return callback(null, {
        what: "reactionCount",
        clubId: clubId,
        indexValue: index,
        count: doc.count,
    });
}

async function _getAudienceCount(clubId, callback) {
    const _audienceQuery = {
        TableName: myTable,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CountAudience#`
        },
        AttributesToGet: ['count']
    };


    const doc = (await dynamoClient.get(_audienceQuery).promise())['Item'];

    return callback({
        what: "audienceCount",
        clubId: clubId,
        count: doc.count,
    });
}

async function _sendParticipantActionToSqs(clubId, subAction, user) {
    const params = {
        MessageBody: 'message from club-subscription  Function',
        QueueUrl: 'https://sqs.ap-south-1.amazonaws.com/524663372903/WsMsgQueue.fifo',
        MessageAttributes: {
            "action": {
                DataType: "String",
                StringValue: Constants.WsMsgQueueAction.postParticipantList,
            },
            "clubId": {
                DataType: "String",
                StringValue: clubId,
            },
            "subAction": {
                DataType: "String",
                StringValue: subAction,
            },
            "user": {
                DataType: "String",
                StringValue: JSON.stringify(user),
            },
        },
        MessageDeduplicationId: nanoid(),
        MessageGroupId: clubId,
    };

    await sqs.sendMessage(params).promise();
}