const Joi = require('joi');

const SNSEndpointSchema = Joi.object({
    userId: Joi.string().required(),

    deviceToken: Joi.string().required(),
    endpointArn: Joi.string().required(),

    enabled: Joi.boolean().default(true),

});

const SNSEndpointSchemaWithDatabaseKeys = SNSEndpointSchema.append({
    P_K: Joi.string().default('SNS_DATA#'),
    S_K: Joi.string().default(Joi.expression('USER#{{userId}}')),
});

exports.SNSEndpointSchema = SNSEndpointSchema;
exports.SNSEndpointSchemaWithDatabaseKeys = SNSEndpointSchemaWithDatabaseKeys;