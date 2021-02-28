const {
    dynamoClient,
    tableName,
    searchByUsernameIndex,
} = require('../config');

async function isUsernameAvailable(username) {
    if (!username) return null;

    const query = {
        TableName: tableName,
        IndexName: searchByUsernameIndex,

        KeyConditionExpression: 'PublicSearch = :ps and FilterDataName = :fd ',
        ExpressionAttributeValues: {
            ":ps": 1,
            ":fd": `USER#${username}`
        },
        ProjectionExpression: 'username',
    };
    const data = (await dynamoClient.query(query).promise())['Items'];
    console.log(data);

    for (var item of data) {
        // it means username already exists and not available
        if (item && item.username === username) return false;
    }

    // username is available
    return true;

}

async function fetchSocialCountData(userId) {
    if (!userId) return;

    const _query = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `USERMETA#${userId}`,
        },
        AttributesToGet: ['followerCount', 'followingCount', 'friendsCount'],
    };
    const data = (await dynamoClient.get(_query).promise())['Item'];
    return data;
}


async function fetchSocialRelationIndexObj({
    userId,
    foreignUserId
}) {
    if (!userId || !foreignUserId) return;

    const _query = {
        TableName: tableName,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: ['relationIndexObj'],
    }
    const data = (await dynamoClient.get(_query).promise())['Item'];
    return data;
}



module.exports = {
    isUsernameAvailable,
    fetchSocialCountData,
    fetchSocialRelationIndexObj
};