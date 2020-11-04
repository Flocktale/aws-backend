const router = require('express').Router();
const multer = require('multer');

const { imageUploadConstParams, s3 } = require('../../config');


router.post("/", multer().single('avatar'), (req, res) => {
    const userId = req.userId;

    if (!req.file) {
        res.status(400).send('Invalid request. File not found');
        return;
    }

    // TODO: process this file, may include - check for broken/corrupt file, valid image extension, cropping or resizing etc.
    const fileName = userId;

    var params = {
        ...imageUploadConstParams,
        Body: req.file.buffer,
        Key: `userAvatar/${fileName}`
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
