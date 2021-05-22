const AWS = require('aws-sdk');
AWS.config.update({
    region: "ap-south-1",
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';
const wsUserIdIndex = 'wsUserIdIndex';

// key in headers are automatically transformed in lowercase
//required userid in headers

exports.handler = async event => {

    console.log(event);

    const userId = event.headers.userid;


    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });

    // to indicate if this is reconnect event (connection might have been closed because of any reasons)
    const reconnect = event.headers.reconnect;


    if (!userId) {
        return {
            statusCode: 400,
            body: 'Bad request.'
        };
    }

    const promises = [];

    if (reconnect) {
        // in this case, delete all old stored connection ids and data in WsTable.
        const oldData = (await dynamoClient.query({
            TableName: WsTable,
            IndexName: wsUserIdIndex,
            Key: {
                userId: userId
            },
        }).promise())['Items'];

        for (var connection of oldData) {
            const delConnection = new Promise(async (resolve, rej) => {
                try {
                    await dynamoClient.delete({
                        TableName: WsTable,
                        Key: {
                            connectionId: connection.connectionId
                        }
                    }).promise();
                    await apigwManagementApi.deleteConnection({
                        ConnectionId: connection.connectionId
                    }).promise();

                } catch (error) {
                    console.log('error in deleting old connection : ', error);
                }
                resolve();
            })
            promises.push(delConnection);
        }

    }

    const connectionId = event.requestContext.connectionId;

    const putParams = {
        TableName: WsTable,
        Item: {
            connectionId: connectionId,
            userId: userId,
            timestamp: (new Date()).toUTCString(),
        }
    };

    const _onlineStatusUpdateParamas = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`
        },
        Expected: {
            'P_K': {
                Exists: true,
                Value: `USER#${userId}`,
            },
            'S_K': {
                Exists: true,
                Value: `USERMETA#${userId}`,
            },
        },

        AttributeUpdates: {
            "online": {
                "Action": "PUT",
                "Value": 0,
            }
        },
    };

    promises.push(dynamoClient.put(putParams).promise());
    promises.push(dynamoClient.update(_onlineStatusUpdateParamas).promise());

    try {

        await Promise.all(promises);

    } catch (err) {
        return {
            statusCode: 500,
            body: 'Failed to connect: ' + JSON.stringify(err)
        };
    }
    return {
        statusCode: 200,
        body: 'Connected.'
    };

};