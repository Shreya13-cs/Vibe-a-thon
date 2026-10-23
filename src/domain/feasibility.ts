import type {
  AidBatch,
  Demand,
  Receiver,
  Rider,
  RouteSnapshot,
  SafetyPolicy,
} from './types.ts';

export interface FeasibilityInput {
  batch: AidBatch;
  demand: Demand;
  receiver: Receiver;
  rider: Rider;
  route: RouteSnapshot;
  now: number;
  policy: SafetyPolicy;
  quantity: number;
}

export interface FeasibilityResult {
  feasible: boolean;
  reasons: string[];
  score: number;
}

function isAidCompatible(batch: AidBatch, demand: Demand, receiver: Receiver): boolean {
  return (
    receiver.acceptedAidTypes.includes(batch.aidType) &&
    (demand.aidType === batch.aidType || demand.acceptableSubstitutions.includes(batch.aidType))
  );
}

export function evaluateFeasibility(input: FeasibilityInput): FeasibilityResult {
  const { batch, demand, receiver, rider, route, now, policy, quantity } = input;
  const reasons: string[] = [];
  const totalMinutes = route.pickupMinutes + route.travelMinutes + policy.safetyArrivalBufferMinutes;
  const arrivalAt = now + totalMinutes * 60_000;

  if (quantity <= 0) reasons.push('Quantity must be positive.');
  if (batch.availableQuantity < quantity) reasons.push('Batch does not have enough unallocated quantity.');
  if (batch.safeUntil <= now) reasons.push('Batch is already past its safety deadline.');
  if (arrivalAt > batch.safeUntil) reasons.push('Blocked: arrival would be after the safety deadline.');
  if (route.blocked) reasons.push(`Blocked route: ${route.restrictionReason ?? 'operational restriction'}.`);
  if (!isAidCompatible(batch, demand, receiver)) reasons.push('Aid type is not accepted by this receiver demand.');
  if (receiver.status !== 'open') reasons.push(`Receiver is ${receiver.status} and cannot accept new aid.`);
  if (!['open', 'constrained'].includes(demand.status)) reasons.push(`Demand is ${demand.status} and cannot accept new aid.`);
  if (demand.remainingQuantity < quantity) reasons.push('Quantity exceeds remaining receiver demand.');
  if (demand.receivingCapacity - demand.reservedQuantity < quantity) reasons.push('Quantity exceeds receiver receiving capacity.');
  if (rider.availability !== 'online') reasons.push('Rider is not available.');
  if (rider.reliability === 'suspended') reasons.push('Rider is suspended.');
  if (rider.capacity - rider.currentLoad < quantity) reasons.push('Quantity exceeds rider usable capacity.');
  if (batch.availableFrom > now) reasons.push('Batch is not available for pickup yet.');
  if (receiver.operatingUntil < arrivalAt) reasons.push('Arrival would be after receiver operating hours.');

  for (const dependency of [...receiver.dependencies, ...demand.dependencies]) {
    if (!dependency.satisfied) reasons.push(`Not eligible: receiver dependency missing — ${dependency.label}.`);
  }

  const score =
    Math.max(0, batch.safeUntil - now) / 60_000 * -1 +
    (demand.priority === 'critical' ? 30 : demand.priority === 'urgent' ? 20 : 10) -
    route.travelMinutes -
    route.distanceKm;

  return { feasible: reasons.length === 0, reasons, score };
}
