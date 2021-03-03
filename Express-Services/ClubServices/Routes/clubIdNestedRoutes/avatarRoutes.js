const {
    uploadFile
} = require('../../Functions/clubFunctions');

const router = require('express').Router();



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

    const _thumbnail = await sharp(buffer).resize(96, 96).jpeg({
        quality: 90,
        force: true,
    }).toBuffer();


    const _default = await sharp(buffer).resize(144, 144).jpeg({
        quality: 90,
        force: true,
    }).toBuffer();

    const _large = await sharp(buffer).resize(216, 216).jpeg({
        quality: 90,
        force: true,
    }).toBuffer();


    const uploadPromises = [
        uploadFile(`clubAvatar/${fileName}_thumb`, _thumbnail),
        uploadFile(`clubAvatar/${fileName}`, _default),
        uploadFile(`clubAvatar/${fileName}_large`, _large),
    ];

    Promise.all(uploadPromises).then(data => {
        res.status(201).json('Image uploaded successfully');
    }, reason => {
        console.log(reason);
        res.status(400).json(`Error occured while trying to upload:`);
    });
});

module.exports = router;