const Joi = require('joi');

const ClubContentSchema = Joi.object({

    source: Joi.string().allow(null),

    title: Joi.string().required(),
    url: Joi.string().required(),

    description: Joi.string().allow(null, ''),
    avatar: Joi.string().allow(null, ''),

    timestamp: Joi.number(),

});



exports.ClubContentSchema = ClubContentSchema;