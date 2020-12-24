const Joi = require('joi');

const ReportSchema = Joi.object({
    clubId: Joi.string().required(),

    user: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        avatar: Joi.string().required(),
    }),

    reportId: Joi.string().required(),

    body: Joi.string().required(),

    timestamp: Joi.number().default(() => Date.now()),
});

const ReportSchemaWithDatabaseKeys = ReportSchema.append({
    P_K: Joi.string().default(Joi.expression('CLUB#{{clubId}}')),

    S_K: Joi.string().default(
        Joi.expression('REPORT#{{user.userId}}#{{reportId}}')
    ),

    TimestampSortField: Joi.string().default(Joi.expression('REPORT-SORT-TIMESTAMP#{{timestamp}}#{{reportId}}')),       // GSI: TimestampSortIndex

});

exports.ReportSchema = ReportSchema;
exports.ReportSchemaWithDatabaseKeys = ReportSchemaWithDatabaseKeys;
