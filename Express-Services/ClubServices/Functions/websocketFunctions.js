const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    myTable,
    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
} = require('../config');

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


    for (var connection of connectionData) {

        const posted = await apigwManagementApi.postToConnection({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(data)
        }).promise();
        console.log('posted', posted);

    }

}

async function postParticipantListToWebsocketUsers(clubId) {
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

    const participantList = (await dynamoClient.query(_participantQuery).promise())['Items'];

    const data = {
        what: "participantList",
        clubId: clubId,
        participantList: participantList,
    };

    await _postMessageToAllClubSubscribers(clubId, data);
}




// blockAction can be "blocked" or "unblocked"
async function postBlockMessageToWebsocketUser({
    clubId,
    userId,
    blockAction,
}) {

    if (!clubId || (blockAction !== "blocked" && blockAction !== "unblocked") || !userId) {
        console.log('wrong input for postBlockMessageToWebsocketUser, ', clubId, ' , ', blockAction, ' ,', userId);
    }

    await _postToOneUserConnection(userId, {
        what: blockAction,
        clubId: clubId,
    });

}


async function postMuteMessageToParticipantOnly({
    userId,
    clubId,
    isMuted,
}) {

    if (!userId || !clubId || (isMuted === undefined)) return;

    await _postToOneUserConnection(userId, {
        what: 'muteParticipant',
        isMuted: isMuted,
        clubId: clubId,
    });

}

async function postMuteActionMessageToClubSubscribers({
    userIdList,
    clubId,
    isMuted
}) {

    if (!userIdList || !clubId || (isMuted === undefined)) return;

    const _connectionIds = await _fetchAllConnectionIdsForClub(clubId);

    await _postMessageToAllClubSubscribers(clubId, {
            what: 'muteAction#',
            clubId: clubId,
            isMuted: isMuted,
            participantIdList: userIdList,
        },
        _connectionIds
    );
}

async function postKickOutMessageToWebsocketUser({
    userId,
    clubId
}) {

    if (!userId || !clubId) return;

    await _postToOneUserConnection(userId, {
        what: 'kickedOut',
        clubId: clubId,
    });
}


async function postJoinRequestResponseToWebsocketUser({
    userId,
    clubId,
    response,
}) {
    if (!userId || !clubId) return;


    if (response !== 'accept' && response !== 'cancel') return;


    await _postToOneUserConnection(userId, {
        what: `JR#Resp#${response}`,
        clubId: clubId,
    });
}

async function postNewJoinRequestToWebsocketUser({
    creatorId,
    username,
    clubId,
}) {

    if (!creatorId || !username || !clubId) return;

    await _postToOneUserConnection(creatorId, {
        what: `JR#New`,
        username: username,
        clubId: clubId,
    });

}

async function postClubStartedMessageToWebsocketUsers({
    clubId,
    agoraToken
}) {
    if (!clubId || !agoraToken) return;

    const data = {
        what: "clubStarted",
        clubId: clubId,
        agoraToken: agoraToken,
    };

    await _postMessageToAllClubSubscribers(clubId, data);

}




async function postClubConcludedMessageToWebsocketUsers({
    clubId
}) {
    if (!clubId) return;

    const data = {
        what: "clubConcluded",
        clubId: clubId,
    };

    await _postMessageToAllClubSubscribers(clubId, data);

}



module.exports = {
    postParticipantListToWebsocketUsers,
    postBlockMessageToWebsocketUser,


    postKickOutMessageToWebsocketUser,
    postJoinRequestResponseToWebsocketUser,
    postNewJoinRequestToWebsocketUser,

    postClubStartedMessageToWebsocketUsers,
    postClubConcludedMessageToWebsocketUsers,

    postMuteMessageToParticipantOnly,
    postMuteActionMessageToClubSubscribers,

};