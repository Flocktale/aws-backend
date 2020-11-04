const Joi = require('joi');

const ReportSchema = Joi.object({
    clubId: Joi.string().required(),
    userId: Joi.string().required(),

    reportId: Joi.string().required(),


    username: Joi.string().required(),
    avatar: Joi.string().required(),

    body: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),
});

const ReportSchemaWithDatabaseKeys = ReportSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('REPORT#{{timestamp}}#{{reportId}}')
    ),

});

exports.ReportSchema = ReportSchema;
exports.ReportSchemaWithDatabaseKeys = ReportSchemaWithDatabaseKeys;
