const router = require('express').Router();
const sharp = require('sharp');
const Constants = require('../../constants');
const {
    uploadFile
} = require('../../Functions/userFunctions');

// required
// body.image = base 64 encoded image
// TODO: Analyze this file and check if it is an image and then apply some image processing to validate image content.

router.post("/", async (req, res) => {
    const userId = req.userId;

    if (!req.body || !req.body.image) {
        res.status(400).send('Invalid request. image not found');
        return;
    }

    const fileName = userId;

    const buffer = Buffer.from(req.body.image, 'base64');

    var _thumbnail, _default, _large;

    const sharpParams = {
        quality: 90,
        force: true,
    };

    await Promise.all([
        sharp(buffer).resize(96, 96).jpeg(sharpParams).toBuffer(),
        sharp(buffer).resize(144, 144).jpeg(sharpParams).toBuffer(),
        sharp(buffer).resize(216, 216).jpeg(sharpParams).toBuffer(),
    ]).then((images) => {
        _thumbnail = images[0];
        _default = images[1];
        _large = images[2];

    })

    const uploadPromises = [
        uploadFile(Constants.s3UserAvatarThumbKey(fileName), _thumbnail),
        uploadFile(Constants.s3UserAvatarDefaultKey(fileName), _default),
        uploadFile(Constants.s3UserAvatarLargeKey(fileName), _large),
    ];


    Promise.all(uploadPromises).then(data => {
        res.status(201).json('Image uploaded successfully');
    }, reason => {
        console.log(reason);
        res.status(400).json(`Error occured while trying to upload:`);
    });


});

module.exports = router;