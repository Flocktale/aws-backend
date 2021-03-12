const AWS = require('aws-sdk');

exports.lambdaHandler = async (event, context) => {

    console.log('event: ', event);

    for (var msg of event.Records) {
        console.log(msg.messageAttributes);
    }


    return 'Success';
};