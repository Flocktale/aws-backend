const app = require('./app');
app.listen(3000, () => {
    console.log("Listening on port 3000");
});


// const Joi = require('joi');

// async function testing() {


//     const a = [{
//         'k': 'a1'
//     }, {
//         'k': 'a2'
//     }];
//     console.log(a);
//     const d = a.map(({
//         k
//     }) => {
//         return k.split('a')[1]
//     });

//     for (var z in d) {
//         console.log(z);
//     }

//     d.push('3');
//     console.log(d);


// }

// testing();