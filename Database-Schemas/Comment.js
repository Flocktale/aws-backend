const Joi = require('joi');

const CommentSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    commentId: Joi.string().guid({
        version: ['uuidv4']
    }).required(),

    username: Joi.string().required(),
    avatar: Joi.string().required(),

    body: Joi.string().required(),

    timestamp: Joi.number().default(new Date.now()),
});

const CommentSchemaWithDatabaseKeys = CommentSchema.append({
    PK: Joi.string().default(`CLUB#${Joi.ref('clubId')}`),
    SK: Joi.string().equal(`COMMENT#${Joi.ref('timestamp')}#${Joi.ref('commentId')}`),
});

exports.CommentSchema = CommentSchema;
exports.CommentSchemaWithDatabaseKeys = CommentSchemaWithDatabaseKeys;
