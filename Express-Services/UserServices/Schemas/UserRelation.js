const Joi = require('joi');
// relationIndexObj is a representation of 5 bits,

//          1st               2nd                   3rd                       4th                      5th
//          ||                ||                    ||                        ||                       || 
//      (isFriend)      (f -> p request)         (p -> f request)         (f follows p)          (p follows f)            

// if 1st bit (isFriend) is set, then 2nd and 3rd bit will always be zero, 4th and 5th are mutable.
// 2nd and 3rd bit can not simultaneously be set, NAND of 2nd and 3rd bit always be true

// eg. 1 0 0 1 1 => both user are friends and follow each other
// eg. 1 0 0 0 1 => both user are friends and only I (primary user) follow other user.
// eg. 0 0 1 0 1 => I (primary user) has sent a friend request and also follow the other user.

// possible relations - 
// 0 0 0 0 1 =>     I follow other user.                                                                                    
// 0 0 0 1 0 =>     Other user follows me.                                                                                  
// 0 0 0 1 1 =>     Both follows each other.                                                                                

// 0 0 1 0 0 =>     I have requested for friendship.                                                                        
// 0 0 1 0 1 =>     I have requested for friendship and also follow other user.                                             
// 0 0 1 1 1 =>     I have requested for friendship and also follow other user. Along other user also follows me.           

// 0 1 0 0 0 =>     Other user has requested for friendship.                                                                
// 0 1 0 1 0 =>     Other user has requested for friendship and also follows me.                                            
// 0 1 0 1 1 =>     Other user has requested for friendship and also follows me. Along I also follow other user.            

// 1 0 0 0 0 =>     Both users are friend.                                                                                  
// 1 0 0 0 1 =>     Both users are friend. I follow other user.                                                             
// 1 0 0 1 0 =>     Both users are friend. Other user follows me.                                                           
// 1 0 0 1 1 =>     Both users are friend and both follows each other.                                                      


const UserRelationSchema = Joi.object({
    primaryUser: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        name: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),

    foreignUser: Joi.object({
        userId: Joi.string().required(),
        username: Joi.string().required(),
        name: Joi.string().required(),
        avatar: Joi.string().required(),
    }).required(),

    relationIndexObj: Joi.object({
        B1: Joi.bool().default(false),                   // (isFriend)
        B2: Joi.bool().default(false),                   // (f -> p request)
        B3: Joi.bool().default(false),                   // (p -> f request)
        B4: Joi.bool().default(false),                   // (f follows p)
        B5: Joi.bool().default(false),                   // (p follows f)
    }).required(),

    timestamp: Joi.number().default(() => Date.now()),

});

const UserRelationSchemaWithDatabaseKeys = UserRelationSchema.append({

    P_K: Joi.string().default(Joi.expression('USER#{{primaryUser.userId}}')),

    S_K: Joi.string().default(
        Joi.expression('RELATION#{{foreignUser.userId}}')
    ),

    UsernameSortField: Joi.string().default(Joi.expression('RELATION-SORT-USERNAME#{{foreignUser.username}}')),    //GSI: UsernameSortIndex
    TimestampSortField: Joi.string().default(Joi.expression('RELATION-SORT-TIMESTAMP#{{timestamp}}#{{foreignUser.userId}}')),    //GSI: TimestampSortIndex
});

exports.UserRelationSchema = UserRelationSchema;
exports.UserRelationSchemaWithDatabaseKeys = UserRelationSchemaWithDatabaseKeys;