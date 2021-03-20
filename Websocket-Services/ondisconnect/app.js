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

      // disconnect event would not affect status of participant as the reason can be network issue.
      // so when user re-connect with websocket, his participant status would be intact. in case the user closed app directly,
      // then on noticing inactivity from participant, owner can remove him also so this can be controlled by owner.

      // any other status like invitation or active join request will be deleted as they are not needed to be  controlled by owner. 

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

        const _updateNotificationQuery = {
          TableName: myTable,
          Key: {
            P_K: `USER#${userId}`,
            S_K: `NOTIFICATION#${_audienceData.invitationId}`,
          },
          UpdateExpression: 'SET #data.opened = :tr',
          ExpressionAttributeNames: {
            '#data': 'data'
          },
          ExpressionAttributeValues: {
            ":tr": true,
          }
        };

        promises.push(dynamoClient.update(_updateNotificationQuery).promise());

      }

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