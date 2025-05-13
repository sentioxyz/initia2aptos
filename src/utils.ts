import { TxInfo } from '@initia/initia.js';
import { AccountAddress } from '@aptos-labs/ts-sdk';

/**
 * Finds the sender address from a transaction
 * @param tx The transaction info
 * @returns The sender address in hex format
 */
export function findSender(tx: TxInfo): string {
  for (const msg of tx.tx.body.messages) {
    if ("sender" in msg) {
      // remove init1 prefix
      const sender = msg.sender.replace("init1", "")
      // decode base64 to hex
      return Buffer.from(sender, 'base64').toString('hex')
    }
  }
  return AccountAddress.ZERO.toString()
}

/**
 * Converts an ISO timestamp to microseconds
 * @param timeString ISO timestamp string
 * @returns Timestamp in microseconds as a string
 */
export function parseTimestampToMicroSeconds(timeString: string): string {
  return Math.floor(Date.parse(timeString) * 1000).toString();
}
