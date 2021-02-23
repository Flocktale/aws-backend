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





const globalClubRouter = require('./Routes/GlobalClubRoutes/globalClubRoutes');


const myClubRouter = require('./Routes/myClubRoutes');

const clubIdRouter = require('./Routes/clubIdRoutes');

const unifiedQueryRouter = require('./Routes/QueryRoutes/unifiedQueryRoutes');


app.use('/clubs/global', globalClubRouter);


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