const Joi = require('joi');

const CommunityDocSchema = Joi.object({
    communityId: Joi.string().required(),

    name: Joi.string().required(),

    // allowing empty string also with max set to 100
    tagline: Joi.string().allow("").max(100),

    description: Joi.string(),

    avatar: Joi.string(),
    coverImage: Joi.string(),

    creator: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),


    hosts: Joi.any(), // data type is dynamodb set, contains avatars of allowed hosts

    liveClubCount: Joi.number().default(0),

    scheduledClubCount: Joi.number().default(0),

    memberCount: Joi.number().default(0),

});

const CommunityDocSchemaWithDatabaseKeys = CommunityDocSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#{{communityId}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITYMETA#{{communityId}}')),


    PublicSearch: Joi.number().integer().valid(0, 3).default(3), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(
        (parent, helpers) => {
            return 'COMMUNITY#' + parent.name.toLowerCase();
        }
    ), // GSI : SearchByUsernameIndex

    // based on popularity, activity and etc.
    Weight: Joi.number().default(1), // GSI: WeightIndex
});

exports.CommunityDocSchema = CommunityDocSchema;
exports.CommunityDocSchemaWithDatabaseKeys = CommunityDocSchemaWithDatabaseKeys;