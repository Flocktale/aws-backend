// const Joi = require('joi');


// const {
//     sns
// } = require('../UserServices/config');
// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const {
    sqs,

    dynamoClient,
    myTable,
    apigwManagementApi,
    sns
} = require('./config');


// const data = require('./static/categoryData.json');


async function testing() {

    console.log(await sns.setEndpointAttributes({
        EndpointArn: "arn:aws:sns:ap-south-1:524663372903:endpoint/GCM/flocktale-fcm/1a1ce577-4910-35ce-b269-b435f9197ec7",
        Attributes: {
            Enabled: 'false',
            Token: '0#0#0#',
        }
    }).promise())

}


testing();