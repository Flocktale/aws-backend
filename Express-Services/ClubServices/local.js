// const Joi = require('joi');

// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

// const {
//     dynamoClient,
//     tableName,
//     apigwManagementApi
// } = require('./config');

const data = require('./static/categoryData.json');

async function testing() {
    console.log(data);

}

// async function func(callback) {

//     const a = await dynamoClient.get({
//         TableName: tableName,
//         Key: {
//             P_K: 'USER',
//             S_K: 'USER'
//         }
//     }).promise();
//     console.log('a: ', a);

//     callback('here lies a callback');
//     const b = await dynamoClient.get({
//         TableName: tableName,
//         Key: {
//             P_K: 'USER',
//             S_K: 'USER'
//         }
//     }).promise();
//     console.log('b: ', b);

// }

testing();