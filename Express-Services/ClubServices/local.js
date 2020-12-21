const app = require('./app');

const Joi = require('joi');


// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const { dynamoClient, tableName } = require('./config');


async function testing() {
    try {


        const data = await Joi.object({ a: Joi.string().required() }).validateAsync({
            a: '1',
            b: '2'
        });

        console.log(data);

        // const data = (await dynamoClient.get({
        //     TableName: tableName,
        //     Key: {
        //         P_K: `USER#4`,
        //         S_K: 'chec',
        //     }
        // }).promise())['Item'];
        // console.log(data);
        // if (data) {
        //     console.log('h bhai h');
        // }
    } catch (error) {
        console.log(error);
    }
}

testing();