const app = require('./app');

const Joi = require('joi');


app.listen(3000, () => {
    console.log("Listening on port 3000");
});

const {
    dynamoClient,
    tableName
} = require('./config');
const {
    string
} = require('joi');


async function testing() {
    const ab = {
        ran: 5,
        def: 8
    };

    const x = {
        ...ab
    };
    x["jk"] = 10;

    console.log(ab);
    console.log(x);
}

testing();