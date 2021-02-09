// const Joi = require('joi');

// const app = require('./app');

// app.listen(3000, () => {
//     console.log("Listening on port 3000");
// });

// const {
//     dynamoClient,
//     tableName
// } = require('./config');


async function testing() {

    const a = ['a', 'b'];
    for (var item of a) {
        console.log(item);
        abc(item);
    }

}

function abc(z) {
    setTimeout(function () {
        console.log('hey' + z);
    }, 1000);
}

testing();