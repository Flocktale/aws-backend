// const Joi = require('joi');


// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const {
    sqs,

    dynamoClient,
    myTable,
    apigwManagementApi
} = require('./config');


// const data = require('./static/categoryData.json');


async function testing() {
    const data = (await dynamoClient.get({
        TableName: myTable,
        Key: {
            "P_K": "CLUB#XLR-W5YiBoewQqcn_wSCR",
            "S_K": "CLUBMETA#XLR-W5YiBoewQqcn_wSCR",
        },
        AttributesToGet: ['participants']
    }).promise())['Item']['participants'];

    for (var a of data.values) {
        console.log(a);
    }

    console.log(data);
    console.log(data.values);
}


testing();