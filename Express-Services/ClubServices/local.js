// const Joi = require('joi');

const app = require('./app');

app.listen(3000, () => {
    console.log("Listening on port 3000");
});

// const {
//     dynamoClient,
//     tableName,
//     apigwManagementApi
// } = require('./config');


// async function testing() {
//     const connectionId = 'a0R66cwXIAMCFQg=';
//     await apigwManagementApi.postToConnection({
//         ConnectionId: connectionId,
//         Data: JSON.stringify({
//             hello: 'hello'
//         })
//     }).promise();

// }

// testing();