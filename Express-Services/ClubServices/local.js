// const Joi = require('joi');


// const app = require('./app');

// app.listen(4000, () => {
//     console.log("Listening on port 4000");
// });

const {
    sqs,

    dynamoClient,
    myTable,
    apigwManagementApi
} = require('./config');


// const data = require('./static/categoryData.json');

const https = require('https')
const fs = require('fs');
const {
    ClubContentSchema
} = require('./Schemas/ClubContentSchema');

async function updateNewsContent() {
    const data = await new Promise(async (resolve, reject) => {
        https.get("https://newsapi.org/v2/top-headlines?country=in&apiKey=5f6fde1de0b34316930fd5e222cfc751", res => {
            console.log(`statusCode: ${res.statusCode}`)

            res.setEncoding('utf8');
            let rawData = '';

            res.on('data', (chunk) => {
                rawData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData);
                } catch (e) {
                    reject(e.message);
                }
            });
        }).on('error', (e) => {
            reject(`Got error: ${e.message}`);
        });
    });

    const newsContent = [];
    if (data.status === "ok") {
        console.log('articles: ', data.articles.length);
        const articles = data.articles;
        for (var article of articles) {
            try {
                newsContent.push(await ClubContentSchema.validateAsync({
                    source: article.source.name,
                    title: article.title,
                    url: article.url,
                    description: article.description,
                    avatar: article.urlToImage,
                    timestamp: (new Date(article.publishedAt)).getTime(),
                }));

            } catch (error) {
                console.log(error);
            }
        }

        fs.writeFileSync('static/NewsContentData.json', JSON.stringify(newsContent));

    }


}
async function testing() {

    // await updateNewsContent();

    try {
        console.log(JSON.stringify('hello'));
        console.log(JSON.stringify({
            'hello': 1
        }));
    } catch (error) {
        console.log('error: ', error);
    }
}


testing();