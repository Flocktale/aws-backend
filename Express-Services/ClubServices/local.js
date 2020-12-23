const app = require('./app');

const Joi = require('joi');


// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const { dynamoClient, tableName } = require('./config');
const { string } = require('joi');


async function testing() {
    try {


        const data = await Joi.object({

            aa: Joi.number().required(),
            a: Joi.number().required(),
            b: Joi.boolean().valid(false).default(true),
            c: Joi.string()
                .valid(`Worked#1`)
                .default((parent, helpers) => {
                    // console.log('parent : ', parent);
                    // console.log('helpers : ', helpers);

                    throw new Error('more than one boolean attribute is true');

                    // if (parent.aa === 2)
                    // return 'helo#' + parent.aa;

                    // else if (parent.a === 1) return 'null';
                }),


        }).validateAsync({
            aa: '2',
            a: '3',
            // b: true
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
        console.log(error.details[0].context.error);
    }
}

testing();