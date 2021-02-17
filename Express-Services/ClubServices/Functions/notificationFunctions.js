const {
    dynamoClient,
    tableName,
    sns
} = require('../config');

async function publishNotification({
    userId,
    notifData,
}) {

    if (!userId || !notifData) {
        return;
    }

    // fetching endpoint arn to publish notification.

    const _endpointQuery = {
        TableName: tableName,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${userId}`,
        },
        AttributesToGet: ['endpointArn'],
    };

    const endpointData = (await dynamoClient.get(_endpointQuery).promise())['Item'];

    if (!endpointData) {
        return console.log('no device token is registered for userId: ', userId);
    }

    // now publishing to push notification via sns.

    const snsPushNotificationObj = {
        GCM: JSON.stringify({
            notification: {
                title: notifData.title,
                image: notifData.image,
                sound: "default",
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                priority: 'high',
            },
        }),
    };


    var notifParams = {
        Message: JSON.stringify(snsPushNotificationObj),
        MessageStructure: 'json',
        TargetArn: endpointData.endpointArn,
    };

    try {
        await sns.publish(notifParams).promise();

    } catch (error) {
        console.log('error while publishing notification: ', error);
    }
}

module.exports = {
    publishNotification,
};