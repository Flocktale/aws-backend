const router = require('express').Router();

const {
    clubCategoryIndex,
    dynamoClient,
    tableName
} = require('../../config');

const categoryData = require('../../static/categoryData.json');



const createClubRouter = require('./createClubRoutes');



router.use('/create', createClubRouter);




router.get('/category-data', async (req, res) => {


    return res.status(200).json(categoryData);

});




router.get("/", async (req, res) => {
    var categoryList = categoryData['categories'];

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
            QueryFilter: {
                'isConcluded': {
                    ComparisonOperator: 'NE',
                    AttributeValueList: [true]
                }
            },
            AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
                'clubAvatar', 'estimatedAudience', 'tags', 'isLive', 'subCategory'
            ],
            ScanIndexForward: false,
            Limit: 10,
        };
        try {
            const clubs = (await dynamoClient.query(_query).promise())['Items'];
            latestClubs.categoryClubs.push({
                category: category,
                clubs: clubs
            });
        } catch (error) {
            console.log('error in fetching latest 10 clubs from : ' + category + ' : category,  :', error);
        }
    });

    await Promise.all(fetchCategoryClubs);

    res.status(200).json(latestClubs);

});


module.exports = router;