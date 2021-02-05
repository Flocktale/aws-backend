const AWS = require('aws-sdk');
AWS.config.update({
  region: "us-east-1",
});

const ddb = new AWS.DynamoDB.DocumentClient();

const WsTable = 'WsTable';
const myTable = 'MyTable';

exports.handler = async event => {
  const connectionId = event.requestContext.connectionId;

  const _userIdQuery = {
    TableName: WsTable,
    Key: {
      connectionId: connectionId
    },
    AttributesToGet: ['userId']
  };

  const userId = (await ddb.get(_userIdQuery).promise())['Item']['userId'];

  const deleteParams = {
    TableName: WsTable,
    Key: {
      connectionId: connectionId
    }
  };

  const offlineTime = Date.now();

  const _onlineStatusUpdateParamas = {
    TableName: myTable,
    Key: {
      P_K: `USER#${userId}`,
      S_K: `USERMETA#${userId}`
    },
    AttributeUpdates: {
      "online": {
        "Action": "PUT",
        "Value": offlineTime,
      }
    },
  };

  try {
    await ddb.delete(deleteParams).promise();
    await ddb.update(_onlineStatusUpdateParamas).promise();
  } catch (err) {
    console.log('error in on disconnect funciton: ', err);
    return {
      statusCode: 500,
      body: 'Failed to disconnect: ' + JSON.stringify(err)
    };
  }
  return {
    statusCode: 200,
    body: 'Disconnected.'
  };
};