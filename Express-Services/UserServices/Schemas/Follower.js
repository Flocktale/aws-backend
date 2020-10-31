const Joi = require('joi');

const FollowerSchema = Joi.object({
    userId: Joi.string().required(),

    followerUserId: Joi.string().required(),

    followerUsername: Joi.string().required(),
    followerName: Joi.string().required(),
    followerAvatar: Joi.string().required(),
    timestamp: Joi.number().default(() => Date.now()),

});

const FollowerSchemaWithDatabaseKeys = FollowerSchema.append({

    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),

    S_K: Joi.string().default(
        Joi.expression('FOLLOWER#{{timestamp}}#{{followerUserId}}')
    ),

    SocialConnectionUsername: Joi.string().default(Joi.expression('Follower#{{followerUsername}}')),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowerSchema = FollowerSchema;
exports.FollowerSchemaWithDatabaseKeys = FollowerSchemaWithDatabaseKeys;