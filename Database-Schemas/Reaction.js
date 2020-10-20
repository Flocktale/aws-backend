const Joi = require('joi');

const ReactionSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    reactionId: Joi.string().guid({
        version: ['uuidv4']
    }).required(),

    // we don't need username and avatar as they will be not shown in app. But for analytics, we are storing userId.

    indexValue: Joi.number().allow(0, 1, 2).required(), // {0: Dislike, 1: Like, 2: Heart}

    timestamp: Joi.number().default(()=> Date.now()),

});

const ReactionSchemaWithDatabaseKeys = ReactionSchema.append({
    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CLUB#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().default(`REPORT#${Joi.ref('timestamp')}#${Joi.ref('reactionId')}`),
});

exports.ReactionSchema = ReactionSchema;
exports.ReactionSchemaWithDatabaseKeys = ReactionSchemaWithDatabaseKeys;
