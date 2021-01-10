const AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';
const clubCategoryIndex = 'ClubCategoryIndex';


//required userId in headers

exports.handler = async event => {

    const userId = event.headers.userId;

    if (!userId) {
        // TODO: disconnect
        return {
            statusCode: 400,
            body: 'Bad request.'
        };
    }

    const connectionId = event.requestContext.connectionId;

    const putParams = {
        TableName: WsTable,
        Item: {
            connectionId: connectionId,
            userId: userId
        }
    };

    try {

        await ddb.put(putParams).promise();

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