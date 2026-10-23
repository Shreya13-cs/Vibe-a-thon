import { transitionClaim, transitionJob } from '../../domain/state-machine.ts';
import type { Claim, DeliveryJob, SafetyPolicy } from '../../domain/types.ts';

export interface ClaimInput {
  job: DeliveryJob;
  riderId: string;
  now: number;
  policy: SafetyPolicy;
  nextId: (prefix: string) => string;
}

export function createClaim(input: ClaimInput): Claim {
  if (input.job.status !== 'planned') throw new Error('Only planned jobs can be claimed.');
  if (input.job.riderId !== input.riderId) throw new Error('This job is assigned to a different rider.');
  input.job.status = transitionJob(input.job.status, 'claimed');
  const claim: Claim = {
    id: input.nextId('claim'),
    jobId: input.job.id,
    riderId: input.riderId,
    claimedAt: input.now,
    expiresAt: input.now + input.policy.claimTtlMinutes * 60_000,
    checkInDueAt: input.now + input.policy.checkInIntervalMinutes * 60_000,
    status: 'held',
  };
  input.job.claimId = claim.id;
  return claim;
}

export function checkInClaim(claim: Claim, now: number, policy: SafetyPolicy): void {
  if (!['held', 'confirmed'].includes(claim.status)) throw new Error('Claim is no longer active.');
  claim.status = transitionClaim(claim.status, 'confirmed');
  claim.checkInDueAt = now + policy.checkInIntervalMinutes * 60_000;
}

export function expireClaim(claim: Claim, job: DeliveryJob, reason: string): void {
  if (!['held', 'confirmed'].includes(claim.status)) return;
  claim.status = transitionClaim(claim.status, 'expired');
  claim.releaseReason = reason;
  job.status = transitionJob(job.status, 'planned');
  job.riderId = undefined;
}
