const Joi = require('joi');

// FR# - Friend Request related notifications
///     new - for a new incoming friend request
///     accepted - a user accepted thier friend request

// FLW# - Follow/Following related notifications
///     new - A new user has started following them.     


const NotificationSchema = Joi.object({
    userId: Joi.string().required(),
    data: Joi.object({

        type: Joi.string().valid('FR#new', 'FR#accepted', 'FLW#new').required(),
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

    }).required(),
});

const NotificationSchemaWithDatabaseKeys = NotificationSchema.append({
    P_K: Joi.string().default(Joi.expression('USER#{{userId}}')),
    S_K: Joi.string().default(Joi.expression('NOTIFICATIONS#{{data.timestamp}}')),
});

exports.NotificationSchema = NotificationSchema;
exports.NotificationSchemaWithDatabaseKeys = NotificationSchemaWithDatabaseKeys;