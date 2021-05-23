const {
    sqs
} = require('../config');

const {
    nanoid
} = require('nanoid');
const Constants = require('../constants');


/**
 * action => postParticipantList, clubStarted etc.
 * MessageGroupId can be "clubId".
 * attributes may include clubId, agoraToken etc. (according to action)
 */
async function pushToWsMsgQueue({
    action,
    MessageGroupId,
    attributes = {},
}) {

    if (!action || !MessageGroupId) return;

    const params = {
        MessageBody: 'message from Club Service Function',
        QueueUrl: Constants.WsMsgQueueUrl,

        MessageAttributes: {
            "action": {
                DataType: "String",
                StringValue: action,
            }
        },
        MessageDeduplicationId: nanoid(),
        MessageGroupId: MessageGroupId,
    };


    for (const [key, value] of Object.entries(attributes)) {
        var val = value;
        if (val && typeof val === 'object') {
            try {
                val = JSON.stringify(val);
            } catch (_) {}

        }
        params.MessageAttributes[key] = {
            DataType: "String",
            StringValue: val,
        }
    }

    try {
        await sqs.sendMessage(params).promise();
    } catch (err) {

        console.log('error in pushing sqs message for WsMsgQueue.fifo:', err);
    }

}



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
        MessageBody: 'message from Club Service Function',
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
    pushToWsMsgQueue,
    pushToPostNotificationQueue,
}