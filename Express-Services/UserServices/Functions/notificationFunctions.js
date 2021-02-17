const {
    dynamoClient,
    tableName,
    sns
} = require('../config');


const {
    NotificationSchemaWithDatabaseKeys
} = require('../Schemas/notificationSchema')

async function sendAndSaveNotification(notificationObj, callback) {
    if (!notificationObj) {
        console.log('no notificationObj was passed when _sendAndSaveNotification was called');
        return;
    }

    // first saving the notification in database.

    const notifData = await NotificationSchemaWithDatabaseKeys.validateAsync(notificationObj);

    const _notificationPutQuery = {
        TableName: tableName,
        Item: notifData,
    }

    await dynamoClient.put(_notificationPutQuery).promise();

    if (callback) {
        callback({
            notificationId: notifData.notificationId,
            type: notifData.data.type,
        });
    }


    // fetching endpoint arn to publish notification.

    const _endpointQuery = {
        TableName: tableName,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${notifData.userId}`,
        },
        AttributesToGet: ['endpointArn'],
    };

    const endpointData = (await dynamoClient.get(_endpointQuery).promise())['Item'];

    if (!endpointData) {
        return console.log('no device token is registered for userId: ', notifData.userId);
    }

    // now publishing to push notification via sns.

    const snsPushNotificationObj = {
        GCM: JSON.stringify({
            notification: {
                title: notifData.data.title,
                image: notifData.data.avatar,
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

    await sns.publish(notifParams).promise();

}

module.exports = {
    sendAndSaveNotification
};