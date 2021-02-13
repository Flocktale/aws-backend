// const Joi = require('joi');

// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

const {
    dynamoClient,
    tableName
} = require('./config');


async function testing() {

    const a = {
        a: 'abc'
    };
    a.a += '   def';
    console.error(a);
    if (a.b) {
        console.log(a.b);
    }

}





testing();