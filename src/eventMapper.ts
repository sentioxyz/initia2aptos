import { Event as InitiaEvent } from '@initia/initia.js';
import { Event } from '@aptos-labs/ts-sdk';

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
