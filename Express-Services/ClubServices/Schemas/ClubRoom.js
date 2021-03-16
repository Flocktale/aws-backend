const Joi = require('joi');

const ClubInputSchema = Joi.object({
    //! required fields
    clubId: Joi.string().required(),
    clubName: Joi.string().min(3).max(25).required(),

    creator: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().min(3).max(25).required(),
        avatar: Joi.string().required(),
    }).required(),

    agoraToken: Joi.string(),


    status: Joi.string().valid("Waiting", "Live", "Concluded").default("Waiting"), // default is "Waiting" when club is created as it not played directly.

    timeWindow: Joi.number().integer().default(1800).min(300), // expected duration of club entered at time of creation (default 1800 seconds i.e. 30 minutes)


    category: Joi.string().required(), // GSI: ClubCategoryIndex 
    subCategory: Joi.string(),


    createdOn: Joi.number().default(() => Date.now()),
    modifiedOn: Joi.number().default(Joi.ref('createdOn')),

    scheduleTime: Joi.number().default(Joi.ref('createdOn')),


    //normal fields

    clubAvatar: Joi.string(),
    description: Joi.string(),

    isLocal: Joi.boolean().default(true),
    isGlobal: Joi.boolean().default(false),
    isPrivate: Joi.boolean().default(false),

    tags: Joi.array().items(Joi.string()),

});

const ClubInputSchemaWithDatabaseKeys = ClubInputSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(Joi.expression('CLUBMETA#{{clubId}}')),

    ClubCreatorIdField: Joi.string().default(Joi.expression('USER#{{creator.userId}}')), // GSI: ClubCreatorIdIndex

    PublicSearch: Joi.number().integer().valid(0, 1).default(1), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(
        (parent, helpers) => {
            return 'CLUB#' + parent.clubName.toLowerCase();
        }

    ), // GSI : SearchByUsernameIndex

});

const ClubRoomCompleteSchema = ClubInputSchemaWithDatabaseKeys.append({
    duration: Joi.number().integer().min(300), // real duration (real playtime of club)   

    estimatedAudience: Joi.number().integer().default(0), // used for rough estimation of total audience

    participants: Joi.any(), // data type is dynamodb set, contains username of participants

});


exports.ClubInputSchema = ClubInputSchema;
exports.ClubInputSchemaWithDatabaseKeys = ClubInputSchemaWithDatabaseKeys;
exports.ClubRoomCompleteSchema = ClubRoomCompleteSchema;