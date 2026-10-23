import { assertBatchInvariant, assertDemandInvariant, assertRiderInvariant } from '../../domain/invariants.ts';
import { evaluateFeasibility, type FeasibilityResult } from '../../domain/feasibility.ts';
import type {
  AidBatch,
  Assignment,
  Demand,
  DeliveryJob,
  Receiver,
  Rider,
  RouteSnapshot,
  SafetyPolicy,
} from '../../domain/types.ts';

export interface PlanningInput {
  batch: AidBatch;
  demands: Demand[];
  receivers: Receiver[];
  riders: Rider[];
  routes: Record<string, RouteSnapshot>;
  now: number;
  policy: SafetyPolicy;
  nextId: (prefix: string) => string;
}

export interface PlanningResult {
  assignments: Assignment[];
  jobs: DeliveryJob[];
  blockedReasons: string[];
}

function routeKey(riderId: string, receiverId: string): string {
  return `${riderId}:${receiverId}`;
}

function priorityRank(priority: Demand['priority']): number {
  return priority === 'critical' ? 0 : priority === 'urgent' ? 1 : 2;
}

export function planSplitAssignments(input: PlanningInput): PlanningResult {
  const { batch, demands, receivers, riders, routes, now, policy, nextId } = input;
  const assignments: Assignment[] = [];
  const jobs: DeliveryJob[] = [];
  const blockedReasons: string[] = [];
  const receiverById = new Map(receivers.map((receiver) => [receiver.id, receiver]));
  const candidateRiders = riders
    .filter((rider) => rider.availability === 'online' && rider.reliability !== 'suspended')
    .sort((a, b) => b.capacity - b.currentLoad - (a.capacity - a.currentLoad));
  let remainingBatch = batch.availableQuantity;

  const demandCopies = demands
    .filter((demand) => ['open', 'constrained'].includes(demand.status))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .map((demand) => ({ ...demand }));
  const remainingRiderCapacity = new Map(candidateRiders.map((rider) => [rider.id, rider.capacity - rider.currentLoad]));

  for (const demand of demandCopies) {
    const receiver = receiverById.get(demand.receiverId);
    if (!receiver) continue;
    let remainingDemand = Math.min(demand.remainingQuantity, demand.receivingCapacity - demand.reservedQuantity);

    for (const rider of candidateRiders) {
      if (remainingBatch <= 0 || remainingDemand <= 0) break;
      const availableRiderCapacity = remainingRiderCapacity.get(rider.id) ?? 0;
      const quantity = Math.min(remainingBatch, remainingDemand, availableRiderCapacity);
      if (quantity <= 0) continue;
      const route = routes[routeKey(rider.id, receiver.id)];
      if (!route) {
        blockedReasons.push(`No route snapshot is available for ${rider.name} to ${receiver.name}.`);
        continue;
      }

      const feasibility: FeasibilityResult = evaluateFeasibility({
        batch,
        demand,
        receiver,
        rider,
        route,
        now,
        policy,
        quantity,
      });
      if (!feasibility.feasible) {
        blockedReasons.push(...feasibility.reasons);
        continue;
      }

      const jobId = nextId('job');
      assignments.push({
        id: nextId('assignment'),
        jobId,
        riderId: rider.id,
        receiverId: receiver.id,
        quantity,
        score: feasibility.score,
        reasons: ['Feasible: compatibility, capacity, dependencies, route, and safety deadline passed.'],
      });
      jobs.push({
        id: jobId,
        batchId: batch.id,
        demandId: demand.id,
        receiverId: receiver.id,
        riderId: rider.id,
        quantity,
        status: 'planned',
        route,
        safeUntil: batch.safeUntil,
        originalReceiverId: receiver.id,
      });
      remainingBatch -= quantity;
      remainingDemand -= quantity;
      remainingRiderCapacity.set(rider.id, availableRiderCapacity - quantity);
    }
  }

  return { assignments, jobs, blockedReasons: [...new Set(blockedReasons)] };
}

export function reservePlan(batch: AidBatch, demand: Demand, rider: Rider, quantity: number): void {
  batch.availableQuantity -= quantity;
  batch.reservedQuantity += quantity;
  demand.remainingQuantity -= quantity;
  demand.reservedQuantity += quantity;
  rider.currentLoad += quantity;
  assertBatchInvariant(batch);
  assertDemandInvariant(demand);
  assertRiderInvariant(rider);
}

export function releaseReservation(batch: AidBatch, demand: Demand, rider: Rider, quantity: number): void {
  batch.availableQuantity += quantity;
  batch.reservedQuantity -= quantity;
  demand.remainingQuantity += quantity;
  demand.reservedQuantity -= quantity;
  rider.currentLoad -= quantity;
  assertBatchInvariant(batch);
  assertDemandInvariant(demand);
  assertRiderInvariant(rider);
}
