const {
    dynamoClient,
    apigwManagementApi,

    myTable,
    audienceDynamicDataIndex,

    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
} = require('./config');
const Constants = require('./constants');


async function _postToOneUserConnection(userId, data) {

    const _connectionQuery = {
        TableName: WsTable,
        IndexName: wsUserIdIndex,
        KeyConditionExpression: 'userId = :id',
        ExpressionAttributeValues: {
            ':id': userId
        },
        ProjectionExpression: 'connectionId',
    };
    const connectionData = (await dynamoClient.query(_connectionQuery).promise())['Items'];

    const promises = [];

    for (var connection of connectionData) {
        promises.push(apigwManagementApi.postToConnection({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(data)
        }).promise());
    }

    try {
        await Promise.all(promises);
    } catch (error) {
        console.log('-------------error: ', error);
    }


}

async function _fetchSocialCountData(userId) {
    if (!userId) return;

    const _query = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`,
        },
        AttributesToGet: ['followerCount', 'followingCount', 'friendsCount'],
    };
    const data = (await dynamoClient.get(_query).promise())['Item'];
    return data;
}




async function _postMessageToAllClubSubscribers(clubId, data, connectionIds) {

    if (!clubId || !data) return;

    if (!connectionIds) {
        connectionIds = await _fetchAllConnectionIdsForClub(clubId);
    }


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
        KeyConditionExpression: 'skey= :skey',
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


async function postParticipantListToWebsocketUsers(clubId, subAction, user) {
    if (!clubId) return;

    const data = {
        what: Constants.whatType.participantList,
        clubId: clubId,
        subAction: subAction,
    };

    if (subAction === 'Add' || subAction === 'Remove') {
        data['user'] = JSON.parse(user);
    } else if (subAction === 'All') {

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
            AttributesToGet: ['audience'],
        };

        var participantList, connectionIds;

        await Promise.all([dynamoClient.query(_participantQuery).promise(), _fetchAllConnectionIdsForClub(clubId)]).then(values => {
            participantList = values[0].Items.map(({
                audience
            }) => audience);
            connectionIds = values[1];
        });

        data['participantList'] = participantList;
    }

    await _postMessageToAllClubSubscribers(clubId, data, connectionIds);
}

async function postClubStartedMessageToWebsocketUsers({
    clubId,
}) {
    if (!clubId) return;

    const data = {
        what: Constants.whatType.clubStarted,
        clubId: clubId,
    };

    await _postMessageToAllClubSubscribers(clubId, data);

}


async function postClubConcludedMessageToWebsocketUsers({
    clubId
}) {
    if (!clubId) return;

    const data = {
        what: Constants.whatType.clubConcluded,
        clubId: clubId,
    };

    await _postMessageToAllClubSubscribers(clubId, data);

}


async function postSocialCountToBothUser({
    userId1,
    userId2
}) {
    if (!userId1 && !userId2) return;

    var user1Data, user2Data;

    await Promise.all([_fetchSocialCountData(userId1), _fetchSocialCountData(userId2)]).then((values) => {
        user1Data = values[0];
        user2Data = values[1];
    });

    await Promise.all([
        _postToOneUserConnection(userId1, {
            what: Constants.whatType.socialCounts,
            ...user1Data
        }),
        _postToOneUserConnection(userId2, {
            what: Constants.whatType.socialCounts,
            ...user2Data
        })
    ]);

}

module.exports = {

    postParticipantListToWebsocketUsers,

    postClubStartedMessageToWebsocketUsers,
    postClubConcludedMessageToWebsocketUsers,

    postSocialCountToBothUser,
};