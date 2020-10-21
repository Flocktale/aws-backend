const Joi = require('joi');

const FollowRequestSchema = Joi.object({
    userId: Joi.string().required(),
    username: Joi.string().required(),
    name: Joi.string().required(),
    avatar: Joi.string().required(),

    requestedUserId: Joi.string().required(),
    requestedUsername: Joi.string().required(),
    requestedName: Joi.string().required(),
    requestedAvatar: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),

});

const FollowRequestSchemaWithDatabaseKeys = FollowRequestSchema.append({

    P_K: Joi.string().default(Joi.ref('userId', { adjust: value => { return 'USER#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().default(`FOLLOWREQUEST#${Joi.ref('timestamp')}#${Joi.ref('requestedUserId')}`),

    FollowRequestReceiver: Joi.string().default(Joi.ref('requestedUserId', { adjust: value => { return 'FOLLOWREQUEST-RECEIVED#' + value; } })), //GSI: ReceivedFollowRequestIndex


    //! This GSI will only sort sent follow requests of a user but not received requests.
    SocialConnectionUsername: Joi.string().default(Joi.ref('requestedUsername', { adjust: value => { return 'FollowRequest#' + value; } })),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowRequestSchema = FollowRequestSchema;
exports.FollowRequestSchemaWithDatabaseKeys = FollowRequestSchemaWithDatabaseKeys;