import { nanoid } from 'nanoid'
const AWS = require('aws-sdk');

const { CommentSchema, CommentSchemaWithDatabaseKeys } = require('./Schemas/Comment');

AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'myTable';
const wsInvertIndex = 'wsInvertIndex';

exports.handler = async event => {

    const body = JSON.parse(event.body);

    if (!body) {
        return { statusCode: 400, body: 'Body should exist.' };
    }

    var result, postComment;

    try {
        result = CommentSchemaWithDatabaseKeys.validateAsync({
            clubId: body.clubId,
            userId: body.userId,
            commentId: nanoid(),
            username: body.username,
            avatar: body.avatar,
            body: body.body,
        });
        postComment = CommentSchema.validateAsync(result);
    } catch (error) {
        return { statusCode: 400, body: `Invalid data : ${error}` };
    }

    const putParams = {
        TableName: myTable,
        Item: result
    };

    try {
        await ddb.put(putParams).promise();
    } catch (err) {
        return { statusCode: 500, body: 'Failed to comment: ' + JSON.stringify(err) };
    }

    const _query = {
        TableName: WsTable,
        IndexName: wsInvertIndex,
        KeyConditionExpression: 'skey= :hkey',
        ExpressionAttributeValues: {
            ":hkey": `CLUB#${result.clubId}`,
        },
        AttributesToGet: ['connectionId'],
    };

    var connectionData;

    try {
        connectionData = await ddb.query(_query).promise();
    } catch (e) {
        return { statusCode: 500, body: e.stack };
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });

    const postCalls = connectionData.Items.map(async ({ connectionId }) => {
        try {
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId, Data: postData
            }).promise();
        } catch (error) {
            if (error.statusCode === 410) {
                console.log(`Found stale connection, deleting ${connectionId} of username: ${result.username} from club with clubId: ${result.clubId}`);
                await ddb.delete({
                    TableName: WsTable,
                    Key: { connectionId: connectionId }
                }).promise();
            } else {
                throw error;
            }
        }
    });

    try {
        await Promise.all(postCalls);
    } catch (e) {
        return { statusCode: 500, body: e.stack };
    }

    return { statusCode: 200, body: 'Commented successfully .' };
};