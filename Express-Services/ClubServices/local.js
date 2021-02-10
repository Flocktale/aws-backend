// const Joi = require('joi');

// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

// const {
//     dynamoClient,
//     tableName
// } = require('./config');


async function testing() {
    const notifData = {};

    const snsPushNotificationObj = {
        GCM: JSON.stringify({
            notification: {
                title: 'abrake davra',
                image: notifData.image,
                sound: "default",
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                priority: 'high',
            },
        }),
    };

    console.log(JSON.stringify(snsPushNotificationObj));

}



testing();