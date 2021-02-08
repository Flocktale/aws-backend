const Joi = require('joi');

const AudienceSchema = Joi.object({
    clubId: Joi.string().required(),

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
            if (parent.isPartcipant === true) {
                counter++;
                prefix = "Participant#";
            } else if (parent.joinRequested === true) {
                counter++;
                prefix = "ActiveJoinRequest#";
            }

            if (counter === 1)
                return prefix + parent.timestamp + "#" + parent.audience.userId;

            if (counter > 1) throw new Error('more than one boolean attribute is true');
        }), // GSI: AudienceDynamicDataIndex

    TimestampSortField: Joi.string().default(Joi.expression('AUDIENCE-SORT-TIMESTAMP#{{timestamp}}#{{audience.userId}}')), // GSI: TimestampSortIndex

    UsernameSortField: Joi.string().default((parent, helpers) => {
        if (parent.joinRequested === true) {
            return 'JOIN-REQUESTER-USERNAME-SORT#' + parent.audience.username;
        }
        return;
    }), //GSI: UsernameSortIndex


});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;