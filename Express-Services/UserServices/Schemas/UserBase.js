const Joi = require('joi');

const UserNameSchema = Joi.object({
    username: Joi.string().min(3).max(25).token().lowercase().required(),
})

const UserInputSchema = UserNameSchema.append({
    //! required fields
    userId: Joi.string().required(),
    avatar: Joi.string().required(),

    createdOn: Joi.number().default(() => Date.now()),
    modifiedOn: Joi.number().default(Joi.ref('createdOn')),

    // normal fields

    name: Joi.string().min(3).max(100),
    phone: Joi.string().required(),
    email: Joi.string().email(),

    // allowing empty string also with max set to 100
    tagline: Joi.string().allow("").max(100),

    bio: Joi.string().allow(""),

    online: Joi.number().default(() => Date.now()), // this field is, "0" when user is online and represent timestamp when user is offline.

    termsAccepted: Joi.boolean().equal(true),
    policyAccepted: Joi.boolean().equal(true),


    //? these fields require special attention 
    lngPref: Joi.string().allow(""),
    regionCode: Joi.string().allow(""),

    geoLat: Joi.number(),
    geoLong: Joi.number(),

});

const UserInputSchemaWithDatabaseKeys = UserInputSchema.append({
    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),
    S_K: Joi.string().default(Joi.expression('USERMETA#{{userId}}')),

    PublicSearch: Joi.number().integer().valid(0, 1).default(1), // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(Joi.expression('USER#{{username}}')), // GSI : SearchByUsernameIndex


    // based on popularity, activity and etc.
    Weight: Joi.number().default(1), // GSI: WeightIndex

});

const UserBaseCompleteSchema = UserInputSchemaWithDatabaseKeys.append({
    //! fields auto-generated from activities of user in the app.

    followerCount: Joi.number().integer().min(0).default(0),
    followingCount: Joi.number().integer().min(0).default(0),
    friendsCount: Joi.number().min(0).default(0),

    clubsCreated: Joi.number().integer().min(0).default(0),
    clubsParticipated: Joi.number().integer().min(0).default(0),
    clubsJoinRequests: Joi.number().integer().min(0).default(0),
    clubsAttended: Joi.number().integer().min(0).default(0),

});

exports.UserNameSchema = UserNameSchema;
exports.UserInputSchema = UserInputSchema;
exports.UserInputSchemaWithDatabaseKeys = UserInputSchemaWithDatabaseKeys;
exports.UserBaseCompleteSchema = UserBaseCompleteSchema;