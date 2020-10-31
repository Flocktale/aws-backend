const Joi = require('joi');

const AudienceSchema = Joi.object({
    clubId: Joi.string().required(),
    creatorId: Joi.string().required(),

    audienceId: Joi.string().required(),            //GSI: AllClubsOfAudienceIndex

    isOwner: Joi.boolean().default(false),

    isKickedOut: Joi.boolean().default(false),
    isPartcipant: Joi.boolean().default(false),
    joinRequested: Joi.boolean().default(false),

    joinRequestAttempts: Joi.number().default(0),

    avatar: Joi.string(),
    username: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),

});

const AudienceSchemaWithDatabaseKeys = AudienceSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('AUDIENCE#{{timestamp}}#{{audienceId}}')
    ),

    AudienceDynamicField: Joi.string(),     // GSI: AudienceDynamicDataIndex

    // possibleValues of AudienceDynamicField  =>(
    //     Joi.expression('KickedOut#{{new_timestamp}}#{{audienceId}}'),
    //     Joi.expression('Participant#{{new_timestamp}}#{{audienceId}}'),
    //     Joi.expression('ActiveJoinRequest#{{new_timestamp}}#{{audienceId}}'),
    // ),       


});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;
