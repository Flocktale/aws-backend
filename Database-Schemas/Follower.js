const Joi = require('joi');

const FollowerSchema = Joi.object({
    userId: Joi.string().required(),
    followerUserId: Joi.string().required(),

    followerUsername: Joi.string().required(),
    followerName: Joi.string().required(),
    followerAvatar: Joi.string().required(),
    timestamp: Joi.number().default(new Date.now()),

});

const FollowerSchemaWithDatabaseKeys = FollowerSchema.append({

    PK: Joi.string().default(`USER#${Joi.ref('userId')}`),
    SK: Joi.string().default(`FOLLOWER#${Joi.ref('timestamp')}#${Joi.ref('followerUserId')}`),

    SocialConnectionUsername: Joi.string().default(`Follower#${Joi.ref('followerUsername')}`),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowerSchema = FollowerSchema;
exports.FollowerSchemaWithDatabaseKeys = FollowerSchemaWithDatabaseKeys;