const AWS = require('aws-sdk');

let plivo = require('plivo');
let client = new plivo.Client('MAMWY3ODGXZWY4NJQ1OD', 'Y2ViY2NjYmJjYjUzODM1YjcwMjgyMTQ3NWJmODY4');


async function sendSMS(phone, code) {
    const params = {
        Message: `OTP for FlockTale - ${code}`,
        /* required */
        PhoneNumber: phone,
    };

    try {
        const message_created = await client.messages.create(
            '+914151234567', // just random src number
            params.PhoneNumber, // destination number
            params.Message, // text message
        );
        console.log("plivo success", message_created);

    } catch (error) {
        console.log("plivo error", error);
    }

    // sending message through AWS SNS

    const sns = new AWS.SNS();
    await sns.setSMSAttributes({
        attributes: {
            'DefaultSMSType': 'Transactional'
        }
    }).promise()

    return sns.publish(params).promise();
}

exports.handler = async (event, context) => {
    console.log("CUSTOM_CHALLENGE_LAMBDA", event.request);

    let secretLoginCode;
    if (!event.request.session || !event.request.session.length) {

        // Generate a new secret login code and send it to the user
        secretLoginCode = Math.floor(Math.random() * (999999 - 100001) + 100001);

        console.log('secretLoginCode: ', secretLoginCode);

        try {
            await sendSMS(event.request.userAttributes.phone_number, secretLoginCode);
        } catch (error) {
            console.log('error in publishing sms: ', error);
            // Handle SMS Failure   
        }
    } else {

        // re-use code generated in previous challenge
        const previousChallenge = event.request.session.slice(-1)[0];
        secretLoginCode = previousChallenge.challengeMetadata.match(/CODE-(\d*)/)[1];
    }

    console.log(event.request.userAttributes);

    // Add the secret login code to the private challenge parameters
    // so it can be verified by the "Verify Auth Challenge Response" trigger
    event.response.privateChallengeParameters = {
        secretLoginCode
    };

    // Add the secret login code to the session so it is available
    // in a next invocation of the "Create Auth Challenge" trigger
    event.response.challengeMetadata = `CODE-${secretLoginCode}`;

    return event;
};