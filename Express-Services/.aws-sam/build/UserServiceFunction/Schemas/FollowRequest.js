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

    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),

    S_K: Joi.string().default(
        Joi.expression('FOLLOWREQUEST#{{timestamp}}#{{requestedUserId}}')
    ),

    FollowRequestReceiver: Joi.string().default(Joi.expression('FOLLOWREQUEST-RECEIVED#{{requestedUserId}}')), //GSI: ReceivedFollowRequestIndex

    //! This GSI will only sort sent follow requests of a user but not received requests.
    SocialConnectionUsername: Joi.string().default(Joi.expression('FollowRequest#{{requestedUsername}}')),    //GSI: SortedSocialRelationByUsernameIndex

});

exports.FollowRequestSchema = FollowRequestSchema;
exports.FollowRequestSchemaWithDatabaseKeys = FollowRequestSchemaWithDatabaseKeys;