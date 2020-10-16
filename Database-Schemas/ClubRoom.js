const Joi = require('joi');

const ClubInputSchema = Joi.object({
    //! required fields
    clubId: Joi.string().guid({
        version: ['uuidv4']
    }).required(),

    clubName: Joi.string().min(3).max(25).required(),

    creatorId: Joi.string().required(),
    creatorUsername: Joi.string().min(3).max(25).required(),

    timeWindow: Joi.number().integer().default(1800).min(300),  // expected duration of club entered at time of creation (default 1800 seconds i.e. 30 minutes)


    category: Joi.string().required(),

    createdOn: Joi.number().default(new Date.now()),
    modifiedOn: Joi.number().default(new Date.now()),

    scheduleTime: Joi.number().default(new Date.now()),


    //normal fields

    creatorAvatar: Joi.string(),
    clubAvatar: Joi.string(),
    decription: Joi.string(),

    isLocal: Joi.boolean(),
    isGlobal: Joi.boolean(),
    isPrivate: Joi.boolean(),

    tags: Joi.array().items(Joi.string()),


});

const ClubInputSchemaWithDatabaseKeys = ClubInputSchema.append({
    PK: Joi.string().default(`USER#${Joi.ref('creatorId')}`),
    SK: Joi.string().default(`CLUB#${Joi.ref('scheduleTime')}#${Joi.ref('clubId')}`),


    PublicSearch: Joi.number().integer().allow(0, 1).default(1),                // GSI : SearchByUsernameIndex
    FilterDataName: Joi.string().default(`CLUB#${Joi.ref('clubName')}`),        // GSI : SearchByUsernameIndex

});

const ClubRoomCompleteSchema = ClubInputSchemaWithDatabaseKeys.append({
    duration: Joi.number().integer().min(300),
});


exports.ClubInputSchema = ClubInputSchema;
exports.ClubInputSchemaWithDatabaseKeys = ClubInputSchemaWithDatabaseKeys;
exports.ClubRoomCompleteSchema = ClubRoomCompleteSchema;