const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    tableName,
    WsTable,
    wsInvertIndex,
    wsUserIdIndex,
} = require('../../config');


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

    const _connectionQuery = {
        TableName: WsTable,
        IndexName: wsInvertIndex,
        KeyConditionExpression: 'skey= :skey',
        ExpressionAttributeValues: {
            ":skey": `CLUB#${clubId}`,
        },
        ProjectionExpression: 'connectionId',
    };

    const connectionData = (await dynamoClient.query(_connectionQuery).promise())['Items'];

    const postCalls = connectionData.map(async ({
        connectionId
    }) => {
        try {
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    what: "participantList",
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


// blockAction can be "blocked" or "unblocked"
async function postBlockMessageToWebsocketUser({
    clubId,
    userId,
    blockAction,
}) {

    if (!clubId || (blockAction !== "blocked" && blockAction !== "unblocked") || !userId) {
        console.log('wrong input for postBlockMessageToWebsocketUser, ', clubId, ' , ', blockAction, ' ,', userId);
    }

    const _connectionQuery = {
        TableName: WsTable,
        IndexName: wsUserIdIndex,
        Key: {
            userId: userId
        },
        AttributesToGet: ['connectionId']
    };
    const connectionData = (await dynamoClient.get(_connectionQuery).promise())['Item'];

    if (data) {
        await apigwManagementApi.postToConnection({
            ConnectionId: connectionData.connectionId,
            Data: Json.stringify({
                what: blockAction,
                clubId: clubId,
            })
        }).promise();
    }
}

async function postMuteMessageToWebsocketUser({
    userId,
    clubId
}) {

    if (!userId || !clubId) return;

    const _connectionQuery = {
        TableName: WsTable,
        IndexName: wsUserIdIndex,
        Key: {
            userId: userId
        },
        AttributesToGet: ['connectionId']
    };
    const connectionData = (await dynamoClient.get(_connectionQuery).promise())['Item'];

    if (data) {
        // sending two times to lessen the chances of message drop
        for (var i = 0; i < 2; i++) {
            await apigwManagementApi.postToConnection({
                ConnectionId: connectionData.connectionId,
                Data: Json.stringify({
                    what: 'muteParticipant',
                    clubId: clubId,
                })
            }).promise();
        }
    }

}

module.exports = {
    postParticipantListToWebsocketUsers,
    postBlockMessageToWebsocketUser,
    postMuteMessageToWebsocketUser,
};