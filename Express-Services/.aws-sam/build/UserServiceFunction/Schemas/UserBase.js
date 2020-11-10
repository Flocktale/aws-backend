const Joi = require('joi');

const UserInputSchema = Joi.object({
    //! required fields
    userId: Joi.string().required(),
    username: Joi.string().min(3).max(25).token().required(),
    avatar: Joi.string().required(),

    createdOn: Joi.number().default(() => Date.now()),
    modifiedOn: Joi.number().default(Joi.ref('createdOn')),

    // normal fields
    name: Joi.string().min(3).max(100),
    phone: Joi.string(),
    email: Joi.string().email(),
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
    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),
    S_K: Joi.string().default(Joi.expression('USERMETA#{{userId}}')),

    PublicSearch: Joi.number().integer().allow(0, 1).default(1),                        // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(Joi.expression('USER#{{username}}')),          // GSI : SearchByUsernameIndex

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