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
! Comment on club
! Get comments
# Report club
# Get reports
# Request to join club 
# Get join requests for club
# Cancellation of join request by requester 
# Response to join-request
# Get Active Participant for club  (List with username, avatar and timestamp)
# Kick out a participant
# Get list of kicked out people by club
# Un-Kick a user from club
*/


const express = require('express');

const cors = require('cors');


const app = express();


app.use(cors());
app.use(express.json());



app.get("/clubs", (req, res) => {
    // TODO: send list of clubs
    res.json('You have hit a TODO: Send list of clubs )');
});



const createClubRouter = require('./Routes/createClubRoutes');
const myClubRouter = require('./Routes/myClubRoutes');
const queryClubRouter = require('./Routes/queryRoutes');

const clubIdRouter = require('./Routes/clubIdRoutes');

app.use('/clubs/create', createClubRouter);

app.use('/myclubs', myClubRouter);

app.use('/clubs/query', queryClubRouter);

app.use('/clubs/:clubId',
    (req, res, next) => {
        req.clubId = req.params.clubId;
        next();
    }
    , clubIdRouter
);



// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
module.exports = app;
// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //