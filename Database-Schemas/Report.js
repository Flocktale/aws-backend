const Joi = require('joi');

const ReportSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    reportId: Joi.string().guid({
        version: ['uuidv4']
    }).required(),


    username: Joi.string().required(),
    avatar: Joi.string().required(),

    body: Joi.string().required(),

    timestamp: Joi.number().default(new Date.now()),
});

const ReportSchemaWithDatabaseKeys = ReportSchema.append({
    PK: Joi.string().default(`CLUB#${Joi.ref('clubId')}`),
    SK: Joi.string().default(`REPORT#${Joi.ref('timestamp')}#${Joi.ref('reportId')}`),
});

exports.ReportSchema = ReportSchema;
exports.ReportSchemaWithDatabaseKeys = ReportSchemaWithDatabaseKeys;
