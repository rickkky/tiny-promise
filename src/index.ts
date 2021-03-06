import { nextTick } from './next-tick';

interface FulfilledHandler<T, TResult> {
    (value: T): TResult | Thenable<TResult>;
}

interface RejectedHandler<TResult> {
    (reason: any): TResult | Thenable<TResult>;
}

interface Thenable<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: FulfilledHandler<T, TResult1> | null,
        onrejected?: RejectedHandler<TResult2> | null,
    ): Thenable<TResult1 | TResult2>;
}

interface Executor<T> {
    (
        resolve: (value: T | Thenable<T>) => void,
        reject: (reason?: any) => void,
    ): void;
}

interface Task<T, TResult1, TResult2> {
    promise: TinyPromise<TResult1 | TResult2>;
    onfulfilled: FulfilledHandler<T, TResult1>;
    onrejected: RejectedHandler<TResult2>;
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
    static resolve<T>(value: T | Thenable<T>): TinyPromise<T> {
        return new TinyPromise((resolve) => {
            resolve(value);
        });
    }

    static rejec<T = never>(reason?: any): TinyPromise<T> {
        return new TinyPromise((resolve, reject) => {
            reject(reason);
        });
    }

    // The state of the promise can only be changed
    // from `PENDING` to `FULFILLED` or`REJECTED`.
    #state: State = State.PENDING;
    #value: T | undefined = undefined;
    #reason: any = undefined;
    #tasks: Task<T, any, any>[] = [];

    constructor(executor: Executor<T>) {
        this.#execute(executor);
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: FulfilledHandler<T, TResult1> | null,
        onrejected?: RejectedHandler<TResult2> | null,
    ): TinyPromise<TResult1 | TResult2> {
        const task = {
            promise: new TinyPromise<TResult1 | TResult2>(() => {}),
            onfulfilled:
                typeof onfulfilled === 'function' ? onfulfilled : passValue,
            onrejected:
                typeof onrejected === 'function' ? onrejected : passError,
        };
        this.#handleTask(task);
        return task.promise;
    }

    catch<TResult>(
        onrejected?: RejectedHandler<TResult> | null,
    ): TinyPromise<T | TResult> {
        return this.then(undefined, onrejected);
    }

    #execute(executor: Executor<T>) {
        let called = false;
        const resolve = (value: T | Thenable<T>) => {
            if (!called) {
                called = true;
                this.#resolve(value);
            }
        };
        const reject = (reason?: any) => {
            if (!called) {
                called = true;
                this.#settle(State.REJECTED, reason);
            }
        };
        try {
            executor(resolve, reject);
        } catch (error) {
            reject(error);
        }
    }

    // execute the promise resolution procedure, see:
    // https://promisesaplus.com/#the-promise-resolution-procedure
    #resolve(x: T | Thenable<T>) {
        let then;
        // Try to get the `then` method of `x`.
        if ((typeof x === 'object' && x !== null) || typeof x === 'function') {
            try {
                then = (x as any).then;
            } catch (error) {
                // If `x.then` is a getter and throw an exception, reject the promise.
                this.#settle(State.REJECTED, error);
                return;
            }
        } else {
            then = undefined;
        }
        // If `promise` and `x` refer to the same object,
        // reject `promise` with a `TypeError' as the reason.
        if (x === this) {
            this.#settle(
                State.REJECTED,
                new TypeError('Can not resolve promise with itself.'),
            );
            return;
        }
        // If `x` is not thenable, fulfill the promise.
        if (typeof then !== 'function') {
            this.#settle(State.FULFILLED, x as T);
            return;
        }
        // If `x` is a thenable, continue resolve the promise.
        this.#execute(then.bind(x));
    }

    #settle(state: State.FULFILLED, value: T): void;
    #settle(state: State.REJECTED, reason: any): void;
    #settle(state: State.FULFILLED | State.REJECTED, result: any) {
        if (this.#state !== State.PENDING) {
            return;
        }
        this.#state = state;
        if (state === State.FULFILLED) {
            this.#value = result;
        } else {
            this.#reason = result;
        }
        for (const task of this.#tasks) {
            this.#handleTask(task);
        }
    }

    #handleTask(task: Task<T, any, any>) {
        if (this.#state === State.PENDING) {
            this.#tasks.push(task);
            return;
        }
        const { promise, onfulfilled, onrejected } = task;
        const handler = () => {
            let result;
            try {
                if (this.#state === State.FULFILLED) {
                    result = onfulfilled(this.#value as T);
                } else {
                    result = onrejected(this.#reason);
                }
            } catch (error) {
                promise.#settle(State.REJECTED, error);
                return;
            }
            promise.#resolve(result);
        };
        nextTick(handler);
    }
}

export default TinyPromise;
