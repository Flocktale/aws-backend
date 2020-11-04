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
    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),


    S_K: Joi.string().default(
        Joi.expression('FOLLOWING#{{timestamp}}#{{followingUserId}}')
    ),

    SocialConnectionUsername: Joi.string().default(Joi.expression('Following#{{followingUsername}}')),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowingSchema = FollowingSchema;
exports.FollowingSchemaWithDatabaseKeys = FollowingSchemaWithDatabaseKeys;