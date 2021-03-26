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
});

const CommunityHostSchemaWithDatabaseKeys = CommunityUserSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#HOST#{{community.communityId}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITY#USER#{{user.userId}}')),
});

const CommunityMemberSchemaWithDatabaseKeys = CommunityUserSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#MEMBER#{{community.communityId}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITY#USER#{{user.userId}}')),
});

exports.CommunityHostSchemaWithDatabaseKeys = CommunityHostSchemaWithDatabaseKeys;
exports.CommunityMemberSchemaWithDatabaseKeys = CommunityMemberSchemaWithDatabaseKeys;