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



// headers - "lastevaluatedkey"  (optional) 
// query parameters => "category" (if not defined, then clubs from all categories are sent back)

router.get("/", async (req, res) => {


    var queriedCategory = req.query.category;

    if (queriedCategory) {

        const data = await _fetchClubsByCategory(queriedCategory, req.headers.lastevaluatedkey);
        return res.status(200).json(data);
    }




    var categoryList = categoryData['categories'];

    var latestClubs = {
        categoryClubs: []
    };

    const fetchCategoryClubs = categoryList.map(async (category) => {

        try {
            const {
                clubs
            } = await _fetchClubsByCategory(category);
            latestClubs.categoryClubs.push({
                category: category,
                clubs: clubs
            });
        } catch (error) {
            console.log('error in fetching latest 10 clubs from : ' + category + ' : category,  :', error);
        }
    });

    await Promise.all(fetchCategoryClubs);

    return res.status(200).json(latestClubs);

});


async function _fetchClubsByCategory(category, lastevaluatedkey) {
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

    if (lastevaluatedkey) {
        _query['ExclusiveStartKey'] = JSON.parse(lastevaluatedkey);
    }

    const data = await dynamoClient.query(_query).promise();
    return {
        clubs: data['Items'],
        lastevaluatedkey: data['LastEvaluatedKey']
    };
}


module.exports = router;