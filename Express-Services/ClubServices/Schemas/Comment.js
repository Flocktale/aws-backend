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

    timestamp: Joi.number().default(()=> Date.now()),
});

const CommentSchemaWithDatabaseKeys = CommentSchema.append({
    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CLUB#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().equal(`COMMENT#${Joi.ref('timestamp')}#${Joi.ref('commentId')}`),
});

exports.CommentSchema = CommentSchema;
exports.CommentSchemaWithDatabaseKeys = CommentSchemaWithDatabaseKeys;
