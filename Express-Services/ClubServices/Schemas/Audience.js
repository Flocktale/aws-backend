const Joi = require('joi');

const AudienceSchema = Joi.object({
    clubId: Joi.string().required(),

    isKickedOut: Joi.boolean().default(false),
    isPartcipant: Joi.boolean().default(false),
    joinRequested: Joi.boolean().default(false),

    joinRequestAttempts: Joi.number().default(0),


    audience: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),

    timestamp: Joi.number().default(() => Date.now()),

});

const AudienceSchemaWithDatabaseKeys = AudienceSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('AUDIENCE#{{audience.userId}}')
    ),

    AudienceDynamicField: Joi.string()
        .default((parent, helpers) => {
            let counter = 0;
            let prefix;
            if (parent.isKickedOut === true) { counter++; prefix = "KickedOut#"; }
            else if (parent.isPartcipant === true) { counter++; prefix = "Participant#"; }
            else if (parent.joinRequested === true) { counter++; prefix = "ActiveJoinRequest#"; }

            if (counter === 1)
                return prefix + parent.timestamp + "#" + parent.audience.userId;

            if (counter > 1) throw new Error('more than one boolean attribute is true');
        }),                                                                           // GSI: AudienceDynamicDataIndex

    TimestampSortField: Joi.string().default('AUDIENCE-SORT-TIMESTAMP#{{timestamp}}#{{audience.userId}}'),       // GSI: TimestampSortIndex

});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;
