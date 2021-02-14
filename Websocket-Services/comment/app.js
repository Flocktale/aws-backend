const {
    nanoid
} = require('nanoid');
const AWS = require('aws-sdk');

const {
    CommentSchema,
    CommentSchemaWithDatabaseKeys
} = require('./Schemas/Comment');

AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';
const wsInvertIndex = 'wsInvertIndex';

// TODO: Convert it to a REST API which registers this comment and query WsTable to fetch club subscribed users to push this comment to all of them.

exports.handler = async event => {

    console.log(event);


    const body = JSON.parse(event.body);

    if (!body) {
        return {
            statusCode: 400,
            body: 'Body should exist.'
        };
    }

    const userId = body.userId;

    const _userSummaryQuery = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`,
        },
        AttributesToGet: ["userId", "username", "avatar"],
    };

    var result, postComment;

    try {

        const user = (await ddb.get(_userSummaryQuery).promise())['Item'];

        result = await CommentSchemaWithDatabaseKeys.validateAsync({
            clubId: body.clubId,
            user: user,
            commentId: nanoid(),
            body: body.body,
        });

        postComment = await CommentSchema.validateAsync({
            clubId: result.clubId,
            commentId: result.commentId,
            user: user,
            body: result.body,
            timestamp: result.timestamp,
        });

    } catch (error) {
        console.log("error in getting user try catch block: ", error);
        return {
            statusCode: 400,
            body: `Invalid data : ${error}`
        };
    }

    const putParams = {
        TableName: myTable,
        Item: result
    };

    try {
        await ddb.put(putParams).promise();
    } catch (err) {
        console.log('error in putting comment in table: ', err);
        return {
            statusCode: 500,
            body: 'Failed to comment: ' + JSON.stringify(err)
        };
    }

    const _query = {
        TableName: WsTable,
        IndexName: wsInvertIndex,
        KeyConditionExpression: 'skey= :skey',
        ExpressionAttributeValues: {
            ":skey": `CLUB#${result.clubId}`,
        },
        ProjectionExpression: 'connectionId',
    };

    var connectionData;

    try {
        connectionData = await ddb.query(_query).promise();
    } catch (e) {
        console.log('error in getting connectionData: ', e);
        return {
            statusCode: 500,
            body: e.stack
        };
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });

    const postCalls = connectionData.Items.map(async ({
        connectionId
    }) => {
        try {
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    what: "newComment",
                    clubId: result.clubId,
                    user: postComment.user,
                    body: postComment.body,
                    timestamp: postComment.timestamp,
                })
            }).promise();
        } catch (error) {
            if (error.statusCode === 410) {
                console.log(`Found stale connection, deleting ${connectionId} of username: ${result.username} from club with clubId: ${result.clubId}`);
                await ddb.delete({
                    TableName: WsTable,
                    Key: {
                        connectionId: connectionId
                    }
                }).promise();
            } else {
                throw error;
            }
        }
    });

    try {
        await Promise.all(postCalls);
    } catch (e) {
        console.log('overall error:', e);
        return {
            statusCode: 500,
            body: e.stack
        };
    }

    return {
        statusCode: 200,
        body: 'Commented successfully .'
    };
};