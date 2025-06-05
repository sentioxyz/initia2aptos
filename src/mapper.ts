import {BlockInfo, Event as InitiaEvent, MsgExecute, TxInfo} from '@initia/initia.js';
import {
    AccountAddress,
    BlockMetadataTransactionResponse,
    Event,
    TransactionResponseType,
    UserTransactionResponse,
    EntryFunctionPayloadResponse
} from '@aptos-labs/ts-sdk';
import {findSender, parseTimestampToMicroSeconds} from "./utils";

export function mapEvents(events: InitiaEvent[]): Event[] {
    if (!events || events.length === 0) {
        return [];
    }
    const res: any[] = [];
    for (const e of events) {
        if (e.type == 'move') {
            const type = e.attributes.find(kv => kv.key == 'type_tag')?.value;
            const data = e.attributes.find(kv => kv.key == 'data')?.value;
            if (type && data) {
                res.push({
                    type,
                    data: JSON.parse(data),
                });
            }
        }
    }

    return res;
}


export function toAptoTransaction(tx: TxInfo, version: bigint, seq: number): UserTransactionResponse {

    const resultTx: UserTransactionResponse = {
        hash: tx.txhash,
        type: TransactionResponseType.User,
        version: `${version}`,
        timestamp: parseTimestampToMicroSeconds(tx.timestamp),
        success: true,
        vm_status: '',
        sender: findSender(tx),
        sequence_number: '' + seq,
        state_change_hash: '',
        event_root_hash: '',
        state_checkpoint_hash: null,
        gas_used: '' + tx.gas_used,
        accumulator_root_hash: '',
        changes: [],
        max_gas_amount: tx.gas_wanted + '',
        gas_unit_price: '0',
        expiration_timestamp_secs: '0',
        payload: {
            type: '',
            function: '_::_::_',
            type_arguments: [],
            arguments: []
        },
        events: mapEvents(tx.events)
    }

    for (const msg of tx.tx.body.messages || []) {
        const m = msg as any;
        if (m.module_address && m.module_name && m.function_name) {
            const msgData = m as MsgExecute.Data;
            resultTx.sender = findSender(tx);
            resultTx.payload = {
                type: 'entry_function_payload',
                function: `${msgData.module_address}::${msgData.module_name}::${msgData.function_name}`,
                type_arguments: msgData.type_args || [],
                arguments: msgData.args || []
            } as EntryFunctionPayloadResponse;
        }
    }

    return resultTx;
}


export function toBlockTx(blockInfo: BlockInfo): BlockMetadataTransactionResponse {
    const blockTimestamp = blockInfo ? parseTimestampToMicroSeconds(blockInfo?.block?.header?.time) : '';

    const height = blockInfo?.block?.header?.height;
    return {
        type: TransactionResponseType.BlockMetadata,
        id: blockInfo?.block_id?.hash ?? '',
        version: `${10000n * BigInt(height)}`,
        hash: blockInfo?.block_id?.hash ?? '',
        state_change_hash: '',
        event_root_hash: '',
        state_checkpoint_hash: null,
        gas_used: '0',
        success: true,
        vm_status: '',
        accumulator_root_hash: '',
        changes: [],
        timestamp: blockTimestamp,
        epoch: '0',
        round: '0',
        events: [],
        previous_block_votes_bitvec: [],
        proposer: AccountAddress.ZERO.toString(),
        failed_proposer_indices: []
    };
}
