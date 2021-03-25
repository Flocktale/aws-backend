const Joi = require('joi');

const CommunityDocSchema = Joi.object({
    communityId: Joi.string().required(),

    name: Joi.string().required(),
    description: Joi.string().required(),

    category: Joi.string().required(),

    avatar: Joi.string(),
    coverImage: Joi.string(),


    liveClubHosts: Joi.any(), // data type is dynamodb set, contains avatars of hosts of live clubs

    scheduledClubCount: Joi.number().default(0),

});

const CommunityDocSchemaWithDatabaseKeys = CommunityDocSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#CATEGORY#{{category}}')),
    S_K: Joi.string().default(Joi.expression('COMMUNITY#META#{{communityId}}')),



    PublicSearch: Joi.number().integer().valid(0, 1).default(1), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(
        (parent, helpers) => {
            return 'COMMUNITY#' + parent.name.toLowerCase();
        }
    ), // GSI : SearchByUsernameIndex
});

exports.CommunityDocSchema = CommunityDocSchema;
exports.CommunityDocSchemaWithDatabaseKeys = CommunityDocSchemaWithDatabaseKeys;