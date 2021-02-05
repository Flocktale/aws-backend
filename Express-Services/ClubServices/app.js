// TODO: countComment is not updated in websocket
// TODO: in user complete schema, count fields are not updated dynamically.

/* 
? Methods to implement =>
! All Clubs List 
# Create Club
# Upload Club Image
# Get all my organized clubs 
# Get my club history timeline (attended, participated as well as organised (owned) )  
! Update Club on owner request 
# Fetch a single club with all details (with clubId and creatorId)
# Search club by clubName
# Enter a club
# React on club
# Get reactions     (List with userId, username, avatar and indexValue) 
# Comment on club (websocket)
# Get comments (websocket)
# Report club
# Get reports
# Request to join club 
# Get join requests for club
# Cancellation of join request by requester 
# Response to join-request
# Get Active Participant for club  (List with username, avatar and timestamp)
# Kick out a participant
*/


const express = require('express');
const cors = require('cors');

const app = express();


app.use(cors());
app.use(express.json());

const {
    clubCategoryIndex,
    dynamoClient,
    tableName
} = require('./config');

app.get("/clubs", async (req, res) => {
    var categoryList = ['Entrepreneurship', 'Education', 'Comedy', 'Travel', 'Society',
        'Health', 'Finance', 'Sports', 'Other'
    ];

    var latestClubs = {
        categoryClubs: []
    };

    const fetchCategoryClubs = categoryList.map(async (category) => {
        const _query = {
            TableName: tableName,
            IndexName: clubCategoryIndex,
            KeyConditions: {
                'category': {
                    ComparisonOperator: 'EQ',
                    AttributeValueList: [category]
                }
            },
            AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime', 'clubAvatar', 'tags'],
            ScanIndexForward: false,
            Limit: 5,
        };
        try {
            const clubs = (await dynamoClient.query(_query).promise())['Items'];
            latestClubs.categoryClubs.push({
                category: category,
                clubs: clubs
            });
        } catch (error) {
            console.log('error in fetching latest 5 clubs from : ' + category + ' : category, or it can be error of apigwManagement :', error);
        }
    });

    await Promise.all(fetchCategoryClubs);

    res.status(200).json(latestClubs);

});



const createClubRouter = require('./Routes/createClubRoutes');
const myClubRouter = require('./Routes/myClubRoutes');

const clubIdRouter = require('./Routes/clubIdRoutes');

const unifiedQueryRouter = require('./Routes/QueryRoutes/unifiedQueryRoutes');

app.use('/clubs/create', createClubRouter);

app.use('/myclubs', myClubRouter);


app.use('/query', unifiedQueryRouter);

app.use('/clubs/:clubId',
    (req, res, next) => {
        req.clubId = req.params.clubId;
        next();
    }, clubIdRouter
);



// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
module.exports = app;
// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //