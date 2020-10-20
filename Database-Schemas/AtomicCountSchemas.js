const Joi = require('joi');

const CountCommentSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountComment#' + value; } })),

});



const CountReactionSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountReaction#' + value; } })),

});




const CountReportSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountReport#' + value; } })),

});




const CountParticipantSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountParticipant#' + value; } })),

});



const CountAudienceSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountAudience#' + value; } })),

});


const CountJoinRequestSchema = Joi.object({
    clubId: Joi.string().required(),

    P_K: Joi.string().default(Joi.ref('clubId', { adjust: value => { return 'CountJoinRequest#' + value; } })),

});

exports.CountCommentSchema = CountCommentSchema;
exports.CountReactionSchema = CountReactionSchema;
exports.CountReportSchema = CountReportSchema;
exports.CountParticipantSchema = CountParticipantSchema;
exports.CountAudienceSchema = CountAudienceSchema;
exports.CountJoinRequestSchema = CountJoinRequestSchema;