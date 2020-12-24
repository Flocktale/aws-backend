const Joi = require('joi');

const CommentSchema = Joi.object({
    clubId: Joi.string().required(),
    commentId: Joi.string().required(),

    user: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }),

    body: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),
});

const CommentSchemaWithDatabaseKeys = CommentSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('COMMENT#{{user.userId}}#{{commentId}}')
    ),

    TimestampSortField: Joi.string().default(Joi.expression('COMMENT-SORT-TIMESTAMP#{{timestamp}}#{{commentId}}')),       // GSI: TimestampSortIndex

});

exports.CommentSchema = CommentSchema;
exports.CommentSchemaWithDatabaseKeys = CommentSchemaWithDatabaseKeys;
