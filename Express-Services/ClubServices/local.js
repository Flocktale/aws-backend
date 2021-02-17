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

//     await func(async str => {

//         console.log(str);

//         const c = await dynamoClient.get({
//             TableName: tableName,
//             Key: {
//                 P_K: 'USER',
//                 S_K: 'USER'
//             }
//         }).promise();
//         console.log('c: ', c);


//     });
//     console.log('hey there');

// }

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

// testing();