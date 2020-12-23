const AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'myTable';
const timestampSortIndex = 'TimestampSortIndex';

exports.handler = async event => {

    const toggleMethod = event.headers.toggleMethod;
    const clubId = event.headers.clubId;

    if ((!toggleMethod) || (!(toggleMethod === 'enter' || toggleMethod === 'exit')) || (!clubId)) {
        return { statusCode: 400, body: 'Bad request. toggleMethod should be either enter or exit. ClubId should also exist in headers' };
    }


    if (toggleMethod === 'enter') {
        const putParams = {
            TableName: WsTable,
            Item: {
                connectionId: event.requestContext.connectionId,
                skey: `CLUB#${clubId}`,
            }
        };
        try {
            await ddb.put(putParams).promise();


            const apigwManagementApi = new AWS.ApiGatewayManagementApi({
                apiVersion: '2018-11-29',
                endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
            });

            const _query = {
                TableName: myTable,
                IndexName: timestampSortIndex,
                KeyConditionExpression: 'P_K = :hkey and begins_with ( TimestampSortField , :filter )',
                ExpressionAttributeValues: {
                    ":hkey": `CLUB#${clubId}`,
                    ":filter": `COMMENT-SORT-TIMESTAMP#`
                },
                AttributesToGet: ['clubId', 'user', 'commentId', 'body', 'timestamp'],
                ScanIndexForward: false,
                Limit: 50,

            };
            const oldComments = await ddb.query(_query).promise();


            return { statusCode: 200, body: 'Subscribed to club: ' + clubId, oldComments: oldComments['Items'] };
        } catch (err) {
            return { statusCode: 500, body: 'Failed to subscribe: ' + JSON.stringify(err) };
        }
    } else if (toggleMethod === 'exit') {
        const deleteParams = {
            TableName: WsTable,
            Key: { connectionId: event.requestContext.connectionId }
        }
        try {
            await ddb.delete(deleteParams).promise();
            return { statusCode: 200, body: 'Unsubscribed from club: ' + clubId };
        } catch (error) {
            return { statusCode: 500, body: 'Failed to Unsubscribe: ' + JSON.stringify(err) };
        }

    } else {
        return { statusCode: 500, body: 'Unexpected toggleMethod value, valid are - enter, exit' };
    }

};