const { TinyPromise } = require('../build/index');

const deferred = () => {
    let closure = undefined;
    const promise = new TinyPromise((resolve, reject) => {
        closure = { resolve, reject };
    });
    return { ...closure, promise };
};
const resolved = TinyPromise.resolve;
const rejected = TinyPromise.reject;

module.exports = { deferred, resolved, rejected };
