const Joi = require('joi');

const CommentSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    commentId: Joi.string().required(),

    username: Joi.string().required(),
    avatar: Joi.string().required(),

    body: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),
});

const CommentSchemaWithDatabaseKeys = CommentSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('COMMENT#{{timestamp}}#{{commentId}}')
    ),
});

exports.CommentSchema = CommentSchema;
exports.CommentSchemaWithDatabaseKeys = CommentSchemaWithDatabaseKeys;
