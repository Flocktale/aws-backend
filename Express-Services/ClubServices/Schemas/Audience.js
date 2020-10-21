const Joi = require('joi');

const AudienceSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    isOwner: Joi.boolean().default(false),

    isKickedOut: Joi.boolean().default(false),
    isPartcipant: Joi.boolean().default(false),
    joinRequested: Joi.boolean().default(false),

    joinRequestAttempts: Joi.number().default(0),

    userAvatar: Joi.string(),
    username: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),

});

const AudienceSchemaWithDatabaseKeys = AudienceSchema.append({
    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CLUB#' + value; } })),

    // TODO: I have submitted an issue on github sideway/joi {https://github.com/sideway/joi/issues/2493} for multiple reference, this method don't work as I have defined below, therefore set its value in express 
    // S_K: Joi.string().default(`AUDIENCE#${Joi.ref('timestamp')}#${Joi.ref('audienceId')}`),

    AudienceDynamicField: Joi.string().valid(Joi.ref('userId', { adjust: value => { return 'KickedOut#' + value; } }),
        Joi.ref('userId', { adjust: value => { return 'Participant#' + value; } }),
        Joi.ref('userId', { adjust: value => { return 'ActiveJoinRequest#' + value; } })
    ),         // GSI: AudienceDynamicDataIndex

});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;
