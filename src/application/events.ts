import type { EventRecord } from '../domain/types.ts';

export class EventLog {
  private readonly records: EventRecord[] = [];

  append(event: EventRecord): void {
    this.records.push(event);
  }

  all(): EventRecord[] {
    return this.records.map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  clear(): void {
    this.records.length = 0;
  }
}
