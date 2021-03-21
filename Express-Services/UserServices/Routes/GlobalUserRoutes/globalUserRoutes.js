const router = require('express').Router();

const {
    clubCategoryIndex,
    dynamoClient,
    myTable
} = require('../../config');


const createUserRouter = require('./createUserRoutes');
const contactSyncRouter = require('./contactSyncRoutes');

router.use('/create', createUserRouter);
router.use('/contacts-sync', contactSyncRouter);


const {
    isUsernameAvailable
} = require('../../Functions/userFunctions');

// required
// query parameters - "username"
router.get('/username-availability', async (req, res) => {

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

const appConfigs = require('../../static/appConfigs.json');

router.get('/app-configs', async (req, res) => {
    return res.status(200).json(appConfigs);
});

module.exports = router;