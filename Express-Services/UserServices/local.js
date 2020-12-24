const app = require('./app');
app.listen(3000, () => {
    console.log("Listening on port 3000");
});


const Joi = require('joi');

async function testing() {

    const UserRelationSchema = Joi.object({
        relationIndexObj: Joi.object({
            B1: Joi.bool().default(false),                   // (isFriend)
            B2: Joi.bool().default(false),                   // (f -> p request)
            B3: Joi.bool().default(false),                   // (p -> f request)
            B4: Joi.bool().default(false),                   // (f follows p)
            B5: Joi.bool().default(false),                   // (p follows f)
        }).required(),

        timestamp: Joi.number().default(() => Date.now()),

    });

    try {
        const data = await UserRelationSchema.validateAsync({ relationIndexObj: {} });
        console.log(data);
    } catch (error) {
        console.log(error);

    }

}

testing();