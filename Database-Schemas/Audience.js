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

    timestamp: Joi.number().default(new Date.now()),

});

const AudienceSchemaWithDatabaseKeys = AudienceSchema.append({
    PK: Joi.string().default(`CLUB#${Joi.ref('clubId')}`),
    SK: Joi.string().default(`AUDIENCE#${Joi.ref('timestamp')}#${Joi.ref('audienceId')}`),

    AudienceDynamicField: Joi.string().valid(`KickedOut#${Joi.ref('userId')}`,
        `Participant#${Joi.ref('userId')}`,
        `ActiveJoinRequest#${Joi.ref('userId')}`
    ),         // GSI: AudienceDynamicDataIndex

});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;
