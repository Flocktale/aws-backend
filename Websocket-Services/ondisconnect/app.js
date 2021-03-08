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
      AttributesToGet: ['status', 'isOwner', 'audience']
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


      promises.push(_postParticipantListToAllClubSubscribers(apigwManagementApi, clubId));



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

async function _postParticipantListToAllClubSubscribers(apigwManagementApi, clubId) {

  if (!clubId) return;

  const connectionIds = await _fetchAllConnectionIdsForClub(clubId);

  var data;
  await _getParticipantList(clubId, participantData => {
    data = participantData;
  });

  const postCalls = connectionIds.map(async connectionId => {
    try {
      await apigwManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(data)
      }).promise();
    } catch (error) {
      if (error.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId} from club with clubId: ${clubId}`);
        await dynamoClient.delete({
          TableName: WsTable,
          Key: {
            connectionId: connectionId
          }
        }).promise();
      } else {
        console.log(error);
        throw error;
      }
    }
  });

  await Promise.all(postCalls);

}

async function _fetchAllConnectionIdsForClub(clubId) {
  if (!clubId) return;

  const _connectionQuery = {
    TableName: WsTable,
    IndexName: wsInvertIndex,
    KeyConditionExpression: 'skey = :skey',
    ExpressionAttributeValues: {
      ":skey": `CLUB#${clubId}`,
    },
    ProjectionExpression: 'connectionId',
  };

  const connectionIds = ((await dynamoClient.query(_connectionQuery).promise())['Items']).map(({
    connectionId
  }) => connectionId);

  return connectionIds;
}



async function _getParticipantList(clubId, callback) {
  if (!clubId) return;

  const _participantQuery = {
    TableName: myTable,
    IndexName: audienceDynamicDataIndex,
    KeyConditions: {
      "P_K": {
        "ComparisonOperator": "EQ",
        "AttributeValueList": [`CLUB#${clubId}`]
      },
      "AudienceDynamicField": {
        "ComparisonOperator": "BEGINS_WITH",
        "AttributeValueList": [`Participant#`]
      },
    },
    AttributesToGet: ['audience', 'isMuted'],
  }


  try {
    const participantList = (await dynamoClient.query(_participantQuery).promise())['Items'];
    console.log('participantList: ', participantList);

    return callback({
      what: "participantList",
      clubId: clubId,
      participantList: participantList,
    });

  } catch (error) {
    console.log('error in fetching participant list: ', error);
  }
}