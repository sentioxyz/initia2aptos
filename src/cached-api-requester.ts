import {APIRequester} from "@initia/initia.js";
import {AppConfig} from "./app";
import {buildMemoryStorage, setupCache} from "axios-cache-interceptor";
import Axios from "axios";
import {toDurationMs} from "./utils";


export class CachedAPIRequester extends APIRequester {

    constructor(config: AppConfig) {
        super(config.endpoint)
        if (config.cacheEnabled) {
            const axios = Axios.create({
                baseURL: config.endpoint
            });
            this['axios'] = setupCache(axios, {
                location: "server",
                storage: buildMemoryStorage(
                    false, toDurationMs(config.cacheDuration))
            })
        }
    }
}