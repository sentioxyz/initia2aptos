

export function toAptosAddress(s: string): string {
    const sender = s.replace("init1", "")
    // decode base64 to hex
    return Buffer.from(sender, 'base64').toString('hex')
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