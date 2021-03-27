const {
    imageUploadConstParams,
    s3,
    myTable,
    dynamoClient,
    sns,
} = require('../config');
const Constants = require('../constants');

async function uploadFile(key, buffer) {
    return new Promise(async function (resolve, reject) {

        var params = {
            ...imageUploadConstParams,
            Body: buffer,
            Key: key,
        };

        s3.upload(params, function (s3Err, data) {
            if (s3Err) {
                reject('error in uploading image: ', s3Err);
            }
            resolve(data);
        });
    });
}

async function subscribeUserToCommunityTopic({
    communityId,
    userId,
    type = 'MEMBER'
}) {

    if (!communityId || !userId) return;

    const topicArn = Constants.snsTopicArn(communityId);

    const oldData = (await dynamoClient.get({
        TableName: myTable,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${userId}`
        },
        AttributesToGet: ['endpointArn'],
    }).promise())['Item'];

    if (oldData) {
        const subscriptionArn = (await sns.subscribe({
            Protocol: 'application',
            TopicArn: topicArn,
            Endpoint: oldData['endpointArn'],
        }).promise())['SubscriptionArn'];

        await dynamoClient.update({
            TableName: myTable,
            Key: {
                P_K: `COMMUNITY#${type}#${communityId}`,
                S_K: `COMMUNITY#USER#${userId}`,
            },
            UpdateExpression: 'set subscriptionArn = :arn',
            ExpressionAttributeValues: {
                ':arn': subscriptionArn,
            }
        }).promise();
    }
}

async function unsubscribeUserFromCommunityTopic({
    communityId,
    userId,
    type = 'MEMBER'
}) {
    if (!communityId || !userId) return;


    const data = (await dynamoClient.get({
        TableName: myTable,
        Key: {
            P_K: `COMMUNITY#${type}#${communityId}`,
            S_K: `COMMUNITY#USER#${userId}`,
        },
        AttributesToGet: ['subscriptionArn']
    }).promise())['Item'];

    if (data && data.subscriptionArn) {
        await sns.unsubscribe({
            SubscriptionArn: data.subscriptionArn
        }).promise();
    }
}



module.exports = {
    uploadFile,
    subscribeUserToCommunityTopic,
    unsubscribeUserFromCommunityTopic,
};