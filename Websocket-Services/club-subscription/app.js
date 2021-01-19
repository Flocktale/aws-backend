const AWS = require('aws-sdk');
const {
    tableName
} = require('../../Express-Services/ClubServices/config');
AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';
const timestampSortIndex = 'TimestampSortIndex';

exports.handler = async event => {

    const toggleMethod = event.headers.toggleMethod;
    const clubId = event.headers.clubId;

    if ((!toggleMethod) || (!(toggleMethod === 'enter' || toggleMethod === 'exit')) || (!clubId)) {
        return {
            statusCode: 400,
            body: 'Bad request. toggleMethod should be either enter or exit. ClubId should also exist in headers'
        };
    }

    const connectionId = event.requestContext.connectionId;


    if (toggleMethod === 'enter') {
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
            await ddb.update(updateParams).promise();


            const apigwManagementApi = new AWS.ApiGatewayManagementApi({
                apiVersion: '2018-11-29',
                endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
            });

            for (var i = 0; i <= 2; i++) {
                await _getReactionCount(clubId, i, async (err, data) => {
                    if (data) {
                        await apigwManagementApi.postToConnection({
                            ConnectionId: connectionId,
                            Data: JSON.stringify(data)
                        }).promise();
                    }
                });
            }

            await _getAudienceCount(clubId, async data => {
                await apigwManagementApi.postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(data)
                }).promise();
            })

            await _getOldComments(clubId, async data => {
                await apigwManagementApi.postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(data)
                }).promise();
            });


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
    } else if (toggleMethod === 'exit') {
        const updateParams = {
            TableName: WsTable,
            Key: {
                connectionId: event.requestContext.connectionId
            },
            UpdateExpression: 'REMOVE skey',
        };
        try {
            await ddb.update(updateParams).promise();
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

    } else {
        return {
            statusCode: 500,
            body: 'Unexpected toggleMethod value, valid are - enter, exit'
        };
    }
};

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
        AttributesToGet: ['user', 'body', 'timestamp'],
        ScanIndexForward: false,
        Limit: 30,
    };
    const oldComments = (await ddb.query(_commentQuery).promise())['Items'];
    return callback({
        what: "oldComments",
        oldComments: oldComments
    });
}


// callback(err, data)
async function _getReactionCount(clubId, index, callback) {
    if (!(index === 0 || index === 1 || index === 2)) {
        console.log('invalid index value, should be in range of 0 to 2 , provided value: ', index);
        return callback('invalid index value');
    }
    const _reactionQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CountReaction#${index}`
        },
        AttributesToGet: ['count']
    };

    const doc = (await ddb.get(_reactionQuery).promise())['Item'];

    return callback(null, {
        what: "reactionCount",
        indexValue: doc.indexValue,
        count: doc.count,
    });
}

async function _getAudienceCount(clubId, callback) {
    const _audienceQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CountAudience#`
        },
        AttributesToGet: ['count']
    };


    const doc = (await ddb.get(_audienceQuery).promise())['Item'];

    return callback({
        what: "audienceCount",
        count: doc.count,
    });
}