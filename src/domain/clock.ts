import type { TimeProvider } from './types.ts';

export class SystemClock implements TimeProvider {
  now(): number {
    return Date.now();
  }
}

export class SimulationClock implements TimeProvider {
  constructor(private currentTime: number) {}

  now(): number {
    return this.currentTime;
  }

  advanceMinutes(minutes: number): number {
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new Error('Simulation clock can only advance by a non-negative number of minutes.');
    }
    this.currentTime += minutes * 60_000;
    return this.currentTime;
  }

  set(timestamp: number): void {
    this.currentTime = timestamp;
  }
}
