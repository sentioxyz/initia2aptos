import {APIRequester} from "@initia/initia.js";
import {AppConfig} from "./app";
import {buildMemoryStorage, setupCache} from "axios-cache-interceptor";
import Axios from "axios";
import {toDurationMs} from "./utils";


export class CachedAPIRequester extends APIRequester {

    constructor(config: AppConfig) {
        // Initialize with primary endpoint
        super(config.endpoint)

        // Create a fresh axios instance that we control so we can attach
        // caching and fallback retry behavior regardless of cacheEnabled.
        const axiosInstance = Axios.create({
            baseURL: config.endpoint
        });

        // Apply cache wrapper if enabled
        if (config.cacheEnabled) {
            this['axios'] = setupCache(axiosInstance, {
                location: "server",
                storage: buildMemoryStorage(
                    false, toDurationMs(config.cacheDuration))
            })
        } else {
            this['axios'] = axiosInstance;
        }

        // Attach fallback interceptor to the final axios instance (if provided)
        if (config.fallbackEndpoint) {
            const fallback = config.fallbackEndpoint;
            (this['axios'] as any).interceptors.response.use(
                (response: any) => response,
                async (error: any) => {
                    console.debug('[CachedAPIRequester] response interceptor triggered for error', error?.response?.status);
                    try {
                        const req = error.config as any;
                        if (!req) return Promise.reject(error);

                        // Avoid retry loops - only retry once per request
                        if (req.__retried_with_fallback) {
                            console.debug('[CachedAPIRequester] already retried with fallback, aborting');
                            return Promise.reject(error);
                        }

                        // Decide whether to retry: network error (no response) OR any HTTP error
                        const isNetworkError = !error.response;
                        const isHttpError = !!error.response; // includes 4xx and 5xx
                        if (!isNetworkError && !isHttpError) return Promise.reject(error);

                        console.info('[CachedAPIRequester] attempting retry with fallback', fallback);

                        // Mark and retry against fallback endpoint
                        req.__retried_with_fallback = true;

                        // Clone the request and set baseURL or replace absolute URL origin to fallback
                        const newReq = {
                            ...req,
                            // Bypass cache for fallback retry to avoid returning cached error
                            cache: false,
                        } as any;

                        // Remove adapter that might be cached/stale
                        delete newReq.adapter;

                        // If the original request used an absolute URL, replace its origin with the fallback origin
                        try {
                            if (typeof newReq.url === 'string' && /^https?:\/\//i.test(newReq.url)) {
                                const origUrl = new URL(newReq.url);
                                const fb = new URL(fallback);
                                newReq.url = newReq.url.replace(origUrl.origin, fb.origin);
                                // ensure axios will allow absolute urls when retrying
                                newReq.allowAbsoluteUrls = true;
                            } else {
                                // otherwise, set baseURL to fallback so relative url is resolved against it
                                newReq.baseURL = fallback;
                            }
                        } catch (e) {
                            // fallback: set baseURL to fallback
                            newReq.baseURL = fallback;
                        }

                        // Use a fresh axios instance for the retry to avoid cache/interceptor issues
                        return Axios.request(newReq);
                    } catch (e) {
                        return Promise.reject(error);
                    }
                }
            );
        }
    }
}