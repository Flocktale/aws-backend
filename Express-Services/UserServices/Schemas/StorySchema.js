const Joi = require('joi');

const StorySchema = Joi.object({

    user: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }),


    url: Joi.string().required(),

    storyId: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),


});

const StorySchemaWithDatabaseKeys = StorySchema.append({
    P_K: Joi.string().default(Joi.expression('USER#{{user.userId}}')),

    S_K: Joi.string().default(Joi.expression('STORY#{{storyId}}')),

    TimestampSortField: Joi.string().default(Joi.expression('STORY-SORT-TIMESTAMP#{{timestamp}}')), // GSI: TimestampSortIndex
});

exports.StorySchema = StorySchema;
exports.StorySchemaWithDatabaseKeys = StorySchemaWithDatabaseKeys;