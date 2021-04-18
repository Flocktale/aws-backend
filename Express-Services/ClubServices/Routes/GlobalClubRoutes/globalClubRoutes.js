const router = require('express').Router();

const {
    clubCategoryIndex,
    dynamoClient,
    myTable,
    clubContentIndex,
} = require('../../config');
const Constants = require('../../constants');

const categoryData = require('../../static/categoryData.json');
const NewsContentData = require('../../static/NewsContentData.json');


const createClubRouter = require('./createClubRoutes');

router.use('/create', createClubRouter);


router.get('/category-data', async (req, res) => {

    return res.status(200).json(categoryData);

});

// query parameters -  "type" (either "news" or "commerce")
router.get('/content-data', async (req, res) => {

    const type = req.query.type;

    if (type !== "news" && type !== "commerce") {
        return res.status(400).json('type can only be "news" or "commerce"');
    }

    //TODO: send content according to type, for now sending only news content
    return res.status(200).json(NewsContentData);

});



// headers - "lastevaluatedkey"  (optional) 
// query parameters => 
//              "category" (if not defined, then clubs from all categories are sent back)
//              "contentUrl" (url of any content data for which clubs are asked)
//                  Note => category and contentUrl must not exist together.


router.get("/", async (req, res) => {

    var queriedCategory = req.query.category;
    var contentUrl = req.query.contentUrl;

    if (queriedCategory) {
        const data = await _fetchClubsByCategory(queriedCategory, req.headers.lastevaluatedkey);
        return res.status(200).json(data);
    }

    if (contentUrl) {
        const data = await _fetchClubsByContentUrl(contentUrl, req.headers.lastevaluatedkey);
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

async function _fetchClubsByContentUrl(contentUrl, lastevaluatedkey) {

    const _query = {
        TableName: myTable,
        IndexName: clubContentIndex,
        KeyConditions: {
            'ClubContentField': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [contentUrl]
            },
            'status': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [Constants.ClubStatus.Live]
            },
        },
        AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
            'clubAvatar', 'tags', 'status', 'subCategory', 'community',
            'estimatedAudience', 'participants'
        ],
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


async function _fetchClubsByCategory(category, lastevaluatedkey) {
    const _query = {
        TableName: myTable,
        IndexName: clubCategoryIndex,
        KeyConditions: {
            'category': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [category]
            }
        },
        QueryFilter: {
            'status': {
                ComparisonOperator: 'NE',
                AttributeValueList: [Constants.ClubStatus.Concluded]
            }
        },
        AttributesToGet: ['clubId', 'creator', 'clubName', 'category', 'scheduleTime',
            'clubAvatar', 'tags', 'status', 'subCategory', 'community',
            'estimatedAudience', 'participants'
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