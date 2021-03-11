const {
    uploadFile
} = require('../../Functions/clubFunctions');

const router = require('express').Router();
const sharp = require('sharp');
const Constants = require('../../constants');


//required
// this post request should be type of multipart post request
// a single file named "avatar" should exist.

// TODO: Analyze this file and check if it is an image and then apply some image processing to validate image content.

router.post("/", async (req, res) => {
    const clubId = req.clubId;

    if (!req.body || !req.body.image) {
        res.status(400).send('Invalid request. image not found');
        return;
    }

    const fileName = clubId;

    const buffer = Buffer.from(req.body.image, 'base64');

    const sharpParams = {
        quality: 90,
        force: true,
    };

    var _thumbnail, _default, _large;

    await Promise.all([
        sharp(buffer).resize(96, 96).jpeg(sharpParams).toBuffer(),
        sharp(buffer).resize(144, 144).jpeg(sharpParams).toBuffer(),
        sharp(buffer).resize(216, 216).jpeg(sharpParams).toBuffer(),
    ]).then(values => {
        _thumbnail = values[0];
        _default = values[1];
        _large = values[2];
    });



    const uploadPromises = [
        uploadFile(Constants.s3ClubAvatarThumbKey(fileName), _thumbnail),
        uploadFile(Constants.s3ClubAvatarDefaultKey(fileName), _default),
        uploadFile(Constants.s3ClubAvatarLargeKey(fileName), _large),
    ];

    Promise.all(uploadPromises).then(data => {
        res.status(201).json('Image uploaded successfully');
    }, reason => {
        console.log(reason);
        res.status(400).json(`Error occured while trying to upload:`);
    });
});

module.exports = router;