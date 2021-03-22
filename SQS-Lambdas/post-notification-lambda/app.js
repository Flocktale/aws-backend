const Constants = require("./constants");

const {
    myTable,
    sns,
    dynamoClient,
} = require('./config')

exports.lambdaHandler = async (event, context) => {


    const promises = [];

    for (var msg of event.Records) {
        console.log(msg.messageAttributes);

        try {

            const action = msg.messageAttributes.action.stringValue;

            const userId = msg.messageAttributes.userId.stringValue;
            const notifData = JSON.parse(msg.messageAttributes.notifData.stringValue);


            if (action === Constants.actionName.send) {

                promises.push(publishNotification({
                    userId: userId,
                    notifData: notifData
                }));

            } else if (action === Constants.actionName.sendAndSave) {

                promises.push(publishNotification({
                    userId: userId,
                    notifData: notifData,
                    toSave: true,
                }));

            }

        } catch (error) {
            console.log('error catched: ', error);
        }

    }

    await Promise.all(promises);

    return 'Success';
};


async function publishNotification({
    userId,
    notifData,
    toSave = false,
}) {

    if (!userId || !notifData) {
        return;
    }

    const promises = [];
    var endpointData;

    if (toSave === true) {
        promises.push(saveNotification({
            userId: userId,
            notifData: notifData
        }));
    }


    // fetching endpoint arn to publish notification.
    const _endpointQuery = {
        TableName: myTable,
        Key: {
            P_K: 'SNS_DATA#',
            S_K: `USER#${userId}`,
        },
        AttributesToGet: ['endpointArn'],
    };

    promises.push(dynamoClient.get(_endpointQuery).promise().then(({
        Item
    }) => {
        endpointData = Item;
    }))


    await Promise.all(promises);

    if (!endpointData) {
        return console.log('no device token is registered for userId: ', userId);
    }

    // now publishing to push notification via sns.

    var image;
    if (notifData.data.secondaryAvatar) {
        image = notifData.data.secondaryAvatar;
    } else {
        image = notifData.data.avatar;
    }

    const snsPushNotificationObj = {
        GCM: JSON.stringify({
            notification: {
                title: notifData.data.title,
                image: image + '_large',
                sound: "default",
                color: '#fff74040',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                icon: 'ic_notification',
            },
            priority: 'HIGH',

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


async function saveNotification({
    userId,
    notifData,
}) {

    if (!userId || !notifData) {
        return;
    }

    const _notificationPutQuery = {
        TableName: myTable,
        Item: notifData,
    }

    await dynamoClient.put(_notificationPutQuery).promise();

}