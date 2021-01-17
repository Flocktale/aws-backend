// const app = require('./app');

// const Joi = require('joi');


// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const {
    dynamoClient,
    tableName
} = require('./config');
const {
    string
} = require('joi');


async function testing() {
    const clubId = "hHvOI2XuLI_702QzsktgI";
    const _clubQuery = {
        TableName: tableName,
        Key: {
            P_K: `CLUB#${clubId}`,
            S_K: `CLUBMETA#${clubId}`,
        },
        AttributesToGet: ['creator.userId', 'creator.username', 'creator'],
    };

    try {
        const _clubData = (await dynamoClient.get(_clubQuery).promise())['Item'];
        console.log('data', _clubData);
        console.log('data', _clubData.creator);
        console.log('data', _clubData.creator.userId);
    } catch (error) {
        console.log('error', error);

    }

}

testing();