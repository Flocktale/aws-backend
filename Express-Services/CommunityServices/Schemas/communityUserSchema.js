const Joi = require('joi');

const CommunityUserSchema = Joi.object({
    community: Joi.object({
        communityId: Joi.string().required(),
        name: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),
    user: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),


    // ARN of subscription point in SNS
    subscriptionArn: Joi.string().allow(null),
});

// -----------------------------------------------------------------------------------------

const CommunityHostSchema = CommunityUserSchema.append({
    type: Joi.string().default("HOST"),
});

const CommunityHostSchemaWithDatabaseKeys = CommunityHostSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#HOST#{{community.communityId}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITY#USER#{{user.userId}}')),
});

// -----------------------------------------------------------------------------------------

const CommunityMemberSchema = CommunityUserSchema.append({
    timestamp: Joi.number().default(() => Date.now()),
    invited: Joi.bool(),
    type: Joi.string().default("MEMBER"),
});

const CommunityMemberSchemaWithDatabaseKeys = CommunityMemberSchema.append({

    P_K: Joi.string().default(Joi.expression('COMMUNITY#MEMBER#{{community.communityId}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITY#USER#{{user.userId}}')),


    TimestampSortField: Joi.string().default((parent, _) => {
        // to show invited members first in descending order of index.
        let middle = '';

        if (parent.invited) {
            middle = '9#';
        }
        return `COMMUNITY-MEMBER-SORT-TIMESTAMP#${middle}${parent.timestamp}`;
    }), // GSI: TimestampSortIndex


    UsernameSortField: Joi.string().default((parent, _) => {
        return 'COMMUNITY-MEMBER-SORT-USERNAME#' + parent.user.username;
    }), //GSI: UsernameSortIndex


});

exports.CommunityHostSchemaWithDatabaseKeys = CommunityHostSchemaWithDatabaseKeys;
exports.CommunityMemberSchemaWithDatabaseKeys = CommunityMemberSchemaWithDatabaseKeys;