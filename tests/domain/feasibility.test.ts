import { describe, expect, it } from 'vitest';
import { evaluateFeasibility } from '../../src/domain/feasibility.ts';
import { DEFAULT_SAFETY_POLICY, type AidBatch, type Demand, type Receiver, type Rider, type RouteSnapshot } from '../../src/domain/types.ts';

const now = Date.parse('2026-10-23T10:00:00Z');
const batch: AidBatch = {
  id: 'batch-1', donorName: 'Community Kitchen', aidType: 'cooked_food', quantity: 100,
  availableQuantity: 100, reservedQuantity: 0, deliveredQuantity: 0,
  pickupLocation: { label: 'Kitchen', latitude: 1, longitude: 1 }, availableFrom: now - 60_000,
  safeUntil: now + 60 * 60_000, status: 'published',
};
const demand: Demand = {
  id: 'demand-1', receiverId: 'receiver-1', aidType: 'cooked_food', acceptableSubstitutions: [],
  requestedQuantity: 40, remainingQuantity: 40, reservedQuantity: 0, receivingCapacity: 40,
  priority: 'urgent', status: 'open', dependencies: [],
};
const receiver: Receiver = {
  id: 'receiver-1', name: 'Shelter A', location: { label: 'Shelter A', latitude: 2, longitude: 2 },
  operatingUntil: now + 120 * 60_000, status: 'open', dependencies: [], acceptedAidTypes: ['cooked_food'],
};
const rider: Rider = {
  id: 'rider-1', name: 'Alex', location: { label: 'Rider', latitude: 1, longitude: 1 }, capacity: 50,
  currentLoad: 0, storageRequirements: [], availability: 'online', reliability: 'healthy', lastCheckInAt: now,
};
const route: RouteSnapshot = { distanceKm: 3, pickupMinutes: 5, travelMinutes: 15, blocked: false };

describe('feasibility rules', () => {
  it('accepts a safe compatible assignment', () => {
    expect(evaluateFeasibility({ batch, demand, receiver, rider, route, now, policy: DEFAULT_SAFETY_POLICY, quantity: 40 }).feasible).toBe(true);
  });

  it('blocks a delivery that would miss the safety deadline', () => {
    const result = evaluateFeasibility({
      batch: { ...batch, safeUntil: now + 20 * 60_000 }, demand, receiver, rider,
      route, now, policy: DEFAULT_SAFETY_POLICY, quantity: 40,
    });
    expect(result.feasible).toBe(false);
    expect(result.reasons).toContain('Blocked: arrival would be after the safety deadline.');
  });

  it('names an unsatisfied dependency instead of returning a generic rejection', () => {
    const dependentReceiver = {
      ...receiver,
      dependencies: [{ kind: 'clean_water' as const, label: 'Clean water', satisfied: false }],
    };
    const result = evaluateFeasibility({ batch, demand, receiver: dependentReceiver, rider, route, now, policy: DEFAULT_SAFETY_POLICY, quantity: 40 });
    expect(result.feasible).toBe(false);
    expect(result.reasons).toContain('Not eligible: receiver dependency missing — Clean water.');
  });
});
