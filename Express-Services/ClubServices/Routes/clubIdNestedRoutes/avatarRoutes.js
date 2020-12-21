const router = require('express').Router();

const { s3, imageUploadConstParams } = require('../../config');


//required
// this post request should be type of multipart post request
// a single file named "avatar" should exist.

// TODO: Analyze this file and check if it is an image and then apply some image processing to validate image content.

router.post("/", (req, res) => {
    const clubId = req.clubId;

    if (!req.body || !req.body.image) {
        res.status(400).send('Invalid request. image not found');
        return;
    }

    const fileName = clubId;

    const buffer = Buffer.from(req.body.image, 'base64');

    var params = {
        ...imageUploadConstParams,
        Body: buffer,
        Key: `clubAvatar/${fileName}`
    };

    s3.upload(params, (err, data) => {
        if (err) {
            res.json(`Error occured while trying to upload: ${err}`);
            return;
        }
        else if (data) {
            res.status(201).json('Image uploaded successfully');
        }
    });
});

module.exports = router;
