/* eslint multiline-comment-style: ["error", "starred-block"] */
/**
 * This file is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * Generated from schema: fullstory.v2.events.CreateBatchEventsImportJobRequest
 * Do not edit manually.
 */

import { CreateEventsRequest } from '@model/events/CreateEventsRequest';
/**
 * @interface CreateBatchEventsImportJobRequest The request payloads contains the list of events to be imported
 */
export interface CreateBatchEventsImportJobRequest {
    /**
     * The list of event requests that should be imported
     */
    'requests': Array<CreateEventsRequest>;
}

