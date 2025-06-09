import { bech32 } from 'bech32';

export function toAptosAddress(s: string): string {
    return bech32ToHex(s);
}

function bech32ToHex(bech32Addr: string): string {
    // Decode the bech32 address
    const { words } = bech32.decode(bech32Addr);
    // Convert 5-bit words back to bytes
    const bytes = bech32.fromWords(words);
    // Convert bytes to hex string
    return '0x' + Buffer.from(bytes).toString('hex');
}

/**
 * Converts an ISO timestamp to microseconds
 * @param timeString ISO timestamp string
 * @returns Timestamp in microseconds as a string
 */
export function parseTimestampToMicroSeconds(timeString: string): string {
    return Math.floor(Date.parse(timeString) * 1000).toString();
}


export function toDurationMs(cacheDuration?: string) {
    if (cacheDuration) {
        const duration = cacheDuration.toLowerCase();
        if (duration.includes('minute')) {
            return parseInt(duration) * 60 * 1000;
        }
        if (duration.includes('hour')) {
            return parseInt(duration) * 60 * 60 * 1000;
        }
        if (duration.includes('day')) {
            return parseInt(duration) * 24 * 60 * 60 * 1000;
        }
    }
    return 0;
}