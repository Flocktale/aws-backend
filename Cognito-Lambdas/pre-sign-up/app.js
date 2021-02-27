exports.handler = async (event, context) => {
    console.log(event);
    event.response.autoConfirmUser = true;
    event.response.autoVerifyPhone = true;
    return event;
};