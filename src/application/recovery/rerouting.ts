import { evaluateFeasibility } from '../../domain/feasibility.ts';
import { transitionJob } from '../../domain/state-machine.ts';
import type { Demand, DeliveryJob, Receiver, Rider, RouteSnapshot, SafetyPolicy } from '../../domain/types.ts';

export interface FallbackCandidate {
  receiver: Receiver;
  demand: Demand;
  route: RouteSnapshot;
  score: number;
}

export function findSafeFallback(input: {
  job: DeliveryJob;
  batch: Parameters<typeof evaluateFeasibility>[0]['batch'];
  rider: Rider;
  receivers: Receiver[];
  demands: Demand[];
  routes: Record<string, RouteSnapshot>;
  now: number;
  policy: SafetyPolicy;
}): FallbackCandidate[] {
  const candidates: FallbackCandidate[] = [];
  for (const demand of input.demands) {
    if (demand.receiverId === input.job.originalReceiverId) continue;
    const receiver = input.receivers.find((candidate) => candidate.id === demand.receiverId);
    if (!receiver) continue;
    const route = input.routes[`${input.rider.id}:${receiver.id}`];
    if (!route) continue;
    const result = evaluateFeasibility({
      batch: input.batch,
      demand,
      receiver,
      rider: { ...input.rider, currentLoad: Math.max(0, input.rider.currentLoad - input.job.quantity) },
      route,
      now: input.now,
      policy: input.policy,
      quantity: input.job.quantity,
    });
    if (result.feasible) candidates.push({ receiver, demand, route, score: result.score });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function rerouteJob(job: DeliveryJob, candidate: FallbackCandidate, reason: string): void {
  job.status = transitionJob(job.status, 'reroute_pending');
  job.receiverId = candidate.receiver.id;
  job.demandId = candidate.demand.id;
  job.route = candidate.route;
  job.rerouteReason = reason;
  job.status = transitionJob(job.status, 'rerouted');
}
