const app = require('./app');

const Joi = require('joi');


app.listen(3000, () => {
    console.log("Listening on port 3000");
});

// const { dynamoClient, tableName } = require('./config');
// const { string } = require('joi');


// async function testing() {


// }

// testing();