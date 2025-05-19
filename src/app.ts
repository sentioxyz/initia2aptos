import express, {Request, Response} from 'express';
import {APIRequester, RESTClient} from '@initia/initia.js';
import {
    Block,
    BlockEpilogueTransactionResponse,
    BlockMetadataTransactionResponse,
    LedgerInfo,
    MoveModuleBytecode,
    RoleType,
    TransactionResponseType,
    UserTransactionResponse
} from "@aptos-labs/ts-sdk";
import {version} from '../package.json';
import {parseTimestampToMicroSeconds} from './utils';
import {toAptoTransaction, toBlockTx} from "./mapper";
import {CachedAPIRequester} from "./cached-api-requester";
import errorhandler from 'errorhandler'

// Configuration interface
export interface AppConfig {
    port: string;
    chainId: string;
    endpoint: string;
    cacheEnabled?: boolean;
    cacheDuration?: string;
    debug?: boolean;
    logErrors?: boolean;
}

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
    port: '3000',
    chainId: 'echelon-1',
    endpoint: 'https://archival-rest-echelon-1.anvil.asia-southeast.initia.xyz',
    cacheEnabled: true,
    cacheDuration: '5 minutes',
    debug: false,
    logErrors: true
};


export function createApp(config: AppConfig = DEFAULT_CONFIG) {
    const app = express();
    app.use(express.json());

    if (config.debug) {
        // logger middleware
        app.use((req, res, next) => {
            console.info({
                method: req.method,
                path: req.path,
                query: req.query,
                body: req.body,
            });
            next();
        });
    }

    app.use(errorhandler())

    let apiRequester: APIRequester

    // Set up API requester based on cache configuration
    apiRequester = config.cacheEnabled
        ? new CachedAPIRequester(config)
        : new APIRequester(config.endpoint);

    // Initialize REST client with the configured endpoint
    const rest = new RESTClient(config.endpoint, {
        chainId: config.chainId,
    }, apiRequester);

    const txApi = rest.tx
    const moveApi = rest.move

    // V1 endpoint - Latest Initia transaction to Aptos node info
    app.get('/v1', async function (req: Request, res: Response) {
        try {
            const blockInfo = await rest.tendermint.blockInfo();
            const header = blockInfo.block.header as any;

            const txs = await txApi.txInfosByHeight(parseInt(header.height));
            const latestTxVersion = 10000n * BigInt(header.height) + BigInt(txs.length);

            // map latestTxInfo to aptos LedgerInfo
            const aptosLedgerInfo: LedgerInfo = {
                chain_id: 1, // requires number
                epoch: '1',
                ledger_version: latestTxVersion + '',
                oldest_ledger_version: '10000',
                ledger_timestamp: parseTimestampToMicroSeconds(header.time),
                node_role: RoleType.FULL_NODE,
                oldest_block_height: '1',
                block_height: header.height
            };

            res.json(aptosLedgerInfo);
        } catch (error) {
            console.error('Error fetching transaction info:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to fetch latest transaction information',
                error: error
            });
        }
    });

    // Block by height endpoint - Returns block data in Aptos format
    app.get('/v1/blocks/by_height/:height', async (req: Request, res: Response): Promise<void> => {
        try {
            const height = req.params.height;

            // Validate height parameter
            if (!height || isNaN(parseInt(height))) {
                res.status(400).json({
                    status: 'error',
                    message: 'Invalid height parameter. Must be a valid number.'
                });
                return;
            }

            // Fetch transactions by height
            const txs = await txApi.txInfosByHeight(parseInt(height));
            const blockInfo = await rest.tendermint.blockInfo(parseInt(height));

            const userTxs: UserTransactionResponse[] = [];

            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                const version = 10000n * BigInt(tx.height) + BigInt(i + 1);
                userTxs.push(toAptoTransaction(tx, version, i));
            }

            const blockMetaTx: BlockMetadataTransactionResponse = toBlockTx(blockInfo)
            const transactions = [blockMetaTx, ...userTxs]

            const aptosBlock: Block = {
                block_height: height,
                block_hash: blockInfo?.block_id?.hash ?? '',
                block_timestamp: blockMetaTx.timestamp,
                first_version: transactions.length > 0 ? transactions[0].version : '0',
                last_version: transactions.length > 0 ? transactions[transactions.length - 1].version : '0',
                transactions: [blockMetaTx, ...userTxs]
            };

            // Return the response
            res.json(aptosBlock);
        } catch (error) {
            console.error(`Error fetching block data at height ${req.params.height}:`, error);
            res.status(500).json({
                message: `Failed to fetch block data at height ${req.params.height}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    });

    app.get('/v1/accounts/:address/modules', async (req: Request, res: Response) => {
        try {
            let next: string | undefined = undefined;
            let result: MoveModuleBytecode[] = [];

            do {
                const address = req.params.address;
                const [modules, pagination] = await moveApi.modules(address, {next_key: next});
                next = pagination.next_key;
                for (const m of modules) {
                    result.push({
                        abi: JSON.parse(m.abi),
                        bytecode: m.raw_bytes
                    });
                }
            } while (next);
            res.json(result);
        } catch (error) {
            console.error(`Error fetching modules for account ${req.params.address}:`, error);
            res.status(500).json({
                message: `Failed to fetch modules for account ${req.params.address}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    });

    app.get('/v1/accounts/:address/module/:module', async (req: Request, res: Response) => {
        try {
            const address = req.params.address;
            const m = req.params.module;
            const module = await moveApi.module(address, m, {})

            res.json({
                abi: JSON.parse(module.abi),
                bytecode: module.raw_bytes
            });
        } catch (error) {
            console.error(`Error fetching modules for account ${req.params.address}:`, error);
            res.status(500).json({
                message: `Failed to fetch modules for account ${req.params.address}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    });

    app.get('/v1/accounts/:address/resources', async (req: Request, res: Response) => {
        try {
            const address = req.params.address;
            let ret: any[] = []
            let next: any = undefined
            do {
                const [resources, pagination] = await moveApi.resources(address, {next_key: next})
                next = pagination.next_key;
                ret = ret.concat(resources);
            } while (next);

            res.json(ret);
        } catch (error) {
            console.error(`Error fetching modules for account ${req.params.address}:`, error);
            res.status(500).json({
                message: `Failed to fetch modules for account ${req.params.address}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    })
    app.get('/v1/accounts/:address/resource/:resource', async (req: Request, res: Response) => {
        try {
            const address = req.params.address;
            const r = req.params.resource;
            const {type, data} = await moveApi.resource(address, r, {})

            res.json({
                type,
                data
            });
        } catch (error) {
            console.error(`Error fetching resource for account ${req.params.address}:`, error);
            res.status(500).json({
                message: `Failed to fetch resource for account ${req.params.address}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    });

    app.post('/v1/view', async (req: Request, res: Response) => {
        try {
            const body = req.body;
            const [address, module, func] = body['function'].split('::');
            const result = await moveApi.view(
                address,
                module,
                func,
                body.type_arguments ?? [],
                body.arguments ?? []
            );
            res.json(result.data);
        } catch (error) {
            console.error(`Error simulating transaction:`, error);
            res.status(500).json({
                message: `Failed to call view function`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    })

    app.get('/v1/transactions/by_version/:version', async (req: Request, res: Response) => {
        try {
            const version = req.params.version?.trim();
            // convert version back to block height and index
            const height = Math.floor(parseInt(version) / 10000);

            const index = parseInt(version) % 10000;
            if (index == 0) { // block metadata transaction
                const blockInfo = await rest.tendermint.blockInfo(height);
                res.json(toBlockTx(blockInfo));
            } else {
                const txs = await txApi.txInfosByHeight(height);
                if (index > txs.length) {
                    // return a fake tx
                    const blockInfo = await rest.tendermint.blockInfo(height);
                    const tx: BlockEpilogueTransactionResponse = {
                        type: TransactionResponseType.BlockEpilogue,
                        version: version,
                        hash: blockInfo.block.header.data_hash,
                        state_change_hash: '',
                        event_root_hash: '',
                        state_checkpoint_hash: null,
                        gas_used: '0',
                        success: false,
                        vm_status: '',
                        accumulator_root_hash: '',
                        changes: [],
                        timestamp: parseTimestampToMicroSeconds(blockInfo.block.header.time),
                        block_end_info: null
                    }
                    res.json(tx)
                } else {
                    const tx = txs[index - 1];
                    res.json(toAptoTransaction(tx, BigInt(version), index - 1));
                }
            }
        } catch (error) {
            console.error(`Error fetching transaction by version ${req.params.version}:`, error);
            res.status(500).json({
                message: `Failed to fetch transaction by version ${req.params.version}`,
                error_code: 'internal_error',
                vm_error_code: error
            });
        }
    });

    // Root endpoint
    app.get('/', (req: Request, res: Response) => {
        res.json({
            message: 'Welcome to Initia2Aptos Bridge API',
            endpoints: {
                nodeInfo: '/v1',
                blockByHeight: '/v1/blocks/by_height/:height', // Returns block data in Aptos format
                accountModules: '/v1/accounts/:address/modules'
            },
            config: {
                endpoint: config.endpoint
            },
            version
        });
    });


    // Fallback endpoint for all unmatched routes
    app.all('*splat', (req: Request, res: Response) => {
        res.status(404).json({
            status: 'error',
            error_code: 'not_supported',
            message: 'Not supported',
        });
    });

    return app;
}

