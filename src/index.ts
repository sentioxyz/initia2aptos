#!/usr/bin/env node

import express, { Request, Response } from 'express';
import {Command} from 'commander';
import {RESTClient, Tx, TxAPI, Event as InitiaEvent, BlockInfo} from '@initia/initia.js';
import {Block, LedgerInfo, RoleType, TransactionResponseType, UserTransactionResponse, Event } from "@aptos-labs/ts-sdk";

// Setup commander for CLI functionality
const program = new Command();
program
    .version('1.0.0')
    .description('Initia2Aptos Bridge API')
    .option('-p, --port <number>', 'Port to run the server on', '3000')
    .option('-c, --chain-id <string>', 'Chain ID for Initia', 'echelon-1')
    .option('-e, --endpoint <url>', 'indexer endpoint', 'https://archival-rest-echelon-1.anvil.asia-southeast.initia.xyz');

program.parse();

const options = program.opts();

const app = express();
const PORT = process.env.PORT || options.port;

// Initialize REST client with the configured endpoint
const rest = new RESTClient(options.endpoint, {
    chainId: options.chainId,
})

const txApi = new TxAPI(rest)
// Middleware

app.use(express.json());

// V1 endpoint - Latest Initia transaction to Aptos node info
app.get('/v1', function(req: Request, res: Response) {
    (async () => {
        try {
            const blockInfo = await rest.tendermint.blockInfo()
            const header = blockInfo.block.header as any;
            // Fetch the latest transaction information

            // map latestTxInfo to aptos LedgerInfo
            const aptosLedgerInfo: LedgerInfo = {
                chain_id: header.chain_id,
                epoch: '1',
                ledger_version: header.height,
                oldest_ledger_version: '1',
                ledger_timestamp: Date.parse(header.time).valueOf()+"",
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
    })();
});

// Block by height endpoint - Returns block data in Aptos format
app.get('/v1/blocks/by_height/:height', function(req: Request, res: Response) {
    (async () => {
        try {
            const height = req.params.height;

            // Validate height parameter
            if (!height || isNaN(parseInt(height))) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid height parameter. Must be a valid number.'
                });
            }

            // Fetch transactions by height
            const txs = await txApi.txInfosByHeight(parseInt(height));

            let blockInfo: BlockInfo | null = null;
            try { // Fetch block information to get hash and timestamp
                blockInfo = await rest.tendermint.blockInfo(parseInt(height));
            } catch (e) {
                // ignore
            }

            const userTxs: UserTransactionResponse[] = []
            const gasPrice = await rest.gasPrices()

            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                userTxs.push({
                    hash: tx.txhash,
                    type: TransactionResponseType.User,
                    version: `${tx.height}-${i}`,
                    timestamp: tx.timestamp,
                    success: true,
                    vm_status: '',
                    sender: '',
                    sequence_number: '' + i,
                    state_change_hash: '',
                    event_root_hash: '',
                    state_checkpoint_hash: null,
                    gas_used: '' + tx.gas_used,
                    accumulator_root_hash: '',
                    changes: [],
                    max_gas_amount: tx.gas_wanted + '',
                    gas_unit_price: gasPrice ? gasPrice.toString() : "",
                    expiration_timestamp_secs: '0',
                    payload: {
                        type: '',
                        function: '_::_::_',
                        type_arguments: [],
                        arguments: []
                    },
                    events: mapEvents(tx.events)
                })
            }

            // Map to Aptos Block structure
            let blockTimestamp =blockInfo?  Date.parse(blockInfo?.block?.header?.time).valueOf() +"" : '';
            const aptosBlock: Block = {
                block_height: height,
                block_hash: blockInfo?.block_id?.hash ?? '',
                block_timestamp: blockTimestamp,
                first_version: txs.length > 0 ? `${height}-0` : '0',
                last_version: txs.length > 0 ? `${height}-${txs.length - 1}` : '0',
                transactions: userTxs
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
    })();
});

// Root endpoint
app.get('/', function(req: Request, res: Response) {
    res.json({
        message: 'Welcome to Initia2Aptos Bridge API',
        endpoints: {
            nodeInfo: '/v1',
            blockByHeight: '/v1/blocks/by_height/:height', // Returns block data in Aptos format
        },
        config: {
            endpoint: options.endpoint
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to access the API`);
});


function mapEvents(events: InitiaEvent[]) : Event[] {
    if (!events || events.length === 0) {
        return [];
    }
    const res: any[] = []
    for (const e of events) {
        if (e.type == 'move') {
            const type = e.attributes.find(kv => kv.key == 'type_tag')?.value
            const data = e.attributes.find(kv => kv.key == 'data')?.value
            if (type && data) {
                res.push({
                    type,
                    data: JSON.parse(data)
                })
            }
        }
    }

   return res
}
