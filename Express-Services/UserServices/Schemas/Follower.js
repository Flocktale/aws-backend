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

    P_K: Joi.string().default(Joi.ref('userId', { adjust: value => { return 'USER#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().default(`FOLLOWER#${Joi.ref('timestamp')}#${Joi.ref('followerUserId')}`),

    SocialConnectionUsername: Joi.string().default(Joi.ref('followerUsername', { adjust: value => { return 'Follower#' + value; } })),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowerSchema = FollowerSchema;
exports.FollowerSchemaWithDatabaseKeys = FollowerSchemaWithDatabaseKeys;