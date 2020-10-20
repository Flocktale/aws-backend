const Joi = require('joi');

const FollowingSchema = Joi.object({
    userId: Joi.string().required(),
    followingUserId: Joi.string().required(),

    followingUsername: Joi.string().required(),
    followingName: Joi.string().required(),
    followingAvatar: Joi.string().required(),
    timestamp: Joi.number().default(() => Date.now()),

});

const FollowingSchemaWithDatabaseKeys = FollowingSchema.append({

    P_K: Joi.string().default(Joi.ref('userId', { adjust: value => { return 'USER#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().default(`FOLLOWING#${Joi.ref('timestamp')}#${Joi.ref('followingUserId')}`),

    SocialConnectionUsername: Joi.string().default(Joi.ref('followingUsername', { adjust: value => { return 'Following#' + value; } })),    //GSI: SortedSocialRelationByUsernameIndex
});

exports.FollowingSchema = FollowingSchema;
exports.FollowingSchemaWithDatabaseKeys = FollowingSchemaWithDatabaseKeys;