const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    tableName,
    WsTable,
    wsInvertIndex,
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



module.exports = {
    postParticipantListToWebsocketUsers,
};