const Joi = require('joi');

const ClubInputSchema = Joi.object({
    //! required fields
    clubId: Joi.string().required(),
    clubName: Joi.string().required(),

    creator: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().min(3).max(25).required(),
        avatar: Joi.string().required(),
    }).required(),

    agoraToken: Joi.string().allow(null),

    status: Joi.string().valid("Waiting", "Live", "Concluded").default("Waiting"), // default is "Waiting" when club is created as it is not played directly.

    category: Joi.string().required(), // GSI: ClubCategoryIndex 
    subCategory: Joi.string().allow(null),

    community: Joi.object({
        communityId: Joi.string().required(),
        name: Joi.string().required(),
        avatar: Joi.string().required(),
    }),


    createdOn: Joi.number().default(() => Date.now()),
    modifiedOn: Joi.number().default(Joi.ref('createdOn')),

    scheduleTime: Joi.number().default(Joi.ref('createdOn')),


    //normal fields

    clubAvatar: Joi.string().allow(null),
    description: Joi.string().allow(null),

    // to redirect to any article, product or movie etc.
    externalUrl: Joi.array().items(Joi.string()),

    isLocal: Joi.boolean().default(true),
    isGlobal: Joi.boolean().default(false),
    isPrivate: Joi.boolean().default(false),

    tags: Joi.array().items(Joi.string()),

});

const ClubInputSchemaWithDatabaseKeys = ClubInputSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(Joi.expression('CLUBMETA#{{clubId}}')),

    ClubCreatorIdField: Joi.string().default(Joi.expression('USER#{{creator.userId}}')), // GSI: ClubCreatorIdIndex

    ClubCommunityField: Joi.string().default((parent, _) => {
        if (parent.community && parent.community.communityId) {
            return 'COMMUNITY#CLUB#' + parent.community.communityId;
        }
    }), // GSI: ClubCommunityIndex


    // to connect news and commerce and etc related content with club. 
    ClubContentField: Joi.string().allow(null), // GSI: ClubContentIndex

    PublicSearch: Joi.number().integer().valid(0, 2).default(2), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(
        (parent, helpers) => {
            return 'CLUB#' + parent.clubName.toLowerCase();
        }

    ), // GSI : SearchByUsernameIndex



});

const ClubRoomCompleteSchema = ClubInputSchemaWithDatabaseKeys.append({
    duration: Joi.number().integer().min(300), // real duration (real playtime of club)   

    estimatedAudience: Joi.number().integer().default(0), // used for rough estimation of total audience

    participants: Joi.any(), // data type is dynamodb set, contains avatar of participants

});


exports.ClubInputSchema = ClubInputSchema;
exports.ClubInputSchemaWithDatabaseKeys = ClubInputSchemaWithDatabaseKeys;
exports.ClubRoomCompleteSchema = ClubRoomCompleteSchema;