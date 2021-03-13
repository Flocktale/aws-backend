// const Joi = require('joi');


const app = require('./app');

app.listen(3000, () => {
    console.log("Listening on port 3000");
});

const {
    sqs,

    dynamoClient,
    myTable,
    apigwManagementApi
} = require('./config');


// const data = require('./static/categoryData.json');


async function testing() {

    const a = {
        hello: 1,
        bye: 'bye'
    };
    for (var key in a) {
        console.log(key);
    }

    for (const [key, value] of Object.entries(a)) {
        console.log(key, value);
    }

}


testing();