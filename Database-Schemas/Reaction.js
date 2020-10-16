const Joi = require('joi');

const ReactionSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    reactionId: Joi.string().guid({
        version: ['uuidv4']
    }).required(),

    // we don't need username and avatar as they will be not shown in app. But for analytics, we are storing userId.

    indexValue: Joi.number().allow(0, 1, 2).required(), // {0: Dislike, 1: Like, 2: Heart}

    timestamp: Joi.number().default(new Date.now()),

});

const ReactionSchemaWithDatabaseKeys = ReactionSchema.append({
    PK: Joi.string().default(`CLUB#${Joi.ref('clubId')}`),
    SK: Joi.string().default(`REPORT#${Joi.ref('timestamp')}#${Joi.ref('reactionId')}`),
});

exports.ReactionSchema = ReactionSchema;
exports.ReactionSchemaWithDatabaseKeys = ReactionSchemaWithDatabaseKeys;
