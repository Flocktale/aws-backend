const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    myTable,
    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
} = require('../config');

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

    var promises = [];

    for (var connection of connectionData) {
        promises.push(apigwManagementApi.postToConnection({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(data)
        }).promise());
    }

    await Promise.all(promises);

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





async function postParticipationInvitationMessageToInvitee({
    clubId,
    userId,
    invitationId,
    message,
}) {
    if (!clubId || !userId || !message || !invitationId) return;

    const data = {
        what: 'INV#prt',
        clubId: clubId,
        invitationId: invitationId,
        message: message,
    };

    await _postToOneUserConnection(userId, data);

}


module.exports = {

    postBlockMessageToWebsocketUser,
    postKickOutMessageToWebsocketUser,
    postJoinRequestResponseToWebsocketUser,
    postNewJoinRequestToWebsocketUser,


    postMuteMessageToParticipantOnly,
    postMuteActionMessageToClubSubscribers,

    postParticipationInvitationMessageToInvitee,

};