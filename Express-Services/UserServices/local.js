// const app = require('./app');
// app.listen(9999, () => {
//     console.log("Listening on port 9999");
// });


// const Joi = require('joi');
const {
    isUsernameAvailable
} = require('./Functions/username_availability');

const {
    tableName,
    searchByUsernameIndex,
    dynamoClient
} = require('./config');


async function testing() {
    const username = 'mohit';

    try {
        const result = await isUsernameAvailable(username);
        console.log(result);
    } catch (error) {
        console.log(error);
    }

}

testing();