const {
  decrementAudienceCount,
} = require('./clubFunctions');

const {
  WsTable,
  myTable,
  audienceDynamicDataIndex,
  dynamoClient,
  wsInvertIndex,
  AWS,
  sqs,
} = require('./config');

const {
  nanoid
} = require('nanoid');
const Constants = require('./constants');

exports.handler = async event => {
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  console.log(event);

  const connectionId = event.requestContext.connectionId;

  const _userIdQuery = {
    TableName: WsTable,
    Key: {
      connectionId: connectionId
    },
    AttributesToGet: ['userId', 'skey', 'clubStatus']
  };
  const data = (await dynamoClient.get(_userIdQuery).promise())['Item'];

  if (!data) {
    // this disconnection event is produced in attemp of reconnection 
    // (only then data would not exist as it would have been deleted earlier) 
    return {
      statusCode: 200,
      body: 'Disconnected.'
    };
  }

  const userId = data.userId;
  const skey = data.skey;

  const disconnectStatusCode = event.requestContext.disconnectStatusCode;

  // if disconnectStatusCode => 1001 then disconnection resulted due to idle timeout from server side (10 mins for aws apiGW) or client side (pingInterval=> few seconds or more) 
  // in that case we don't modify club related attributes for user.
  // if clubStatus is STOPPED then all necessary operations must have been resolved already.

  if (disconnectStatusCode != 1001 && (skey && (data.clubStatus === 'PLAYING'))) {
    // this case can arise when, user cleared ram or swithced off phone or uninstalled the app or due to internet connection.

    var promises = [];

    const clubId = skey.split('#')[1];

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

    const _audienceUpdateQuery = {
      TableName: myTable,
      Key: {
        P_K: `CLUB#${clubId}`,
        S_K: `AUDIENCE#${userId}`
      },
      // UpdateExpression: '',
    };

    if (audienceStatus === Constants.AudienceStatus.Participant) {

      _audienceUpdateQuery['UpdateExpression'] = 'REMOVE #status, AudienceDynamicField, TimestampSortField, UsernameSortField';
      _audienceUpdateQuery['ExpressionAttributeNames'] = {
        '#status': 'status'
      };


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
    } else if (!audienceStatus) {
      // this user was just a listener.
      _audienceUpdateQuery['UpdateExpression'] = 'REMOVE TimestampSortField';


      // decrementing audience count 
      promises.push(decrementAudienceCount(clubId));
    }

    if (_audienceUpdateQuery.UpdateExpression) {
      promises.push(dynamoClient.update(_audienceUpdateQuery).promise());
    }

    await Promise.all(promises);


  }

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
        "Value": offlineTime,
      }
    },
  };

  try {
    await dynamoClient.delete(deleteParams).promise();
    await dynamoClient.update(_onlineStatusUpdateParamas).promise();
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