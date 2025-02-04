/* eslint multiline-comment-style: ["error", "starred-block"] */
/**
 * This file is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * Generated from schema: fullstory.v2.events.LocationContext
 * Do not edit manually.
 */

/**
 * @interface LocationContext The location context in which the events are attached to
 */
export interface LocationContext {
    /**
     * ISO 3166-1 alpha-2 standard country code
     */
    'country_code'?: string;
    /**
     * ISO-3166-2 standard region code
     */
    'region_code'?: string;
    /**
     * Name of the city
     */
    'city_name'?: string;
    'latitude'?: number;
    'longitude'?: number;
}

