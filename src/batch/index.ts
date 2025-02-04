
////////////////////////////////////
//  Batch Imports
////////////////////////////////////
import { JobMetadata, JobStatus } from '@model/index';

import { FSUnknownError, isFSError } from '../errors';
import { toError } from '../errors/base';
import { withDelay, withRetry } from '../utils/retry';

export interface IBatchRequester<REQ, RSP, STATUS_RSP, IMPORTS_RSP, ERRORS_RSP> {
    requestCreateJob(req: REQ): Promise<RSP>;

    requestImports(id: string, nextPageToken?: string): Promise<IMPORTS_RSP>;

    requestImportErrors(id: string, nextPageToken?: string): Promise<ERRORS_RSP>;

    requestJobStatus(id: string): Promise<STATUS_RSP>;
}

export interface BatchJobOptions {
    /*
     * pollInterval in ms, defaults to every 2 seconds.
     * The minimum interval at which job status is polled from the server.
     * The interval does not guarantee the poll happens at the exact time, but ensures the previous
     * poll had completed.
     * If polling had hit a rate limit, exponentially increasing delays based on `retry-after` header
     * and the number of consecutive failures.
     */
    pollInterval?: number;
    /*
     * maxRetry: max number of API errors in a row before aborting.
     */
    maxRetry?: number,
    /*
     * TODO(sabrina): add a timeout and onTimeout to clean up everything
     * TODO(sabrina): allow custom retry policies
     */
}

export const DefaultBatchJobOpts: Required<BatchJobOptions> = {
    pollInterval: 2000,
    maxRetry: 3,
};

export interface IBatchJob<REQUEST, IMPORT, FAILURE> {
    readonly options: Required<BatchJobOptions>;
    requests: REQUEST[];

    readonly metadata?: JobMetadata;
    readonly imports: IMPORT[];
    readonly failedImports: FAILURE[];
    errors: Error[];

    /*
    * Add more request objects in the requests before the job executes.
    * @throws An error if job is already executed, or max number of items reached.
    */
    add(requests: REQUEST[]): this;

    // TODO(sabrina): allow removal of a specific request?

    /*
     * Starts to execute the job by invoking the create batch import API.
     * Listen to the "error" event to be notified if any error occurs while creating the job.
     */
    execute(): void;

    /*
     * Get the current job Id.
     * @returns The string job Id, or undefined if not yet executed.
     */
    getId(): string | undefined;

    /*
     * Get the current job status.
     * @returns The current JobStatus, or undefined if not yet executed.
     */
    getStatus(): JobStatus | undefined;

    /*
    * Retrieve successful imports if the job is done.
    * @returns An array of batch items successfully imported.
    */
    getImports(): IMPORT[];

    /*
    * Retrieve failed items imports if the job has errors.
    * @returns An array of batch items failed to be imported.
    */
    getFailedImports(): FAILURE[];

    /*
   * Fires when the request to create batch job returns successful response and we got a job ID.
   * @param job The current job.
   */
    on(type: 'created', callback: (job: this) => void): this;

    /*
    * Fires when a poll to get latest job status is completed after each poll interval,
    * while the job is still processing (job status == PROCESSING).
    * @param job The current job.
    */
    on(type: 'processing', callback: (job: this) => void): this;

    /*
    * Fires when job status becomes COMPLETED or FAILED.
    * It will automatically call /<resource_root>/batch/{job_id}/imports and
    * /<resource_root>/batch/{job_id}/errors endpoints,
    * to get imported and failed responses.
    * Called only once per job execution.
    * @param imported An array of batch items successfully imported.
    * @returns failed An array of batch items failed to be imported.
    */
    on(type: 'done', callback: (imported: IMPORT[], failed: FAILURE[]) => void): this;

    /*
    * Fires when any errors during the import jobs, may be called more than once.
    * - Failures when making API requests, including any network, http errors, etc.
    * - When job status is COMPLETED or FAILED, but unable to retrieve imported/failed items.
    * @param error The error encountered.
    */
    on(type: 'error', callback: (error: Error) => void): this;

    /*
    * Fires when the job aborts due to unrecoverable error.
    * Called only once per job execution.
    * @param errors The errors encountered over the lifecycle of the job.
    */
    on(type: 'abort', callback: (errors: Error[]) => void): this;
}

export class BatchJob<REQUEST, CREATE_RSP extends { job?: JobMetadata; }, STATUS_RSP extends { job?: JobMetadata; }, IMPORT, FAILURE> implements IBatchJob<REQUEST, IMPORT, FAILURE>{
    readonly options: Required<BatchJobOptions>;
    requests: REQUEST[] = [];

    metadata?: JobMetadata | undefined;
    imports: IMPORT[] = [];
    failedImports: FAILURE[] = [];
    errors: Error[] = [];

    private _createdCallbacks: ((job: this) => void)[] = [];
    private _processingCallbacks: ((job: this) => void)[] = [];
    private _doneCallbacks: ((imported: IMPORT[], failed: FAILURE[]) => void)[] = [];
    private _abortCallbacks: ((errors: Error[]) => void)[] = [];
    private _errorCallbacks: ((error: Error) => void)[] = [];

    private _executionStatus: 'not-started' | 'pending' | 'completed' | 'aborted' = 'not-started';
    private _interval?: NodeJS.Timer;
    private _statusPromise?: Promise<STATUS_RSP>;
    private _nextPollDelay = 0;
    private _numRetries = 0;

    constructor(
        requests: REQUEST[] = [],
        // TODO(sabrina):these could be better typed
        private requester: IBatchRequester<{ requests: REQUEST[]; }, CREATE_RSP, STATUS_RSP, { results?: IMPORT[], next_page_token?: string; }, { results?: FAILURE[], next_page_token?: string; }>,
        opts: BatchJobOptions = {},
    ) {
        this.requests.push(...requests);
        this.options = Object.assign({}, DefaultBatchJobOpts, opts);
    }


    getId(): string | undefined {
        return this.metadata?.id;
    }

    getStatus() {
        return this.metadata?.status;
    }

    getImports(): IMPORT[] {
        return this.imports;
    }

    getFailedImports(): FAILURE[] {
        return this.failedImports;
    }

    add(requests: REQUEST[]) {
        if (this._executionStatus != 'not-started') {
            throw new Error('Job already executed, can not add more requests.');
        }
        // TODO(sabrina): throw if max number of users reached
        this.requests.push(...requests);
        return this;
    }

    execute(): void {
        // don't execute again if the job had already been created.
        if (this.getId()) {
            return;
        }
        // don't execute again if the job is still executing
        if (this._executionStatus === 'pending' || this._executionStatus === 'completed') {
            return;
        }

        this._executionStatus = 'pending';
        withRetry(() => this.requester.requestCreateJob(this), this.handleError.bind(this), this.options.maxRetry)
            .then(response => {
                // Successful response should always have ID.
                // If not, something wrong had happened in calling server API
                if (!response.job?.id) {
                    throw new FSUnknownError(`Unable to get job ID after creating a job, job metadata received: ${response}`);
                }
                this.setMetadata(response.job);
                this.startPolling();
                this.handleJobCreated();
            }).catch(_ => { // all errors should have already been handled
                this.handleAbort();
            });
    }

    on(type: 'created', callback: (job: this) => void): this;
    on(type: 'processing', callback: (job: this) => void): this;
    on(type: 'done', callback: (imported: IMPORT[], failed: FAILURE[]) => void): this;
    on(type: 'error', callback: (error: Error) => void): this;
    on(type: 'abort', callback: (errors: Error[]) => void): this;
    on(type: string, callback: any): this {
        switch (type) {
            case 'created':
                if (this._executionStatus !== 'not-started') {
                    // job had already been started, invoke immediately.
                    callback(this);
                }
                this._createdCallbacks.push(callback);
                break;
            case 'processing':
                this._processingCallbacks.push(callback);
                break;
            case 'done':
                // if the we've already got the imports and failures, immediately invoke it with current values.
                if (this._executionStatus === 'completed') {
                    callback(this.imports, this.failedImports);
                }
                this._doneCallbacks.push(callback);
                break;
            case 'error':
                // if there are already errors encountered, immediately invoke with current values.
                if (this.errors.length) {
                    callback(this.errors);
                }
                this._errorCallbacks.push(callback);
                break;
            case 'abort':
                // if job had already been aborted, immediately invoke with current errors.
                if (this._executionStatus === 'aborted') {
                    callback(this.errors);
                }
                this._abortCallbacks.push(callback);
                break;
            default:
                throw new Error('Unknown event type.');
        }
        return this;
    }

    private setMetadata(job?: JobMetadata) {
        if (this.getId() && this.getId() != job?.id) {
            throw new Error(`can not set existing job metadata ${this.getId()} to a different job ${job?.id}`);
        }
        this.metadata = job;
    }

    private startPolling() {
        const id = this.getId();
        if (!id) {
            throw new Error('Current job ID is unknown, make sure the job had been executed');
        }

        this._interval = setInterval(async () => {
            // if last poll is not resolved before next pull, ignore this interval.
            if (this._statusPromise) {
                return;
            }

            // start a new request with any rate limited retry delay, and set the new promise
            this._statusPromise = withDelay(() => this.requester.requestJobStatus(id), this._nextPollDelay);
            try {
                const statusRsp = await this._statusPromise;
                const metadata = statusRsp.job;
                if (!metadata || !metadata.id) {
                    throw new FSUnknownError('Invalid job metadata received: ' + statusRsp);
                }
                this.setMetadata(metadata);
                // TODO(sabrina): maybe dispatch this as events rather than calling handlers here
                switch (metadata.status) {
                    case JobStatus.Processing:
                        this.handleProcessing();
                        break;
                    case JobStatus.Completed:
                        this.handleCompleted(id);
                        break;
                    case JobStatus.Failed:
                        this.handleCompletedWithFailure(id);
                        break;
                    default:
                        throw new Error('Unknown job stats received: ' + this.metadata?.status);
                }
            } catch (e) {
                this.handleError(e);
                this._numRetries++;
                if (this._numRetries >= this.options.maxRetry || !isFSError(e) || !e.canRetry()) {
                    this.handleAbort();
                } else {
                    this._nextPollDelay = e.getRetryAfter() + this._nextPollDelay * 2;
                }
            } finally {
                // clean up the current promise
                delete this._statusPromise;
            }
        }, this.options.pollInterval);
    }

    private stopPolling() {
        clearInterval(this._interval);
    }

    private handleJobCreated() {
        for (const cb of this._createdCallbacks) {
            cb(this);
        }
    }

    private handleProcessing() {
        for (const cb of this._processingCallbacks) {
            cb(this);
        }
    }

    private async handleCompleted(id: string) {
        this.stopPolling();
        this._executionStatus = 'completed';

        const imports = await this.requestImportsWithPaging(id);
        this.imports.push(...imports);
        for (const cb of this._doneCallbacks) {
            cb(this.imports, this.failedImports);
        }
    }

    private async handleCompletedWithFailure(id: string) {
        this.stopPolling();
        this._executionStatus = 'completed';

        const errors = await this.requestImportErrorsWithPaging(id);
        this.failedImports.push(...errors);
        for (const cb of this._doneCallbacks) {
            cb(this.imports, this.failedImports);
        }
    }

    private handleError(err: unknown) {
        const error = toError(err);
        if (!error) return;
        // TODO(sabrina): check for FSError
        this.errors.push(error);
        for (const cb of this._errorCallbacks) {
            cb(error);
        }
    }

    private handleAbort() {
        this._executionStatus = 'aborted';
        this.stopPolling();
        for (const cb of this._abortCallbacks) {
            cb(this.errors);
        }
    }


    private async requestImportsWithPaging(id: string): Promise<IMPORT[]> {
        const imports = await this.withPageToken((next?: string) => this.requester.requestImports(id, next));
        return imports.flatMap(i => i.results || []);
    }


    private async requestImportErrorsWithPaging(id: string): Promise<FAILURE[]> {
        const errors = await this.withPageToken((next?: string) => this.requester.requestImportErrors(id, next));
        return errors.flatMap(e => e.results || []);
    }

    private async withPageToken<T extends { next_page_token?: string; }>(method: { (next?: string): Promise<T>; }) {
        const results: T[] = [];
        let hasNextPage = true;
        let pageToken: string | undefined;

        while (hasNextPage) {
            const res = await withRetry(
                () => method(pageToken),
                (err) => this.handleError(err)
            );
            results.push(res);

            hasNextPage = !!res.next_page_token && res.next_page_token !== pageToken;
            pageToken = res.next_page_token;
        }
        return results;
    }
}
