const Joi = require('joi');

const CountCommentSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountComment#${Joi.ref('clubId')}`),

});



const CountReactionSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountReaction#${Joi.ref('clubId')}`),

});




const CountReportSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountReport#${Joi.ref('clubId')}`),

});




const CountParticipantSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountParticipant#${Joi.ref('clubId')}`),

});



const CountAudienceSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountAudience#${Joi.ref('clubId')}`),

});


const CountJoinRequestSchema = Joi.object({
    clubId: Joi.string().required(),

    PK: Joi.string().default(`CountJoinRequest#${Joi.ref('clubId')}`),

});

exports.CountCommentSchema = CountCommentSchema;
exports.CountReactionSchema = CountReactionSchema;
exports.CountReportSchema = CountReportSchema;
exports.CountParticipantSchema = CountParticipantSchema;
exports.CountAudienceSchema = CountAudienceSchema;
exports.CountJoinRequestSchema = CountJoinRequestSchema;