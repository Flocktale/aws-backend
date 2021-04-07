function cloneObj(obj) {
    if (Object(obj) !== obj)
        return obj;
    else if (Array.isArray(obj))
        return obj.map(cloneObj);

    return Object.fromEntries(Object.entries(obj).map(
        ([k, v]) => ([k, cloneObj(v)])
    ));
}

module.exports = {
    cloneObj
};