const {
    imageUploadConstParams,
    s3,
    myTable,
    dynamoClient,
} = require('../config');

async function uploadFile(key, buffer) {
    return new Promise(async function (resolve, reject) {

        var params = {
            ...imageUploadConstParams,
            Body: buffer,
            Key: key,
        };

        s3.upload(params, function (s3Err, data) {
            if (s3Err) {
                reject('error in uploading image: ', s3Err);
            }
            resolve(data);
        });
    });
}

module.exports = {
    uploadFile,
};