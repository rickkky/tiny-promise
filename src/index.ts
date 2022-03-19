import { nextTick } from './next-tick';

export interface FulfilledHandler<T, TResult = T> {
    (value: T): TResult | PromiseLike<TResult>;
}

export interface RejectedHandler<TResult = never> {
    (reason: any): TResult | PromiseLike<TResult>;
}

export interface Thenable<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: FulfilledHandler<T, TResult1>,
        onrejected?: RejectedHandler<TResult2>,
    ): Thenable<TResult1 | TResult2>;
}

interface Task {
    promise: TinyPromise<any>;
    onfulfilled: FulfilledHandler<any>;
    onrejected: RejectedHandler;
}

enum State {
    PENDING,
    FULFILLED,
    REJECTED,
}

const passValue = <T>(value: T) => value;
const passError = (error: any) => {
    throw error;
};

export class TinyPromise<T> implements Thenable<T> {
    static resolve<T>(value: T): TinyPromise<T> {
        return new TinyPromise((resolve: FulfilledHandler<T>) => {
            resolve(value);
        });
    }

    static reject(reason: any) {
        return new TinyPromise((resolve: any, reject: RejectedHandler) => {
            reject(reason);
        });
    }

    // The state of the promise can only be changed
    // from `PENDING` to `FULFILLED` or`REJECTED`.
    private state: State = State.PENDING;
    private value: any;
    private tasks: Task[] = [];

    constructor(entry: any) {
        this.executeEntry(entry);
    }

    then(onfulfilled: any, onrejected: any): TinyPromise<any> {
        const task: any = {
            promise: new TinyPromise(() => {}),
            onfulfilled:
                typeof onfulfilled === 'function' ? onfulfilled : passValue,
            onrejected:
                typeof onrejected === 'function' ? onrejected : passError,
        };
        this.executeTask(task);
        return task.promise;
    }

    catch(onrejected: any): TinyPromise<any> {
        return this.then(undefined, onrejected);
    }

    private executeEntry(entry: any) {
        let called = false;
        const handler = (fulfilled: boolean, value: any) => {
            if (called) {
                return;
            }
            called = true;
            if (fulfilled) {
                this.resolve(value);
            } else {
                this.settle(State.REJECTED, value);
            }
        };
        const resolveHandler = (value: T) => handler(true, value);
        const rejectHandler = (reason: any) => handler(false, reason);
        try {
            entry(resolveHandler, rejectHandler);
        } catch (error) {
            rejectHandler(error);
        }
    }

    // execute the promise resolution procedure, see:
    // https://promisesaplus.com/#the-promise-resolution-procedure
    private resolve(x: T) {
        let then;
        if ((typeof x === 'object' && x !== null) || typeof x === 'function') {
            try {
                then = (x as any).then;
            } catch (error) {
                // If `x.then` is a getter and throw an exception, reject the promise.
                this.settle(State.REJECTED, error);
                return;
            }
        } else {
            then = undefined;
        }
        // If `promise` and `x` refer to the same object,
        // reject `promise` with a `TypeError' as the reason.
        if ((x as any) === this) {
            this.settle(
                State.REJECTED,
                new TypeError('cannot resolve promise with itself'),
            );
            return;
        }
        // If `x` is not thenable, fulfill the promise.
        if (typeof then !== 'function') {
            this.settle(State.FULFILLED, x);
            return;
        }
        // If `x` is a thenable, continue resolve the promise.
        this.executeEntry(then.bind(x));
    }

    private settle(state: State.FULFILLED, value: T): void;
    private settle(state: State.REJECTED, reason: any): void;
    private settle(state: State.FULFILLED | State.REJECTED, value: any) {
        if (this.state !== State.PENDING) {
            return;
        }
        this.state = state;
        this.value = value;
        for (const task of this.tasks) {
            this.executeTask(task);
        }
    }

    private executeTask(task: Task) {
        if (this.state === State.PENDING) {
            this.tasks.push(task);
            return;
        }
        const { promise, onfulfilled, onrejected } = task;
        const executor = () => {
            let result;
            try {
                if (this.state === State.FULFILLED) {
                    result = onfulfilled(this.value);
                } else {
                    result = onrejected(this.value);
                }
            } catch (error) {
                promise.settle(State.REJECTED, error);
                return;
            }
            promise.resolve(result);
        };
        nextTick(executor);
    }
}

export default TinyPromise;
