import { EventLog } from '../application/events.ts';
import { planSplitAssignments, releaseReservation, reservePlan } from '../application/dispatch/planning.ts';
import { checkInClaim, createClaim, expireClaim } from '../application/recovery/claims.ts';
import { findSafeFallback, rerouteJob } from '../application/recovery/rerouting.ts';
import { SimulationClock } from '../domain/clock.ts';
import { evaluateFeasibility } from '../domain/feasibility.ts';
import { assertDemandInvariant } from '../domain/invariants.ts';
import { transitionJob } from '../domain/state-machine.ts';
import { DEFAULT_SAFETY_POLICY, type AidBatch, type Claim, type Demand, type DeliveryJob, type EventRecord, type Receiver, type Rider, type RouteSnapshot, type SafetyPolicy } from '../domain/types.ts';

export type ScenarioName = 'split' | 'ghost_reservation' | 'destination_closure' | 'dependency_block';

export interface SimulationState {
  batches: Map<string, AidBatch>;
  demands: Map<string, Demand>;
  receivers: Map<string, Receiver>;
  riders: Map<string, Rider>;
  jobs: Map<string, DeliveryJob>;
  claims: Map<string, Claim>;
  routes: Record<string, RouteSnapshot>;
}

export interface ScenarioResult {
  name: ScenarioName;
  passed: boolean;
  summary: string;
  checks: { label: string; passed: boolean; detail: string }[];
}

const START_TIME = Date.parse('2026-10-23T10:00:00Z');

function location(label: string, latitude: number, longitude: number) {
  return { label, latitude, longitude };
}

function route(distanceKm: number, travelMinutes: number, blocked = false, restrictionReason?: string): RouteSnapshot {
  return { distanceKm, pickupMinutes: 5, travelMinutes, blocked, restrictionReason };
}

function baseRider(id: string, name: string, capacity: number): Rider {
  return {
    id, name, location: location(`${name} position`, 1, 1), capacity, currentLoad: 0,
    storageRequirements: [], availability: 'online', reliability: 'healthy', lastCheckInAt: START_TIME,
  };
}

function seedScenario(name: ScenarioName): SimulationState {
  const batch: AidBatch = {
    id: 'batch-demo', donorName: 'Community Kitchen', aidType: name === 'dependency_block' ? 'ration_kit' : 'cooked_food',
    quantity: name === 'split' ? 180 : 40, availableQuantity: name === 'split' ? 180 : 40, reservedQuantity: 0,
    deliveredQuantity: 0, pickupLocation: location('Central aid hub', 1, 1), availableFrom: START_TIME - 60_000,
    safeUntil: START_TIME + (name === 'split' ? 75 : 90) * 60_000, status: 'published',
  };
  const shelterA: Receiver = {
    id: 'receiver-a', name: 'Shelter A', location: location('Shelter A', 2, 2), operatingUntil: START_TIME + 180 * 60_000,
    status: 'open', dependencies: [], acceptedAidTypes: ['cooked_food', 'ration_kit'],
  };
  const shelterB: Receiver = {
    id: 'receiver-b', name: 'Shelter B', location: location('Shelter B', 3, 3), operatingUntil: START_TIME + 180 * 60_000,
    status: 'open', dependencies: [], acceptedAidTypes: ['cooked_food', 'ration_kit'],
  };
  const demandA: Demand = {
    id: 'demand-a', receiverId: 'receiver-a', aidType: batch.aidType, acceptableSubstitutions: [],
    requestedQuantity: name === 'split' ? 50 : 40, remainingQuantity: name === 'split' ? 50 : 40, reservedQuantity: 0,
    receivingCapacity: name === 'split' ? 50 : 40, priority: 'urgent', status: 'open', dependencies: [],
  };
  const demandB: Demand = {
    id: 'demand-b', receiverId: 'receiver-b', aidType: batch.aidType, acceptableSubstitutions: [],
    requestedQuantity: name === 'split' ? 130 : 60, remainingQuantity: name === 'split' ? 130 : 60, reservedQuantity: 0,
    receivingCapacity: name === 'split' ? 130 : 60, priority: 'routine', status: 'open', dependencies: [],
  };
  if (name === 'dependency_block') {
    shelterA.dependencies = [{ kind: 'cooking_fuel', label: 'Cooking fuel', satisfied: false }];
    shelterB.dependencies = [{ kind: 'cooking_fuel', label: 'Cooking fuel', satisfied: false }];
    demandA.dependencies = [{ kind: 'cooking_fuel', label: 'Cooking fuel', satisfied: false }];
    demandB.dependencies = [{ kind: 'cooking_fuel', label: 'Cooking fuel', satisfied: false }];
  }
  const riders = name === 'split'
    ? [baseRider('rider-1', 'Alex', 40), baseRider('rider-2', 'Bea', 40), baseRider('rider-3', 'Casey', 60), baseRider('rider-4', 'Dev', 60)]
    : [baseRider('rider-1', 'Alex', 40), baseRider('rider-2', 'Bea', 40)];
  const routes: Record<string, RouteSnapshot> = {};
  for (const rider of riders) {
    routes[`${rider.id}:receiver-a`] = route(3, 15);
    routes[`${rider.id}:receiver-b`] = route(4, 20);
  }
  return {
    batches: new Map([[batch.id, batch]]),
    demands: new Map([[demandA.id, demandA], [demandB.id, demandB]]),
    receivers: new Map([[shelterA.id, shelterA], [shelterB.id, shelterB]]),
    riders: new Map(riders.map((rider) => [rider.id, rider])),
    jobs: new Map(), claims: new Map(), routes,
  };
}

export class RelayAidSimulation {
  readonly clock: SimulationClock;
  readonly policy: SafetyPolicy;
  readonly events = new EventLog();
  private readonly idCounters = new Map<string, number>();
  private requestClaims = new Map<string, string>();
  state: SimulationState;

  constructor(name: ScenarioName = 'split', startTime = START_TIME, policy: SafetyPolicy = DEFAULT_SAFETY_POLICY) {
    this.clock = new SimulationClock(startTime);
    this.policy = policy;
    this.state = seedScenario(name);
  }

  reset(name: ScenarioName): void {
    this.clock.set(START_TIME);
    this.idCounters.clear();
    this.requestClaims.clear();
    this.events.clear();
    this.state = seedScenario(name);
  }

  private nextId(prefix: string): string {
    const next = (this.idCounters.get(prefix) ?? 0) + 1;
    this.idCounters.set(prefix, next);
    return `${prefix}-${next}`;
  }

  private record(type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, actorId = 'simulation'): void {
    const event: EventRecord = {
      eventId: this.nextId('event'), type, occurredAt: this.clock.now(), actorId,
      aggregateType, aggregateId, payload, correlationId: 'simulation-run',
    };
    this.events.append(event);
  }

  planBatch(batchId: string): { jobs: DeliveryJob[]; blockedReasons: string[] } {
    const batch = this.state.batches.get(batchId);
    if (!batch) throw new Error(`Unknown batch ${batchId}.`);
    const result = planSplitAssignments({
      batch,
      demands: [...this.state.demands.values()],
      receivers: [...this.state.receivers.values()],
      riders: [...this.state.riders.values()],
      routes: this.state.routes,
      now: this.clock.now(), policy: this.policy, nextId: (prefix) => this.nextId(prefix),
    });
    for (const job of result.jobs) {
      const demand = this.state.demands.get(job.demandId);
      const rider = this.state.riders.get(job.riderId ?? '');
      if (!demand || !rider) throw new Error('Planner produced a job with missing references.');
      reservePlan(batch, demand, rider, job.quantity);
      this.state.jobs.set(job.id, job);
      this.record('assignment.proposed', 'job', job.id, { quantity: job.quantity, receiverId: job.receiverId, riderId: rider.id });
      this.record('job.created', 'job', job.id, { quantity: job.quantity, batchId: batch.id });
    }
    batch.status = result.jobs.length === 0 ? batch.status : batch.availableQuantity === 0 ? 'fully_allocated' : 'partially_allocated';
    this.record('matching.completed', 'batch', batch.id, { jobsCreated: result.jobs.length, blockedReasons: result.blockedReasons });
    return { jobs: result.jobs, blockedReasons: result.blockedReasons };
  }

  claimJob(jobId: string, riderId: string, requestId = this.nextId('request')): Claim {
    const existingClaimId = this.requestClaims.get(requestId);
    if (existingClaimId) {
      const existing = this.state.claims.get(existingClaimId);
      if (!existing) throw new Error('Idempotency record points to a missing claim.');
      return existing;
    }
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}.`);
    if ([...this.state.claims.values()].some((claim) => claim.jobId === jobId && ['held', 'confirmed'].includes(claim.status))) {
      throw new Error('Job already has an active claim.');
    }
    const claim = createClaim({ job, riderId, now: this.clock.now(), policy: this.policy, nextId: (prefix) => this.nextId(prefix) });
    this.state.claims.set(claim.id, claim);
    this.requestClaims.set(requestId, claim.id);
    this.record('claim.created', 'claim', claim.id, { jobId, riderId, expiresAt: claim.expiresAt }, riderId);
    return claim;
  }

  checkIn(claimId: string): void {
    const claim = this.state.claims.get(claimId);
    if (!claim) throw new Error(`Unknown claim ${claimId}.`);
    checkInClaim(claim, this.clock.now(), this.policy);
    this.record('claim.checked_in', 'claim', claim.id, { checkInDueAt: claim.checkInDueAt }, claim.riderId);
  }

  advanceClock(minutes: number): void {
    this.clock.advanceMinutes(minutes);
    for (const claim of this.state.claims.values()) {
      if (!['held', 'confirmed'].includes(claim.status)) continue;
      const due = claim.checkInDueAt + this.policy.releaseGraceMinutes * 60_000;
      if (this.clock.now() <= due && this.clock.now() <= claim.expiresAt) continue;
      const job = this.state.jobs.get(claim.jobId);
      const batch = job ? this.state.batches.get(job.batchId) : undefined;
      const demand = job ? this.state.demands.get(job.demandId) : undefined;
      const rider = this.state.riders.get(claim.riderId);
      if (!job || !batch || !demand || !rider) continue;
      expireClaim(claim, job, 'Rider missed the required check-in deadline.');
      releaseReservation(batch, demand, rider, job.quantity);
      this.record('claim.expired', 'claim', claim.id, { reason: claim.releaseReason }, 'system');
      this.record('claim.released', 'claim', claim.id, { jobId: job.id, reason: claim.releaseReason }, 'system');
      this.reassignReleasedJob(job, claim.riderId);
    }
  }

  private reassignReleasedJob(job: DeliveryJob, previousRiderId: string): void {
    const batch = this.state.batches.get(job.batchId);
    const demand = this.state.demands.get(job.demandId);
    if (!batch || !demand) return;
    const receiver = this.state.receivers.get(job.receiverId);
    if (!receiver) return;
    const candidates = [...this.state.riders.values()]
      .filter((rider) => rider.id !== previousRiderId && rider.availability === 'online' && rider.reliability !== 'suspended')
      .map((rider) => {
        const route = this.state.routes[`${rider.id}:${receiver.id}`];
        if (!route) return undefined;
        const result = evaluateFeasibility({ batch, demand, receiver, rider, route, now: this.clock.now(), policy: this.policy, quantity: job.quantity });
        return result.feasible ? { rider, route, score: result.score } : undefined;
      })
      .filter((candidate): candidate is { rider: Rider; route: RouteSnapshot; score: number } => Boolean(candidate))
      .sort((a, b) => b.score - a.score);
    const next = candidates[0];
    if (!next) {
      job.status = transitionJob(job.status, 'unsafe');
      batch.status = 'unsafe';
      this.record('job.marked_unsafe', 'job', job.id, { reason: 'No safe rider remained after claim release.' }, 'system');
      return;
    }
    reservePlan(batch, demand, next.rider, job.quantity);
    job.riderId = next.rider.id;
    job.route = next.route;
    this.record('assignment.proposed', 'job', job.id, { riderId: next.rider.id, reason: 'Automatic reassignment after claim expiry.' }, 'system');
  }

  advanceJobToInTransit(jobId: string): void {
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}.`);
    for (const nextStatus of ['en_route_pickup', 'at_pickup', 'picked_up', 'in_transit'] as const) {
      job.status = transitionJob(job.status, nextStatus);
      this.record(`job.${nextStatus}`, 'job', job.id, { receiverId: job.receiverId }, job.riderId ?? 'dispatcher');
    }
  }

  closeReceiver(receiverId: string): void {
    const receiver = this.state.receivers.get(receiverId);
    if (!receiver) throw new Error(`Unknown receiver ${receiverId}.`);
    receiver.status = 'closed';
    for (const demand of this.state.demands.values()) if (demand.receiverId === receiverId) demand.status = 'closed';
    this.record('demand.closed', 'receiver', receiverId, { reason: 'Receiver closed during simulation.' }, 'dispatcher');
    for (const job of this.state.jobs.values()) {
      if (job.receiverId !== receiverId || job.status !== 'in_transit') continue;
      job.status = transitionJob(job.status, 'destination_at_risk');
      this.record('job.destination_at_risk', 'job', job.id, { originalReceiverId: receiverId }, 'system');
    }
  }

  recoverJob(jobId: string): { rerouted: boolean; explanation: string } {
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}.`);
    if (job.status !== 'destination_at_risk') throw new Error('Only at-risk jobs can be recovered.');
    const batch = this.state.batches.get(job.batchId);
    const demand = this.state.demands.get(job.demandId);
    const rider = this.state.riders.get(job.riderId ?? '');
    if (!batch || !demand || !rider) throw new Error('Job references are incomplete.');
    const candidates = findSafeFallback({
      job,
      batch: { ...batch, availableQuantity: job.quantity, reservedQuantity: Math.max(0, batch.reservedQuantity - job.quantity) },
      rider,
      receivers: [...this.state.receivers.values()], demands: [...this.state.demands.values()], routes: this.state.routes,
      now: this.clock.now(), policy: this.policy,
    });
    const next = candidates[0];
    if (!next) {
      job.status = transitionJob(job.status, 'unsafe');
      this.record('job.marked_unsafe', 'job', job.id, { reason: 'No safe fallback receiver found.' }, 'system');
      return { rerouted: false, explanation: 'No safe fallback receiver found; job escalated as unsafe.' };
    }
    demand.reservedQuantity -= job.quantity;
    next.demand.remainingQuantity -= job.quantity;
    next.demand.reservedQuantity += job.quantity;
    assertDemandInvariant(demand);
    assertDemandInvariant(next.demand);
    rerouteJob(job, next, 'Original destination closed while shipment was in transit.');
    this.record('job.reroute_proposed', 'job', job.id, { from: job.originalReceiverId, to: next.receiver.id }, 'system');
    this.record('job.rerouted', 'job', job.id, { receiverId: next.receiver.id, demandId: next.demand.id }, 'system');
    return { rerouted: true, explanation: `Destination closed in transit. Safe fallback selected: ${next.receiver.name}.` };
  }

  eventsForDisplay(): EventRecord[] {
    return this.events.all().sort((a, b) => b.occurredAt - a.occurredAt);
  }

  runScenario(name: ScenarioName): ScenarioResult {
    this.reset(name);
    const checks: ScenarioResult['checks'] = [];
    if (name === 'split') {
      const result = this.planBatch('batch-demo');
      const jobs = [...this.state.jobs.values()];
      checks.push({ label: 'At least two legs created', passed: jobs.length >= 2, detail: `${jobs.length} legs created.` });
      checks.push({ label: 'No rider exceeds capacity', passed: [...this.state.riders.values()].every((rider) => rider.currentLoad <= rider.capacity), detail: 'Rider loads checked.' });
      checks.push({ label: 'Shelter A receives no more than 50 meals', passed: jobs.filter((job) => job.receiverId === 'receiver-a').reduce((sum, job) => sum + job.quantity, 0) <= 50, detail: 'Receiver allocation checked.' });
      checks.push({ label: 'Remaining quantity is visible', passed: this.state.batches.get('batch-demo')?.availableQuantity === 0, detail: `${this.state.batches.get('batch-demo')?.availableQuantity ?? 0} unallocated.` });
      return { name, passed: checks.every((check) => check.passed), summary: result.blockedReasons.join(' ') || 'Batch split across feasible rider legs.', checks };
    }
    if (name === 'dependency_block') {
      const blocked = this.planBatch('batch-demo');
      const hasDependencyReason = blocked.blockedReasons.some((reason) => reason.includes('Cooking fuel'));
      checks.push({ label: 'No dependency-blocked job is created', passed: blocked.jobs.length === 0, detail: `${blocked.jobs.length} jobs created.` });
      checks.push({ label: 'Missing dependency is named', passed: hasDependencyReason, detail: blocked.blockedReasons.join(' ') });
      return { name, passed: checks.every((check) => check.passed), summary: blocked.blockedReasons.join(' '), checks };
    }
    const planned = this.planBatch('batch-demo');
    const first = planned.jobs[0];
    if (!first) return { name, passed: false, summary: planned.blockedReasons.join(' '), checks: [{ label: 'A job was planned', passed: false, detail: 'No feasible job was created.' }] };
    if (name === 'ghost_reservation') {
      const claim = this.claimJob(first.id, first.riderId ?? '', 'ghost-claim');
      this.advanceClock(7);
      const released = this.state.claims.get(claim.id)?.status === 'expired';
      const reassigned = Boolean(this.state.jobs.get(first.id)?.riderId && this.state.jobs.get(first.id)?.riderId !== claim.riderId);
      checks.push({ label: 'Claim expires once', passed: released, detail: `Claim status: ${this.state.claims.get(claim.id)?.status}.` });
      checks.push({ label: 'Job is reassigned safely', passed: reassigned, detail: `New rider: ${this.state.jobs.get(first.id)?.riderId ?? 'none'}.` });
      return { name, passed: checks.every((check) => check.passed), summary: 'Silent rider reservation released and safely re-matched.', checks };
    }
    if (name === 'destination_closure') {
      this.claimJob(first.id, first.riderId ?? '', 'destination-claim');
      this.advanceJobToInTransit(first.id);
      this.closeReceiver('receiver-a');
      const recovery = this.recoverJob(first.id);
      checks.push({ label: 'In-transit job becomes at risk', passed: this.eventsForDisplay().some((event) => event.type === 'job.destination_at_risk'), detail: 'Risk event recorded.' });
      checks.push({ label: 'Safe fallback is selected', passed: recovery.rerouted, detail: recovery.explanation });
      return { name, passed: checks.every((check) => check.passed), summary: recovery.explanation, checks };
    }
    throw new Error(`Unhandled scenario ${name}.`);
  }
}

export { START_TIME };
