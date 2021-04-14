const {
    sqs
} = require('../config');

const {
    nanoid
} = require('nanoid');
const Constants = require('../constants');


/**
 * action => send or sendAndSave.
 */
async function pushToPostNotificationQueue({
    action,
    userId,
    notifData,
}) {

    if (!action) return;

    if (!userId || !notifData) return;

    const params = {
        MessageBody: 'message from Community Service Function',
        QueueUrl: Constants.PostNotificationQueueUrl,
        MessageGroupId: userId,
        MessageDeduplicationId: nanoid(),

        MessageAttributes: {
            "action": {
                DataType: "String",
                StringValue: action,
            },
            "userId": {
                DataType: "String",
                StringValue: userId,
            },
            "notifData": {
                DataType: "String",
                StringValue: JSON.stringify(notifData), // converting into json string.
            }
        },
    };


    try {
        await sqs.sendMessage(params).promise();
    } catch (err) {

        console.log('error in pushing sqs message for PostNotificationQueue:', err);
    }

}

module.exports = {
    pushToPostNotificationQueue,
}