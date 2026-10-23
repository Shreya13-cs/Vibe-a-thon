import { InvalidTransitionError } from './errors.ts';
import type { ClaimStatus, JobStatus } from './types.ts';

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  planned: ['claimed', 'cancelled', 'unsafe'],
  claimed: ['planned', 'en_route_pickup', 'cancelled', 'failed', 'unsafe'],
  en_route_pickup: ['at_pickup', 'failed', 'cancelled', 'unsafe'],
  at_pickup: ['picked_up', 'failed', 'cancelled', 'unsafe'],
  picked_up: ['in_transit', 'failed', 'cancelled', 'unsafe'],
  in_transit: ['arrived', 'destination_at_risk', 'failed', 'unsafe'],
  destination_at_risk: ['reroute_pending', 'rerouted', 'unsafe', 'failed'],
  reroute_pending: ['rerouted', 'unsafe', 'failed'],
  rerouted: ['in_transit', 'arrived', 'unsafe', 'failed'],
  arrived: ['accepted', 'rejected', 'failed'],
  accepted: [],
  rejected: [],
  failed: [],
  unsafe: [],
  cancelled: [],
};

const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  available: ['held'],
  held: ['confirmed', 'expired', 'released', 'cancelled'],
  confirmed: ['confirmed', 'expired', 'released', 'cancelled'],
  expired: [],
  released: [],
  cancelled: [],
};

export function transitionJob(from: JobStatus, to: JobStatus): JobStatus {
  if (!JOB_TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(from, to);
  return to;
}

export function transitionClaim(from: ClaimStatus, to: ClaimStatus): ClaimStatus {
  if (!CLAIM_TRANSITIONS[from].includes(to)) throw new InvalidTransitionError(from, to);
  return to;
}
