const Joi = require('joi');

const CommunityDocSchema = Joi.object({
    communityId: Joi.string().required(),

    name: Joi.string().required(),
    description: Joi.string().required(),

    avatar: Joi.string(),
    coverImage: Joi.string(),


    liveClubHosts: Joi.any(), // data type is dynamodb set, contains avatars of hosts of live clubs

    scheduledClubCount: Joi.number().default(0),

    memberCount: Joi.number().default(0),

});

const CommunityDocSchemaWithDatabaseKeys = CommunityDocSchema.append({
    P_K: Joi.string().default(Joi.expression('COMMUNITY#DATA')),
    S_K: Joi.string().default(Joi.expression('COMMUNITYMETA#{{communityId}}')),


    PublicSearch: Joi.number().integer().valid(0, 3).default(3), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(
        (parent, helpers) => {
            return 'COMMUNITY#' + parent.name.toLowerCase();
        }
    ), // GSI : SearchByUsernameIndex
});

exports.CommunityDocSchema = CommunityDocSchema;
exports.CommunityDocSchemaWithDatabaseKeys = CommunityDocSchemaWithDatabaseKeys;