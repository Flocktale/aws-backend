const Joi = require('joi');

const ReactionSchema = Joi.object({
    clubId: Joi.string().required(),

    user: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }),

    indexValue: Joi.number().valid(0, 1, 2).required(), // {0: Dislike, 1: Like, 2: Heart}

    timestamp: Joi.number().default(() => Date.now()),

});

const ReactionSchemaWithDatabaseKeys = ReactionSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(Joi.expression('REACT#{{user.userId}}')),

    TimestampSortField: Joi.string().default('REACT-SORT-TIMESTAMP#{{timestamp}}#{{user.userId}}'),       // GSI: TimestampSortIndex

});

exports.ReactionSchema = ReactionSchema;
exports.ReactionSchemaWithDatabaseKeys = ReactionSchemaWithDatabaseKeys;
