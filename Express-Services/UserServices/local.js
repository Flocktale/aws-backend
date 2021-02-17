const app = require('./app');
app.listen(3000, () => {
    console.log("Listening on port 3000");
});


// const Joi = require('joi');
// const {
//     isUsernameAvailable
// } = require('./Functions/username_availability');

// const {
//     tableName,
//     searchByUsernameIndex,
//     dynamoClient
// } = require('./config');


// async function testing() {
//     console.log('abcd: ' + Date.now() + ' hello');

// }

// testing();