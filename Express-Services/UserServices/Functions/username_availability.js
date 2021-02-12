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

module.exports = {
    isUsernameAvailable
};