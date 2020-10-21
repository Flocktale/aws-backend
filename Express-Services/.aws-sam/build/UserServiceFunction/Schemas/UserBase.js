const Joi = require('joi');



const UserInputSchema = Joi.object({
    //! required fields
    userId: Joi.string().required(),
    username: Joi.string().min(3).max(25).token().required(),

    createdOn: Joi.number().default(() => Date.now()),
    modifiedOn: Joi.number().default(Joi.ref('createdOn')),

    // normal fields
    name: Joi.string().min(3).max(100),
    phone: Joi.string(),
    email: Joi.string().email(),
    avatar: Joi.string(),
    bio: Joi.string(),

    termsAccepted: Joi.boolean().equal(true),
    policyAccepted: Joi.boolean().equal(true),




    //? these fields require special attention 
    lngPref: Joi.string(),
    regionCode: Joi.string(),

    geoLat: Joi.number(),
    geoLong: Joi.number(),


});

const UserInputSchemaWithDatabaseKeys = UserInputSchema.append({
    P_K: Joi.string().default(Joi.ref('userId', { adjust: value => { return 'USER#' + value; } })),
    S_K: Joi.string().default(Joi.ref('userId', { adjust: value => { return 'USERMETA#' + value } })),

    PublicSearch: Joi.number().integer().allow(0, 1).default(1),                                                    // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(Joi.ref('username', { adjust: value => { return 'USER#' + value; } })),    // GSI : SearchByUsernameIndex

});

const UserBaseCompleteSchema = UserInputSchemaWithDatabaseKeys.append({
    //! fields auto-generated from activities of user in the app.

    followerCount: Joi.number().integer().min(0).default(0),
    followingCount: Joi.number().integer().min(0).default(0),
    clubsCreated: Joi.number().integer().min(0).default(0),
    clubsParticipated: Joi.number().integer().min(0).default(0),
    kickedOutCount: Joi.number().integer().min(0).default(0),
    clubsJoinRequests: Joi.number().integer().min(0).default(0),
    clubsAttended: Joi.number().integer().min(0).default(0),


});

exports.UserInputSchema = UserInputSchema;
exports.UserInputSchemaWithDatabaseKeys = UserInputSchemaWithDatabaseKeys;
exports.UserBaseCompleteSchema = UserBaseCompleteSchema;