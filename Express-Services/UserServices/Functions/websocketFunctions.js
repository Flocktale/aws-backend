const {
    audienceDynamicDataIndex,
    dynamoClient,
    apigwManagementApi,
    myTable,
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
    };

    var participantList, connectionIds;

    const promises = [];

    const prtPromise = dynamoClient.query(_participantQuery).promise().then(({
        Items
    }) => {
        participantList = Items.map(({
            audience
        }) => {
            return audience;
        });
    });

    promises.push(prtPromise);
    promises.push(_fetchAllConnectionIdsForClub(clubId).then((ids) => {
        connectionIds = ids;
    }));

    await Promise.all(promises);

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

    const promises = [];

    for (var connection of connectionData) {
        promises.push(apigwManagementApi.postToConnection({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(data)
        }).promise());
    }

    await Promise.all(promises);

}

async function postSocialCountToBothUser({
    userId1,
    userId2
}) {
    if (!userId1 && !userId2) return;
    var user1Data, user2Data;

    await Promise.all([fetchSocialCountData(userId1), fetchSocialCountData(userId2)]).then((values) => {
        user1Data = values[0];
        user2Data = values[1];
    });

    await Promise.all([
        _postToOneUserConnection(userId1, {
            what: 'socialCounts',
            ...user1Data
        }),
        _postToOneUserConnection(userId2, {
            what: 'socialCounts',
            ...user2Data
        })
    ]);


}



module.exports = {
    postParticipantListToWebsocketUsers,
    postSocialCountToBothUser,
};