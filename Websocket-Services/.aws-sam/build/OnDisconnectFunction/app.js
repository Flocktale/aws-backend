const AWS = require('aws-sdk');
AWS.config.update({
  region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';

exports.handler = async event => {

  const deleteParams = {
    TableName: WsTable,
    Key: {
      connectionId: event.requestContext.connectionId
    }
  };

  try {
    await ddb.delete(deleteParams).promise();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) };
  }
  return { statusCode: 200, body: 'Disconnected.' };
};