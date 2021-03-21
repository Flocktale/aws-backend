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



app.use(cors());
app.use(express.json({
    limit: '1mb'
}));
app.use(express.urlencoded({
    limit: '1mb',
    extended: true,
}));

app.use((req, res, next) => {
    // printing the path.
    console.log(req.path);
    next();
})

const globalUserRouter = require('./Routes/GlobalUserRoutes/globalUserRoutes');
const userIdRouter = require('./Routes/userIdRoutes');


app.get("/", (req, res) => {
    res.json("Hello from server, this is root path, nothing to find here.");
});

app.get("/users", (req, res) => {
    // TODO: send list of users
    res.json('You have hit a TODO: Send list of all new users )');
});



app.use('/users/global', globalUserRouter);

app.use('/users/:userId',
    (req, res, next) => {
        req.userId = req.params.userId;
        next();
    }, userIdRouter
);


// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
module.exports = app;
// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //