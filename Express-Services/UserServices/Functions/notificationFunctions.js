const {
    dynamoClient,
    myTable,
    sns
} = require('../config');
const Constants = require('../constants');


const {
    NotificationSchemaWithDatabaseKeys
} = require('../Schemas/notificationSchema');
const {
    pushToPostNotificationQueue
} = require('./sqsFunctions');

async function sendNotifDataToSQS(notificationObj, callback) {
    if (!notificationObj) {
        console.log('no notificationObj was passed when sendNotifDataToSQS was called');
        return;
    }

    // first saving the notification in database.

    const notifData = await NotificationSchemaWithDatabaseKeys.validateAsync(notificationObj);

    await pushToPostNotificationQueue({
        action: Constants.PostNotificationQueueAction.sendAndSave,
        userId: notifData.userId,
        notifData: notifData
    })


    if (callback) {
        callback({
            notificationId: notifData.notificationId,
            type: notifData.data.type,
        });
    }

}

module.exports = {
    sendNotifDataToSQS
};