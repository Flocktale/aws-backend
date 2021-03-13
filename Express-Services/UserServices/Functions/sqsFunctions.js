const {
    sqs
} = require('../config');

const {
    nanoid
} = require('nanoid');


/**
 * action => postSocialCount, postParticipantList.
 * MessageGroupId can be "userId".
 * attributes may include user1Id, user2Id etc. (according to action)
 */
async function pushToWsMsgQueue({
    action,
    MessageGroupId,
    attributes = {},
}) {

    if (!action || !MessageGroupId) return;

    const params = {
        MessageBody: 'message from User Service Function',
        QueueUrl: 'https://sqs.ap-south-1.amazonaws.com/524663372903/WsMsgQueue.fifo',

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
        params.MessageAttributes[key] = {
            DataType: "String",
            StringValue: value,
        }
    }

    try {
        await sqs.sendMessage(params).promise();
    } catch (err) {

        console.log('error in pushing sqs message for WsMsgQueue.fifo:', err);
    }

}

module.exports = {
    pushToWsMsgQueue,
}