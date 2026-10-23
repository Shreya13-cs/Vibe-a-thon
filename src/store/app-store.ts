import { EventLog } from '../application/events.ts';
import { planSplitAssignments, releaseReservation, reservePlan } from '../application/dispatch/planning.ts';
import { checkInClaim, createClaim, expireClaim } from '../application/recovery/claims.ts';
import { findSafeFallback, rerouteJob } from '../application/recovery/rerouting.ts';
import { SystemClock } from '../domain/clock.ts';
import { evaluateFeasibility } from '../domain/feasibility.ts';
import { assertDemandInvariant } from '../domain/invariants.ts';
import { transitionJob } from '../domain/state-machine.ts';
import {
  DEFAULT_SAFETY_POLICY,
  type AidBatch,
  type AidType,
  type Claim,
  type Demand,
  type DeliveryJob,
  type EventRecord,
  type Receiver,
  type Rider,
  type RouteSnapshot,
  type SafetyPolicy,
} from '../domain/types.ts';

export type UserRole = 'donor' | 'receiver' | 'rider' | 'dispatcher';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface AppState {
  currentUser: AppUser | null;
  batches: Map<string, AidBatch>;
  demands: Map<string, Demand>;
  receivers: Map<string, Receiver>;
  riders: Map<string, Rider>;
  jobs: Map<string, DeliveryJob>;
  claims: Map<string, Claim>;
  routes: Record<string, RouteSnapshot>;
}

const STORAGE_KEY = 'relayaid_state_v1';

function mapsToJson(state: AppState): object {
  return {
    currentUser: state.currentUser,
    batches: [...state.batches.entries()],
    demands: [...state.demands.entries()],
    receivers: [...state.receivers.entries()],
    riders: [...state.riders.entries()],
    jobs: [...state.jobs.entries()],
    claims: [...state.claims.entries()],
    routes: state.routes,
  };
}

function jsonToMaps(raw: ReturnType<typeof mapsToJson>): AppState {
  const r = raw as Record<string, unknown>;
  return {
    currentUser: (r.currentUser as AppUser | null) ?? null,
    batches: new Map(r.batches as [string, AidBatch][]),
    demands: new Map(r.demands as [string, Demand][]),
    receivers: new Map(r.receivers as [string, Receiver][]),
    riders: new Map(r.riders as [string, Rider][]),
    jobs: new Map(r.jobs as [string, DeliveryJob][]),
    claims: new Map(r.claims as [string, Claim][]),
    routes: r.routes as Record<string, RouteSnapshot>,
  };
}

export class AppStore {
  readonly clock: SystemClock = new SystemClock();
  readonly policy: SafetyPolicy = DEFAULT_SAFETY_POLICY;
  readonly events: EventLog = new EventLog();
  private idCounters = new Map<string, number>();
  private requestClaims = new Map<string, string>();
  private listeners: Array<() => void> = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  state: AppState;

  constructor() {
    this.state = this.loadState();
    this.startClaimExpiryTimer();
  }

  // ── Subscriptions ────────────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  private notify(): void {
    this.persist();
    for (const fn of this.listeners) fn();
  }

  // ── Persistence ──────────────────────────────────────────────
  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mapsToJson(this.state)));
    } catch {
      // storage quota exceeded — ignore
    }
  }

  private loadState(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return jsonToMaps(JSON.parse(raw));
    } catch {
      // corrupt data — start fresh
    }
    return this.emptyState();
  }

  private emptyState(): AppState {
    return {
      currentUser: null,
      batches: new Map(),
      demands: new Map(),
      receivers: new Map(),
      riders: new Map(),
      jobs: new Map(),
      claims: new Map(),
      routes: {},
    };
  }

  clearAll(): void {
    this.idCounters.clear();
    this.requestClaims.clear();
    this.events.clear();
    const user = this.state.currentUser;
    this.state = this.emptyState();
    this.state.currentUser = user;
    this.notify();
  }

  // ── ID Generation ─────────────────────────────────────────────
  nextId(prefix: string): string {
    const n = (this.idCounters.get(prefix) ?? 0) + 1;
    this.idCounters.set(prefix, n);
    return `${prefix}-${n}`;
  }

  // ── Events ────────────────────────────────────────────────────
  private record(
    type: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    actorId?: string,
  ): void {
    const event: EventRecord = {
      eventId: this.nextId('event'),
      type,
      occurredAt: this.clock.now(),
      actorId: actorId ?? this.state.currentUser?.id ?? 'system',
      aggregateType,
      aggregateId,
      payload,
      correlationId: 'user-action',
    };
    this.events.append(event);
  }

  eventsForDisplay(): EventRecord[] {
    return this.events.all().sort((a, b) => b.occurredAt - a.occurredAt);
  }

  // ── Auth / Role ───────────────────────────────────────────────
  login(user: AppUser): void {
    this.state.currentUser = user;
    this.notify();
  }

  logout(): void {
    this.state.currentUser = null;
    this.notify();
  }

  // ── Donor: Create Batch ───────────────────────────────────────
  createBatch(input: {
    donorName: string;
    aidType: AidType;
    quantity: number;
    pickupLabel: string;
    availableFromISO: string;
    safeUntilISO: string;
    handlingNotes?: string;
    requiredStorage?: string;
  }): AidBatch {
    const now = this.clock.now();
    const safeUntil = new Date(input.safeUntilISO).getTime();
    const availableFrom = new Date(input.availableFromISO).getTime();
    if (safeUntil <= now) throw new Error('Safe-until time must be in the future.');
    if (input.quantity <= 0) throw new Error('Quantity must be positive.');
    if (!input.pickupLabel.trim()) throw new Error('Pickup location is required.');

    const batch: AidBatch = {
      id: this.nextId('batch'),
      donorName: input.donorName,
      aidType: input.aidType,
      quantity: input.quantity,
      availableQuantity: input.quantity,
      reservedQuantity: 0,
      deliveredQuantity: 0,
      pickupLocation: { label: input.pickupLabel, latitude: 0, longitude: 0 },
      availableFrom,
      safeUntil,
      handlingNotes: input.handlingNotes,
      requiredStorage: input.requiredStorage,
      status: 'published',
    };
    this.state.batches.set(batch.id, batch);
    this.record('batch.created', 'batch', batch.id, { quantity: batch.quantity, aidType: batch.aidType });
    this.runMatching();
    this.notify();
    return batch;
  }

  // ── Receiver: Register & Publish Demand ──────────────────────
  registerReceiver(input: {
    name: string;
    locationLabel: string;
    acceptedAidTypes: AidType[];
    operatingHoursHours: number;
    dependencies: Array<{ kind: string; label: string }>;
  }): Receiver {
    const now = this.clock.now();
    const receiver: Receiver = {
      id: this.nextId('receiver'),
      name: input.name,
      location: { label: input.locationLabel, latitude: 0, longitude: 0 },
      operatingUntil: now + input.operatingHoursHours * 3_600_000,
      status: 'open',
      dependencies: input.dependencies.map((d) => ({ kind: d.kind as never, label: d.label, satisfied: false })),
      acceptedAidTypes: input.acceptedAidTypes,
    };
    this.state.receivers.set(receiver.id, receiver);
    // Generate routes to all existing riders
    for (const rider of this.state.riders.values()) {
      this.addRoute(rider.id, receiver.id);
    }
    this.record('receiver.registered', 'receiver', receiver.id, { name: receiver.name });
    this.notify();
    return receiver;
  }

  publishDemand(input: {
    receiverId: string;
    aidType: AidType;
    requestedQuantity: number;
    receivingCapacity: number;
    priority: 'routine' | 'urgent' | 'critical';
    dependencies: Array<{ kind: string; label: string }>;
  }): Demand {
    const receiver = this.state.receivers.get(input.receiverId);
    if (!receiver) throw new Error('Receiver not found.');
    if (input.requestedQuantity <= 0) throw new Error('Quantity must be positive.');
    if (receiver.status !== 'open') throw new Error('Receiver is not open.');

    const demand: Demand = {
      id: this.nextId('demand'),
      receiverId: input.receiverId,
      aidType: input.aidType,
      acceptableSubstitutions: [],
      requestedQuantity: input.requestedQuantity,
      remainingQuantity: input.requestedQuantity,
      reservedQuantity: 0,
      receivingCapacity: input.receivingCapacity,
      priority: input.priority,
      status: 'open',
      dependencies: input.dependencies.map((d) => ({ kind: d.kind as never, label: d.label, satisfied: false })),
    };
    this.state.demands.set(demand.id, demand);
    this.record('demand.published', 'demand', demand.id, { receiverId: input.receiverId, quantity: demand.requestedQuantity });
    this.runMatching();
    this.notify();
    return demand;
  }

  fulfillDemand(demandId: string): void {
    const demand = this.state.demands.get(demandId);
    if (!demand) throw new Error('Demand not found.');
    demand.status = 'fulfilled';
    // Mark in-transit jobs going to this receiver as at-risk
    for (const job of this.state.jobs.values()) {
      if (job.receiverId !== demand.receiverId || job.status !== 'in_transit') continue;
      job.status = transitionJob(job.status, 'destination_at_risk');
      this.record('job.destination_at_risk', 'job', job.id, { reason: 'Demand marked fulfilled while in transit.' });
    }
    this.record('demand.fulfilled', 'demand', demandId, {});
    this.notify();
  }

  closeDemand(demandId: string): void {
    const demand = this.state.demands.get(demandId);
    if (!demand) throw new Error('Demand not found.');
    demand.status = 'closed';
    const receiver = this.state.receivers.get(demand.receiverId);
    if (receiver) receiver.status = 'closed';
    for (const job of this.state.jobs.values()) {
      if (job.receiverId !== demand.receiverId || job.status !== 'in_transit') continue;
      job.status = transitionJob(job.status, 'destination_at_risk');
      this.record('job.destination_at_risk', 'job', job.id, { reason: 'Receiver closed while in transit.' });
    }
    this.record('demand.closed', 'demand', demandId, {});
    this.notify();
  }

  satisfyDependency(receiverId: string, dependencyKind: string): void {
    const receiver = this.state.receivers.get(receiverId);
    if (!receiver) throw new Error('Receiver not found.');
    for (const dep of receiver.dependencies) {
      if (dep.kind === dependencyKind) dep.satisfied = true;
    }
    for (const demand of this.state.demands.values()) {
      if (demand.receiverId !== receiverId) continue;
      for (const dep of demand.dependencies) {
        if (dep.kind === dependencyKind) dep.satisfied = true;
      }
    }
    this.record('receiver.dependency_satisfied', 'receiver', receiverId, { kind: dependencyKind });
    this.runMatching();
    this.notify();
  }

  // ── Rider: Register & Go Online ───────────────────────────────
  registerRider(input: {
    name: string;
    locationLabel: string;
    capacity: number;
    storageRequirements: string[];
  }): Rider {
    const rider: Rider = {
      id: this.nextId('rider'),
      name: input.name,
      location: { label: input.locationLabel, latitude: 0, longitude: 0 },
      capacity: input.capacity,
      currentLoad: 0,
      storageRequirements: input.storageRequirements,
      availability: 'online',
      reliability: 'healthy',
      lastCheckInAt: this.clock.now(),
    };
    this.state.riders.set(rider.id, rider);
    // Generate routes to all existing receivers
    for (const receiver of this.state.receivers.values()) {
      this.addRoute(rider.id, receiver.id);
    }
    this.record('rider.registered', 'rider', rider.id, { name: rider.name, capacity: rider.capacity });
    this.runMatching();
    this.notify();
    return rider;
  }

  setRiderAvailability(riderId: string, availability: 'online' | 'offline' | 'paused'): void {
    const rider = this.state.riders.get(riderId);
    if (!rider) throw new Error('Rider not found.');
    rider.availability = availability;
    rider.lastCheckInAt = this.clock.now();
    this.record('rider.availability_changed', 'rider', riderId, { availability });
    if (availability === 'online') this.runMatching();
    this.notify();
  }

  private addRoute(riderId: string, receiverId: string): void {
    const key = `${riderId}:${receiverId}`;
    if (this.state.routes[key]) return;
    const distanceKm = Math.round(2 + Math.random() * 8);
    const travelMinutes = Math.round(distanceKm * 3 + Math.random() * 5);
    this.state.routes[key] = { distanceKm, pickupMinutes: 5, travelMinutes, blocked: false };
  }

  // ── Rider: Claim a Job ────────────────────────────────────────
  claimJob(jobId: string, riderId: string, requestId?: string): Claim {
    const effectiveRequestId = requestId ?? `req-${jobId}-${riderId}`;
    const existing = this.requestClaims.get(effectiveRequestId);
    if (existing) {
      const claim = this.state.claims.get(existing);
      if (!claim) throw new Error('Idempotency record points to missing claim.');
      return claim;
    }
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error('Job not found.');
    const alreadyClaimed = [...this.state.claims.values()].some(
      (c) => c.jobId === jobId && ['held', 'confirmed'].includes(c.status),
    );
    if (alreadyClaimed) throw new Error('Job already has an active claim.');

    const claim = createClaim({
      job,
      riderId,
      now: this.clock.now(),
      policy: this.policy,
      nextId: (p) => this.nextId(p),
    });
    this.state.claims.set(claim.id, claim);
    this.requestClaims.set(effectiveRequestId, claim.id);
    this.record('claim.created', 'claim', claim.id, { jobId, riderId, expiresAt: claim.expiresAt }, riderId);
    this.notify();
    return claim;
  }

  checkIn(claimId: string): void {
    const claim = this.state.claims.get(claimId);
    if (!claim) throw new Error('Claim not found.');
    checkInClaim(claim, this.clock.now(), this.policy);
    const rider = this.state.riders.get(claim.riderId);
    if (rider) rider.lastCheckInAt = this.clock.now();
    this.record('claim.checked_in', 'claim', claim.id, { checkInDueAt: claim.checkInDueAt }, claim.riderId);
    this.notify();
  }

  // ── Rider: Advance Job State ──────────────────────────────────
  advanceJobState(
    jobId: string,
    toStatus: 'en_route_pickup' | 'at_pickup' | 'picked_up' | 'in_transit' | 'arrived' | 'accepted',
  ): void {
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error('Job not found.');
    job.status = transitionJob(job.status, toStatus);
    this.record(`job.${toStatus}`, 'job', job.id, { receiverId: job.receiverId }, job.riderId ?? 'dispatcher');
    this.notify();
  }

  reportJobFailure(jobId: string, reason: string): void {
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error('Job not found.');
    job.status = transitionJob(job.status, 'failed');
    this.record('job.failed', 'job', job.id, { reason }, job.riderId ?? 'rider');
    // release reservation
    const batch = this.state.batches.get(job.batchId);
    const demand = this.state.demands.get(job.demandId);
    const rider = job.riderId ? this.state.riders.get(job.riderId) : undefined;
    if (batch && demand && rider) releaseReservation(batch, demand, rider, job.quantity);
    this.notify();
  }

  // ── Recovery: Reroute At-Risk Job ─────────────────────────────
  recoverJob(jobId: string): { rerouted: boolean; explanation: string } {
    const job = this.state.jobs.get(jobId);
    if (!job) throw new Error('Job not found.');
    if (job.status !== 'destination_at_risk') throw new Error('Only at-risk jobs can be recovered.');
    const batch = this.state.batches.get(job.batchId);
    const demand = this.state.demands.get(job.demandId);
    const rider = this.state.riders.get(job.riderId ?? '');
    if (!batch || !demand || !rider) throw new Error('Job references incomplete.');

    const candidates = findSafeFallback({
      job,
      batch: { ...batch, availableQuantity: job.quantity, reservedQuantity: Math.max(0, batch.reservedQuantity - job.quantity) },
      rider,
      receivers: [...this.state.receivers.values()],
      demands: [...this.state.demands.values()],
      routes: this.state.routes,
      now: this.clock.now(),
      policy: this.policy,
    });
    const next = candidates[0];
    if (!next) {
      job.status = transitionJob(job.status, 'unsafe');
      this.record('job.marked_unsafe', 'job', job.id, { reason: 'No safe fallback found.' });
      this.notify();
      return { rerouted: false, explanation: 'No safe fallback receiver found; job escalated as unsafe.' };
    }
    demand.reservedQuantity -= job.quantity;
    next.demand.remainingQuantity -= job.quantity;
    next.demand.reservedQuantity += job.quantity;
    assertDemandInvariant(demand);
    assertDemandInvariant(next.demand);
    rerouteJob(job, next, 'Original destination closed/fulfilled while in transit.');
    this.record('job.rerouted', 'job', job.id, { to: next.receiver.id });
    this.notify();
    return { rerouted: true, explanation: `Safe fallback selected: ${next.receiver.name}.` };
  }

  // ── Dispatcher: Force-close a receiver ───────────────────────
  closeReceiver(receiverId: string): void {
    const receiver = this.state.receivers.get(receiverId);
    if (!receiver) throw new Error('Receiver not found.');
    receiver.status = 'closed';
    for (const demand of this.state.demands.values()) {
      if (demand.receiverId === receiverId) demand.status = 'closed';
    }
    for (const job of this.state.jobs.values()) {
      if (job.receiverId !== receiverId || job.status !== 'in_transit') continue;
      job.status = transitionJob(job.status, 'destination_at_risk');
      this.record('job.destination_at_risk', 'job', job.id, { reason: 'Dispatcher closed receiver.' });
    }
    this.record('receiver.closed', 'receiver', receiverId, {});
    this.notify();
  }

  // ── Matching Engine ───────────────────────────────────────────
  runMatching(): void {
    const now = this.clock.now();
    for (const batch of this.state.batches.values()) {
      if (!['published', 'partially_allocated'].includes(batch.status)) continue;
      if (batch.availableQuantity <= 0) continue;
      if (batch.safeUntil <= now) {
        batch.status = 'expired';
        this.record('batch.expired', 'batch', batch.id, {});
        continue;
      }

      const result = planSplitAssignments({
        batch,
        demands: [...this.state.demands.values()],
        receivers: [...this.state.receivers.values()],
        riders: [...this.state.riders.values()],
        routes: this.state.routes,
        now,
        policy: this.policy,
        nextId: (p) => this.nextId(p),
      });
      for (const job of result.jobs) {
        const demand = this.state.demands.get(job.demandId);
        const rider = this.state.riders.get(job.riderId ?? '');
        if (!demand || !rider) continue;
        reservePlan(batch, demand, rider, job.quantity);
        this.state.jobs.set(job.id, job);
        this.record('assignment.proposed', 'job', job.id, { quantity: job.quantity, riderId: rider.id, receiverId: job.receiverId });
      }
      batch.status = batch.availableQuantity === 0 ? 'fully_allocated' : batch.reservedQuantity > 0 ? 'partially_allocated' : 'published';
    }
  }

  // ── Claim Expiry Ticker ────────────────────────────────────────
  private startClaimExpiryTimer(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this.tickExpiry(), 10_000); // every 10s
  }

  tickExpiry(): void {
    const now = this.clock.now();
    let changed = false;
    for (const claim of this.state.claims.values()) {
      if (!['held', 'confirmed'].includes(claim.status)) continue;
      const graceDue = claim.checkInDueAt + this.policy.releaseGraceMinutes * 60_000;
      if (now <= graceDue && now <= claim.expiresAt) continue;
      const job = this.state.jobs.get(claim.jobId);
      const batch = job ? this.state.batches.get(job.batchId) : undefined;
      const demand = job ? this.state.demands.get(job.demandId) : undefined;
      const rider = this.state.riders.get(claim.riderId);
      if (!job || !batch || !demand || !rider) continue;
      expireClaim(claim, job, 'Rider missed the check-in deadline.');
      releaseReservation(batch, demand, rider, job.quantity);
      this.record('claim.expired', 'claim', claim.id, { reason: claim.releaseReason }, 'system');
      this.reassignReleasedJob(job, claim.riderId);
      changed = true;
    }
    if (changed) this.notify();
  }

  private reassignReleasedJob(job: DeliveryJob, previousRiderId: string): void {
    const batch = this.state.batches.get(job.batchId);
    const demand = this.state.demands.get(job.demandId);
    if (!batch || !demand) return;
    const receiver = this.state.receivers.get(job.receiverId);
    if (!receiver) return;
    const candidates = [...this.state.riders.values()]
      .filter((r) => r.id !== previousRiderId && r.availability === 'online' && r.reliability !== 'suspended')
      .map((r) => {
        const route = this.state.routes[`${r.id}:${receiver.id}`];
        if (!route) return undefined;
        const res = evaluateFeasibility({ batch, demand, receiver, rider: r, route, now: this.clock.now(), policy: this.policy, quantity: job.quantity });
        return res.feasible ? { rider: r, route, score: res.score } : undefined;
      })
      .filter((c): c is { rider: Rider; route: RouteSnapshot; score: number } => Boolean(c))
      .sort((a, b) => b.score - a.score);

    const next = candidates[0];
    if (!next) {
      job.status = transitionJob(job.status, 'unsafe');
      batch.status = 'unsafe';
      this.record('job.marked_unsafe', 'job', job.id, { reason: 'No safe rider remained after claim expiry.' }, 'system');
      return;
    }
    reservePlan(batch, demand, next.rider, job.quantity);
    job.riderId = next.rider.id;
    job.route = next.route;
    this.record('assignment.proposed', 'job', job.id, { riderId: next.rider.id, reason: 'Auto-reassignment after claim expiry.' }, 'system');
  }
}

export const store = new AppStore();
