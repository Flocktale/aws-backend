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
});

const myCommunitiesRouter = require('./Routes/myCommunityRoutes');
const globalCommunityRouter = require('./Routes/GlobalCommunityRoutes/globalCommunityRoutes');
const communityIdRouter = require('./Routes/communityIdRoutes');

app.use('/mycommunities', myCommunitiesRouter);


app.use('/communities/global', globalCommunityRouter);


app.use('/communities/:communityId',
    (req, res, next) => {
        req.communityId = req.params.communityId;
        next();
    }, communityIdRouter
);





// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //
module.exports = app;
// __________________________________________________________________________________________________________________ //
// __________________________________________________________________________________________________________________ //