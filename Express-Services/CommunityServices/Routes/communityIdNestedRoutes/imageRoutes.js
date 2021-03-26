const sharp = require('sharp');
const {
    uploadFile
} = require('../../Functions/communityFunctions');

const Constants = require('../../constants');

const router = require('express').Router();

router.post('/', async (req, res) => {
    const communityId = req.communityId;

    const newAvatar = req.body.avatar;
    const newCoverImage = req.body.coverImage;

    if (!newAvatar && !newCoverImage) {
        return res.status(400).json('atleast any of avatar or coverImage is required in body');
    }

    const promises = [];

    const sharpParams = {
        quality: 90,
        force: true,
    };

    if (newAvatar) {
        const buffer = Buffer.from(newAvatar, 'base64');

        promises.push(sharp(buffer).resize(96, 96).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityAvatarThumbKey(communityId), val));
        }));

        promises.push(sharp(buffer).resize(144, 144).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityAvatarDefaultKey(communityId), val));
        }));

        promises.push(sharp(buffer).resize(216, 216).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityAvatarLargeKey(communityId), val));
        }));
    }

    if (newCoverImage) {
        const buffer = Buffer.from(newCoverImage, 'base64');

        promises.push(sharp(buffer).resize(200, 300).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityCoverImageThumbKey(communityId), val));
        }));

        promises.push(sharp(buffer).resize(480, 320).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityCoverImageDefaultKey(communityId), val));
        }));

        promises.push(sharp(buffer).resize(630, 420).jpeg(sharpParams).toBuffer().then(val => {
            promises.push(uploadFile(Constants.s3CommunityCoverImageLargeKey(communityId), val));
        }));
    }



    Promise.all(promises).then(data => {
        res.status(201).json('Uploaded successfully');
    }, reason => {
        console.log(reason);
        res.status(400).json(`Error occured while trying to upload:`);
    });

});

module.exports = router;