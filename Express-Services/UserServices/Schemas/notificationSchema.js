const Joi = require('joi');
const {
    nanoid
} = require('nanoid');

// FR# - Friend Request related notifications
///     new - for a new incoming friend request
///     accepted - a user accepted thier friend request

// FLW# - Follow/Following related notifications
///     new - A new user has started following them.     

// CLUB#INV#
///     prt - invitation for being participant
///     adc - invitation for being audience

const NotificationSchema = Joi.object({
    userId: Joi.string().required(),
    notificationId: Joi.string().default(() => nanoid()),

    data: Joi.object({

        type: Joi.string().valid('FR#new', 'FR#accepted', 'FLW#new', 'CLUB#INV#prt', 'CLUB#INV#adc').required(),
        title: Joi.string().required(),
        avatar: Joi.string().required(),
        timestamp: Joi.number().required(),


        // resource which is associated with this notification
        // in case of social relation - user id of other user
        // if related to any club - corresponding club id
        targetResourceId: Joi.string().required(),

        // for use cases for eg :  user react/comment on a club then (avatar - user, secondarySvatar - club) 
        secondaryAvatar: Joi.string(),

        // it indicated if user has clicked/opened the notification.
        opened: Joi.bool().default(false),

        extraData: Joi.object({
            scheduleTime: Joi.number(), // in case of CLUB#
            category: Joi.string(), // in case of CLUB#
        }),

    }).required(),

    // this is a TTL attribute, formatted in Unix epoch time (in seconds) (set for 8 weeks )       
    // dynamodb uses time in seconds instead of milliseconds for TTL settings.
    expiryTime: Joi.number().default(() => {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + 56);
        return Math.floor(Date.parse(currentDate) / 1000);
    }),
});

const NotificationSchemaWithDatabaseKeys = NotificationSchema.append({
    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),
    S_K: Joi.string().default(Joi.expression('NOTIFICATION#{{notificationId}}')),

    TimestampSortField: Joi.string().default(Joi.expression('NOTIF-SORT-TIMESTAMP#{{data.timestamp}}')), // GSI: TimestampSortIndex
});

exports.NotificationSchema = NotificationSchema;
exports.NotificationSchemaWithDatabaseKeys = NotificationSchemaWithDatabaseKeys;