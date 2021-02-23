const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    tableName,
    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
} = require('../config');
const {
    fetchSocialCountData
} = require('./userFunctions');

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

async function postParticipantListToWebsocketUsers(clubId) {
    if (!clubId) return;

    const _participantQuery = {
        TableName: tableName,
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
    }

    const participantList = (await dynamoClient.query(_participantQuery).promise())['Items'].map(({
        audience
    }) => {
        return audience;
    });



    const connectionIds = await _fetchAllConnectionIdsForClub(clubId);

    const postCalls = connectionIds.map(async connectionId => {
        try {
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    what: "participantList",
                    clubId: clubId,
                    participantList: participantList,
                })
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

async function postSocialCountToBothUser({
    userId1,
    userId2
}) {
    if (!userId1 && !userId2) return;

    const user1Data = await fetchSocialCountData(userId1);

    await _postToOneUserConnection(userId1, {
        what: 'socialCounts',
        ...user1Data
    });

    const user2Data = await fetchSocialCountData(userId2);

    await _postToOneUserConnection(userId2, {
        what: 'socialCounts',
        ...user2Data
    });

}



module.exports = {
    postParticipantListToWebsocketUsers,
    postSocialCountToBothUser,
};