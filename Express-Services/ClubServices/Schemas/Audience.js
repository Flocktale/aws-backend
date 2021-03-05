const Joi = require('joi');
const Constants = require('../constants');

const AudienceSchema = Joi.object({
    clubId: Joi.string().required(),

    // exists only for owner
    isOwner: Joi.boolean(),

    status: Joi.string(),

    joinRequestAttempts: Joi.number().default(0),

    audience: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),

    isMuted: Joi.bool().default(true),

    timestamp: Joi.number().default(() => Date.now()),


    //invitationId exists when user has a pending invitation for participation in club, otherwise it is deleted/non-existent. 
    invitationId: Joi.string(),

});

const AudienceSchemaWithDatabaseKeys = AudienceSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('AUDIENCE#{{audience.userId}}')
    ),

    // this field is not for just audience
    AudienceDynamicField: Joi.string()
        .default((parent, helpers) => {

            if (parent.status) {
                const prefix = parent.status;

                if (Constants.isAudienceStatusValid(prefix)) {
                    return prefix + '#' + parent.timestamp + "#" + parent.audience.userId;
                } else {
                    throw new Error('invalid value of audience status');
                }
            }

            return;
        }), // GSI: AudienceDynamicDataIndex


    TimestampSortField: Joi.string().default(Joi.expression('AUDIENCE-SORT-TIMESTAMP#{{timestamp}}#{{audience.userId}}')), // GSI: TimestampSortIndex

    UsernameSortField: Joi.string().default((parent, helpers) => {
        if (parent.status === Constants.AudienceStatus.ActiveJoinRequest) {
            return 'JOIN-REQUESTER-USERNAME-SORT#' + parent.audience.username;
        }
        return;
    }), //GSI: UsernameSortIndex


});

exports.AudienceSchema = AudienceSchema;
exports.AudienceSchemaWithDatabaseKeys = AudienceSchemaWithDatabaseKeys;