const {
  decrementAudienceCount,
  decrementParticipantCount
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

const Constants = require('./constants');

exports.handler = async event => {
  const connectionId = event.requestContext.connectionId;

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  const _userIdQuery = {
    TableName: WsTable,
    Key: {
      connectionId: connectionId
    },
    AttributesToGet: ['userId', 'skey', 'clubStatus']
  };
  const data = (await dynamoClient.get(_userIdQuery).promise())['Item'];
  const userId = data.userId;
  const skey = data.skey;


  // if clubStatus is STOPPED then all necessary operations must have been resolved already.
  if (skey && (data.clubStatus === 'PLAYING')) {
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

    if (_audienceData.isOwner === true) {
      // no action is needed on audience doc.
    } else if (audienceStatus === Constants.AudienceStatus.Participant) {
      _audienceUpdateQuery['UpdateExpression'] = 'REMOVE #status, AudienceDynamicField';
      _audienceUpdateQuery['ExpressionAttributeNames'] = {
        '#status': 'status'
      };

      //decrementing participant count.
      promises.push(decrementParticipantCount(clubId));

      // if this participant is owner, then this code won't be executed (handled above)
      // deleting this participant's username from club data.
      const _participantInClubUpdateQuery = {
        TableName: myTable,
        Key: {
          P_K: `CLUB#${clubId}`,
          S_K: `CLUBMETA#${clubId}`,
        },
        UpdateExpression: 'DELETE participants :prtUser',
        ExpressionAttributeValues: {
          ':prtUser': dynamoClient.createSet([_audienceData.audience.username]),
        }
      };

      promises.push(dynamoClient.update(_participantInClubUpdateQuery).promise());



      // decrementing participant counter
      const _counterUpdateQuery = {
        TableName: myTable,
        Key: {
          P_K: `CLUB#${clubId}`,
          S_K: 'CountParticipant#',
        },
        UpdateExpression: 'ADD #cnt :counter', // decrementing
        ExpressionAttributeNames: {
          '#cnt': 'count'
        },
        ExpressionAttributeValues: {
          ':counter': -1,
        }
      }

      promises.push(dynamoClient.update(_counterUpdateQuery).promise());

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


      if (_audienceData.invitationId) {
        // removing invitation also.
        _audienceUpdateQuery['UpdateExpression'] += ', invitationId';
      }

      // decrementing audience count 
      promises.push(decrementAudienceCount(clubId));
    }

    if (_audienceUpdateQuery.UpdateExpression) {
      promises.push(dynamoClient.update(_audienceUpdateQuery).promise());
    }

    await Promise.all(promises);

    // calling this after updating database to get recent participants.
    if (audienceStatus === Constants.AudienceStatus.Participant && _audienceData.isOwner !== true) {
      const params = {
        MessageBody: 'message from ondisconnect Function',
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
        },
        MessageDeduplicationId: connectionId,
        MessageGroupId: clubId,
      };

      await sqs.sendMessage(params).promise();
    }

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
      },
      'S_K': {
        Exists: true,
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