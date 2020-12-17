const router = require('express').Router();
const multer = require('multer');

const { s3, imageUploadConstParams } = require('../../config');


//required
// this post request should be type of multipart post request
// a single file named "avatar" should exist.

// TODO: Analyze this file and check if it is an image and then apply some image processing to validate image content.

router.post("/", multer().single('avatar'), (req, res) => {
    const clubId = req.clubId;

    if (!req.file) {
        res.status(400).send('Invalid request. File not found');
        return;
    }

    // TODO: process this file, may include - check for broken/corrupt file, valid image extension, cropping or resizing etc.
    const fileName = clubId;

    var params = {
        ...imageUploadConstParams,
        Body: req.file.buffer,
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
