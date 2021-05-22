const Joi = require('joi');

const countBaseSchema = Joi.object({
    count: Joi.number().default(0),

    clubId: Joi.string().required(),
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),
});

// -------------------------------------------------------------------------------------------------------------------------------------------

const CountCommentSchema = countBaseSchema.append({
    S_K: Joi.string().default('CountComment#'),
});

const CountReactionSchema = countBaseSchema.append({
    indexValue: Joi.number().valid(0, 1, 2).required(),
    S_K: Joi.string().default(Joi.expression('CountReaction#{{indexValue}}')),
});


const CountReportSchema = countBaseSchema.append({
    S_K: Joi.string().default('CountReport#'),
});



const CountAudienceSchema = countBaseSchema.append({
    S_K: Joi.string().default('CountAudience#'),
});


const CountJoinRequestSchema = countBaseSchema.append({
    S_K: Joi.string().default('CountJoinRequest#'),
});

exports.CountCommentSchema = CountCommentSchema;
exports.CountReactionSchema = CountReactionSchema;
exports.CountReportSchema = CountReportSchema;
exports.CountAudienceSchema = CountAudienceSchema;
exports.CountJoinRequestSchema = CountJoinRequestSchema;