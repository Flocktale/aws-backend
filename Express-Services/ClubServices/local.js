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


async function testing() {

    const a = ((1000 % 101) === 0);
    console.log('a', a ? 'hello' : 'no no no no');

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