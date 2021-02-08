const app = require('./app');

app.listen(3000, () => {
    console.log("Listening on port 3000");
});

// const {
//     dynamoClient,
//     tableName
// } = require('./config');

// const Joi = require('joi');

// const {
//     string
// } = require('joi');


// async function testing() {

//     const schema = Joi.object({
//         a: Joi.number().required(),
//         z: Joi.string().default((parents, helpers) => {
//             if (parents.a === 4) {
//                 return 'maza aayega';
//             }

//             // return;
//         }),
//     });

//     console.log(await schema.validateAsync({
//         a: 4
//     }));
//     console.log(await schema.validateAsync({
//         a: 5
//     }));
// }

// testing();