function isNative(construct: any) {
    return (
        typeof construct === 'function' &&
        /\[native code\]/.test(construct.toString())
    );
}

let callbacks: any[] = [];
let pending = false;

const flushCallbacks = () => {
    const prevCallbacks = callbacks;
    callbacks = [];
    pending = false;
    for (const cb of prevCallbacks) {
        cb();
    }
};

let asyncHandler: () => void;
if (isNative(Promise)) {
    const promise = Promise.resolve();

    asyncHandler = () => {
        promise.then(flushCallbacks);
    };
} else if (isNative(MutationObserver)) {
    const observer = new MutationObserver(flushCallbacks);
    const node = document.createTextNode('0');
    observer.observe(node, { characterData: true });

    asyncHandler = () => {
        node.data = `${(parseInt(node.data) + 1) % 2}`;
    };
} else {
    asyncHandler = () => {
        setTimeout(flushCallbacks, 0);
    };
}

export const nextTick = (cb: () => void, ctx = undefined) => {
    callbacks.push(cb.bind(ctx));

    if (pending) {
        return;
    }

    pending = true;
    asyncHandler();
};

export default nextTick;
