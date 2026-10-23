import { describe, expect, it } from 'vitest';
import { RelayAidSimulation } from '../../src/simulation/scenarios.ts';

describe('RelayAid judge scenarios', () => {
  it.each(['split', 'ghost_reservation', 'destination_closure', 'dependency_block'] as const)('passes %s deterministically', (scenario) => {
    const simulation = new RelayAidSimulation(scenario);
    const result = simulation.runScenario(scenario);
    expect(result.passed, result.summary).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('does not create duplicate active claims for a repeated request', () => {
    const simulation = new RelayAidSimulation('ghost_reservation');
    const planned = simulation.planBatch('batch-demo');
    const job = planned.jobs[0];
    if (!job || !job.riderId) throw new Error('Expected a planned job.');
    const first = simulation.claimJob(job.id, job.riderId, 'same-request');
    const second = simulation.claimJob(job.id, job.riderId, 'same-request');
    expect(second.id).toBe(first.id);
    expect(simulation.state.claims.size).toBe(1);
  });

  it('records an explicit unsafe outcome when no fallback remains safe', () => {
    const simulation = new RelayAidSimulation('destination_closure');
    const planned = simulation.planBatch('batch-demo');
    const job = planned.jobs[0];
    if (!job || !job.riderId) throw new Error('Expected a planned job.');
    simulation.claimJob(job.id, job.riderId, 'unsafe-claim');
    simulation.advanceJobToInTransit(job.id);
    simulation.state.receivers.get('receiver-a')!.status = 'closed';
    simulation.state.receivers.get('receiver-b')!.status = 'closed';
    simulation.closeReceiver('receiver-a');
    const outcome = simulation.recoverJob(job.id);
    expect(outcome.rerouted).toBe(false);
    expect(simulation.state.jobs.get(job.id)?.status).toBe('unsafe');
  });
});
