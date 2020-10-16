const Joi = require('joi');

const FollowingSchema = Joi.object({
    userId: Joi.string().required(),
    followingUserId: Joi.string().required(),

    followingUsername: Joi.string().required(),
    followingName: Joi.string().required(),
    followingAvatar: Joi.string().required(),
    timestamp: Joi.number().default(new Date.now()),

});

const FollowingSchemaWithDatabaseKeys = FollowingSchema.append({

    PK: Joi.string().default(`USER#${Joi.ref('userId')}`),
    SK: Joi.string().default(`FOLLOWING#${Joi.ref('timestamp')}#${Joi.ref('followingUserId')}`),

    SocialConnectionUsername: Joi.string().default(`Following#${Joi.ref('followingUsername')}`),    //GSI: SortedSocialRelationByUsernameIndex
});

exports.FollowingSchema = FollowingSchema;
exports.FollowingSchemaWithDatabaseKeys = FollowingSchemaWithDatabaseKeys;