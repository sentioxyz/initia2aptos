import {Event as InitiaEvent, TxInfo} from '@initia/initia.js';
import {Event, TransactionResponseType, UserTransactionResponse} from '@aptos-labs/ts-sdk';
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
  return {
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
  };
}