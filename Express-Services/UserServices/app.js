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


const {
    isUsernameAvailable
} = require('./Functions/userFunctions');



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

const createRouter = require('./Routes/createUserRoutes');
const userIdRouter = require('./Routes/userIdRoutes');

const contactSyncRouter = require('./Routes/contactSyncRoutes');


app.get("/", (req, res) => {
    res.json("Hello from server, this is root path, nothing to find here.");
});

app.get("/users", (req, res) => {
    // TODO: send list of users
    res.json('You have hit a TODO: Send list of all new users )');
});

// required
// query parameters - "username"
app.get('/users/username-availability', async (req, res) => {

    const username = req.query.username;
    if (!username) {
        return res.status(400).json('send some username to check for');
    }

    try {
        const result = await isUsernameAvailable(username);
        return res.status(200).json({
            isAvailable: result
        });
    } catch (error) {
        if (error === "INVALID_USERNAME") {
            return res.status(400).json('INVALID_USERNAME');
        }

        console.log('unknown error: ', error);
        return res.status(500).json("INTERNAL_SERVER_ERROR");
    }


});

app.use('/users/contacts-sync', contactSyncRouter);

app.use('/users/create', createRouter);

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