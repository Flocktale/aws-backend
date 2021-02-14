// const Joi = require('joi');

const app = require('./app');

app.listen(3000, () => {
    console.log("Listening on port 3000");
});

// const {
//     dynamoClient,
//     tableName
// } = require('./config');


async function testing() {

    try {
        const a = await init();
        console.log(a?.hello);
    } catch (error) {
        console.log(error);
    }
    // a.then((res) => {
    //     console.log(res);
    // }).catch(res => {
    //     console.log(res);
    // })

}

async function init() {

    return new Promise(function (resolve, reject) {
        resolve({
            hello: 'ag'
        });
        resolve(undefined);
        // reject('denied');
    });
}

testing();