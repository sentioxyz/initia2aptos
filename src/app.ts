import express, {Request, Response} from 'express';
import {BlockInfo, MoveAPI, RESTClient, TxAPI} from '@initia/initia.js';
import {
  Block,
  BlockMetadataTransactionResponse,
  LedgerInfo,
  MoveModuleBytecode,
  RoleType,
  UserTransactionResponse
} from "@aptos-labs/ts-sdk";
import apicache from 'apicache';
import {version} from '../package.json';
import {parseTimestampToMicroSeconds} from './utils';
import {toAptoTransaction, toBlockTx} from "./mapper";

// Configuration interface
export interface AppConfig {
  port: string;
  chainId: string;
  endpoint: string;
  cacheEnabled?: boolean;
  cacheDuration?: string;
}

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
  port: '3000',
  chainId: 'echelon-1',
  endpoint: 'https://archival-rest-echelon-1.anvil.asia-southeast.initia.xyz',
  cacheEnabled: true,
  cacheDuration: '5 minutes'
};



/**
 * Creates an Express application with the given configuration
 * @param config Configuration for the app (port, chainId, endpoint)
 * @returns Configured Express application
 */
export function createApp(config: AppConfig = DEFAULT_CONFIG) {
  const app = express();

  // Initialize REST client with the configured endpoint
  const rest = new RESTClient(config.endpoint, {
    chainId: config.chainId,
  });

  const txApi = new TxAPI(rest);
  const moveApi = new MoveAPI(rest.apiRequester);

  app.use(express.json());

  // Initialize cache middleware if enabled
  const cache = apicache.middleware;
  const cacheMiddleware = config.cacheEnabled ? cache(config.cacheDuration || '5 minutes') : (req: Request, res: Response, next: Function) => next();

  // Add cache performance route if caching is enabled
  if (config.cacheEnabled) {
    app.get('/api/cache/performance', (req: Request, res: Response) => {
      res.json(apicache.getPerformance());
    });

    app.get('/api/cache/index', (req: Request, res: Response) => {
      res.json(apicache.getIndex());
    });

    app.get('/api/cache/clear/:target', (req: Request, res: Response) => {
      res.json(apicache.clear(req.params.target));
    });

    app.get('/api/cache/clear', (req: Request, res: Response) => {
      const target = req.query.target as string;
      res.json(apicache.clear(target || undefined));
    });
  }

  // V1 endpoint - Latest Initia transaction to Aptos node info
  app.get('/v1', cacheMiddleware, async function (req: Request, res: Response) {
    try {
      const blockInfo = await rest.tendermint.blockInfo();
      const header = blockInfo.block.header as any;

      const txs = await txApi.txInfosByHeight(parseInt(header.height));
      const latestTxVersion = 10000n * BigInt(header.height) + BigInt(txs.length);

      // map latestTxInfo to aptos LedgerInfo
      const aptosLedgerInfo: LedgerInfo = {
        chain_id: 1, // requires number
        epoch: '1',
        ledger_version: latestTxVersion.toString(),
        oldest_ledger_version: '1',
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
  app.get('/v1/blocks/by_height/:height', cacheMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        const version = 10000n * BigInt(tx.height) + BigInt(i+ 1);
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

  app.get('/v1/accounts/:address/modules', cacheMiddleware, async (req: Request, res: Response) => {
    try {
      let next: string | undefined = undefined;
      let result: MoveModuleBytecode[] = [];
      do {
        const address = req.params.address;
        const [modules, pagination] = await moveApi.modules(address, { next_key: next });
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

  app.get('/v1/transactions/by_version/:version', cacheMiddleware, async (req: Request, res: Response) => {
    try {
      const version = req.params.version;
      // convert version back to block height and index
      const height = Math.floor(parseInt(version) / 10000);

      const index = parseInt(version) % 10000;
      if (index == 0) { // block metadata transaction
        const blockInfo = await rest.tendermint.blockInfo(height);
        res.json(toBlockTx(blockInfo));
      } else {
        const txs = await txApi.txInfosByHeight(height);
        const tx = txs[index - 1];
        res.json(toAptoTransaction(tx, BigInt(version), index - 1));
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
      cache: {
        enabled: config.cacheEnabled,
        duration: config.cacheDuration,
        endpoints: config.cacheEnabled ? {
          performance: '/api/cache/performance',
          index: '/api/cache/index',
          clear: '/api/cache/clear',
          clearTarget: '/api/cache/clear/:target'
        } : null
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

// Create default app instance
export const app = createApp();
