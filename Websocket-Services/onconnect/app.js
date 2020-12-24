const AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'myTable';
const clubCategoryIndex = 'ClubCategoryIndex';

exports.handler = async event => {

    const userId = event.headers.userId;

    if (!userId) {
        // TODO: disconnect
        return { statusCode: 400, body: 'Bad request.' };
    }

    const putParams = {
        TableName: WsTable,
        Item: {
            connectionId: event.requestContext.connectionId,
            userId: userId
        }
    };

    try {
        await ddb.put(putParams).promise();

        var categoryList = ['Entrepreneurship', 'Education', 'Comedy', 'Travel', 'Society',
            'Health', 'Finance', 'Sports', 'Other'];

        const apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
        });


        const postCalls = categoryList.map(async (category) => {
            const _query = {
                TableName: myTable,
                IndexName: clubCategoryIndex,
                KeyConditions: {
                    'category': {
                        ComparisonOperator: 'EQ',
                        AttributeValueList: [category]
                    }
                },
                AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime', 'clubAvatar', 'tags'],
                ScanIndexForward: false,
                Limit: 5,
            };
            try {
                const clubs = (await ddb.query(_query).promise())['Items'];
                await apigwManagementApi.postToConnection({
                    ConnectionId: event.requestContext.connectionId, Data: { category: category, clubs: clubs }
                }).promise();
            } catch (error) {
                if (error.statusCode === 410) {
                    console.log(`Found stale connection, deleting ${connectionId} of userId: ${userId}`);
                    await ddb.delete({
                        TableName: WsTable,
                        Key: { connectionId: event.requestContext.connectionId }
                    }).promise();
                }
                console.log('error in fetching latest 5 clubs from : ' + category + ' : category, or it can be error of apigwManagement :', error);
            }
        });


        await Promise.all(postCalls);

    } catch (err) {
        return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
    }
    return { statusCode: 200, body: 'Connected.' };

};