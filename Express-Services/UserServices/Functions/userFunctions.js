const {
    dynamoClient,
    myTable,
    searchByUsernameIndex,
    imageUploadConstParams,
    s3
} = require('../config');

const {
    UserNameSchema
} = require('../Schemas/UserBase');
const {
    RelationIndexObjectSchema
} = require('../Schemas/UserRelation');

async function isUsernameAvailable(username) {
    if (!username) return null;

    username = username.toLowerCase();

    return new Promise(async (resolve, reject) => {

        // validating the username with our schema.
        try {

            await UserNameSchema.validateAsync({
                username: username
            });
        } catch (error) {
            reject('INVALID_USERNAME');
        }

        var lastevaluatedkey;

        do {
            const data = await dynamoClient.query({
                TableName: myTable,
                IndexName: searchByUsernameIndex,
                KeyConditionExpression: 'PublicSearch = :ps and FilterDataName = :fd ',
                ExpressionAttributeValues: {
                    ":ps": 1,
                    ":fd": `USER#${username}`
                },
                ProjectionExpression: 'username',
                Limit: 1,
                ExclusiveStartKey: lastevaluatedkey,
            }).promise();

            const item = data['Items'][0];
            if (item && item.username === username) {
                // it means username already exists and not available
                resolve(false);
            }

            lastevaluatedkey = data['LastEvaluatedKey'];

        }
        while (lastevaluatedkey)

        // username is available
        resolve(true);
    });

}

async function fetchSocialCountData(userId) {
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


async function fetchSocialRelationIndexObj({
    userId,
    foreignUserId
}) {
    if (!userId || !foreignUserId) return;

    const _query = {
        TableName: myTable,
        Key: {
            P_K: `USER#${userId}`,
            S_K: `RELATION#${foreignUserId}`
        },
        AttributesToGet: ['relationIndexObj'],
    }
    const data = (await dynamoClient.get(_query).promise())['Item'];
    if (!data) {
        return await RelationIndexObjectSchema.validateAsync({
            relationIndexObj: {}
        });

    }
    return data;
}



async function uploadFile(key, buffer) {
    return new Promise(async function (resolve, reject) {

        var params = {
            ...imageUploadConstParams,
            Body: buffer,
            Key: key,
        };

        await s3.upload(params, function (s3Err, data) {
            if (s3Err) {
                reject('error in uploading image: ', s3Err);
            }
            resolve(data);
        });
    });
}



module.exports = {
    isUsernameAvailable,
    fetchSocialCountData,
    fetchSocialRelationIndexObj,
    uploadFile
};