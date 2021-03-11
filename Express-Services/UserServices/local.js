const app = require('./app');
app.listen(3000, () => {
    console.log("Listening on port 3000");
});


// const Joi = require('joi');


const {
    myTable,
    searchByUsernameIndex,
    dynamoClient
} = require('./config');


async function testing() {



}

testing();