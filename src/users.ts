import { UsersApi as FSUsersApi, UsersBatchImportApi as FSUsersBatchApi } from '@api/index';
import { BatchUserImportRequest, BatchUserImportResponse, CreateBatchUserImportJobRequest, CreateUserRequest, CreateUserResponse, FailedUserImport, GetBatchUserImportStatusResponse, GetUserResponse, JobMetadata, ListUsersResponse, UpdateUserRequest, UpdateUserResponse } from '@model/index';

import { BatchJob, BatchJobOptions, IBatchRequester } from './batch';
import { FSRequestOptions, FSResponse, FullStoryOptions } from './http';

////////////////////////////////////
//  CRUD operations
////////////////////////////////////

export interface IUsersApi {
    get(...req: Parameters<typeof FSUsersApi.prototype.getUser>): Promise<FSResponse<GetUserResponse>>;

    create(...req: Parameters<typeof FSUsersApi.prototype.createUser>): Promise<FSResponse<CreateUserResponse>>;

    list(...req: Parameters<typeof FSUsersApi.prototype.listUsers>): Promise<FSResponse<ListUsersResponse>>;

    delete(...req: Parameters<typeof FSUsersApi.prototype.deleteUser>): Promise<FSResponse<void>>;

    update(...req: Parameters<typeof FSUsersApi.prototype.updateUser>): Promise<FSResponse<UpdateUserResponse>>;
}

////////////////////////////////////
//  Batch Imports
////////////////////////////////////

export interface IBatchUsersApi {
    batchCreate(
        requests?: Array<BatchUserImportRequest>,
        jobOptions?: BatchJobOptions
    ): BatchUsersJob;
}

class BatchUsersJob extends BatchJob<'users', GetBatchUserImportStatusResponse, BatchUserImportRequest, BatchUserImportResponse, FailedUserImport> {
    constructor(fsOpts: FullStoryOptions, requests: BatchUserImportRequest[] = [], opts: BatchJobOptions = {}) {
        super(requests, new BatchUsersRequester(fsOpts), opts);
    }
}

class BatchUsersRequester implements IBatchRequester<GetBatchUserImportStatusResponse, BatchUserImportRequest, BatchUserImportResponse, FailedUserImport>{
    protected readonly batchUsersImpl: FSUsersBatchApi;

    constructor(fsOpts: FullStoryOptions) {
        this.batchUsersImpl = new FSUsersBatchApi(fsOpts);
    }

    async requestCreateJob(request: CreateBatchUserImportJobRequest): Promise<JobMetadata> {
        const rsp = await this.batchUsersImpl.createBatchUserImportJob(request);
        // make sure job metadata exist
        const job = rsp.body?.job;
        if (!job) {
            throw new Error(`Unable to get job ID after creating job, server status: ${rsp.httpStatusCode}`);
        }
        return job;
    }

    async requestImports(id: string): Promise<BatchUserImportResponse[]> {
        const res = await this.batchUsersImpl.getBatchUserImports(id);
        const results = res.body?.results;
        if (!results) {
            throw new Error('API did not response with any results');
        }
        return results;
    }

    async requestImportErrors(id: string): Promise<FailedUserImport[]> {
        const res = await this.batchUsersImpl.getBatchUserImportErrors(id);
        const results = res.body?.results;
        if (!results) {
            throw new Error('API did not response with any results');
        }
        return results;
    }

    async requestJobStatus(id: string): Promise<GetBatchUserImportStatusResponse> {
        const rsp = await this.batchUsersImpl.getBatchUserImportStatus(id);
        const body = rsp.body;
        if (!body) {
            throw new Error('API did not response with any results');
        }
        return body;
    }
}

////////////////////////////////////
//  Exported User Interface
////////////////////////////////////

export class Users implements IUsersApi, IBatchUsersApi {
    protected readonly usersImpl: FSUsersApi;

    constructor(private opts: FullStoryOptions) {
        this.usersImpl = new FSUsersApi(opts);
    }

    async get(id: string, options?: FSRequestOptions | undefined): Promise<FSResponse<GetUserResponse>> {
        return this.usersImpl.getUser(id, options);
    }

    async create(body: CreateUserRequest, options?: FSRequestOptions | undefined): Promise<FSResponse<CreateUserResponse>> {
        return this.usersImpl.createUser(body, options);
    }
    async list(uid?: string | undefined, email?: string | undefined, displayName?: string | undefined, isIdentified?: boolean | undefined, pageToken?: string | undefined, options?: FSRequestOptions | undefined): Promise<FSResponse<ListUsersResponse>> {
        return this.usersImpl.listUsers(uid, email, displayName, isIdentified, pageToken, options);
    }
    async delete(id: string, options?: FSRequestOptions | undefined): Promise<FSResponse<void>> {
        return this.usersImpl.deleteUser(id, options);
    }
    async update(id: string, body: UpdateUserRequest, options?: FSRequestOptions | undefined): Promise<FSResponse<UpdateUserResponse>> {
        return this.usersImpl.updateUser(id, body, options);
    }

    batchCreate(requests: BatchUserImportRequest[] = [], jobOptions?: BatchJobOptions): BatchUsersJob {
        return new BatchUsersJob(this.opts, requests, jobOptions);
    }
}
