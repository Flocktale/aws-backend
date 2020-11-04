/* 
? Methods to implement =>
# Create user profile in database 
# Get profile by userId
# Update profile of user
# Upload Image
# Get profile by username
! Delete user from database
# Get My followers
# Get whom I'm following
# send a follow request
# Get follow requests i have sent
# Get follow requests i have received
# cancel (delete) a sent follow request
# respond to received follow requests - delete , accept
*/

const express = require('express');
const cors = require('cors');

const app = express();


const queryRouter = require('./Routes/queryRoutes');
const createRouter = require('./Routes/createUserRoutes');
const userSpecificRouter = require('./Routes/userSpecificRoutes');


app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
    res.json("Hello from server, this is root path, nothing to find here.");
});

app.get("/users", (req, res) => {
    // TODO: send list of users
    res.json('You have hit a TODO: Send list of users )');
});

app.use('/users/query', queryRouter);

app.use('/users/create', createRouter);

app.use('/users/:userId',
    (req, res, next) => {
        req.userId = req.params.userId;
        next();
    }
    , userSpecificRouter
);


// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
module.exports = app;
// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
