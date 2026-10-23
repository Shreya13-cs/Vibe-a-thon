import { InvariantViolationError } from './errors.ts';
import type { AidBatch, Demand, Rider } from './types.ts';

export function assertBatchInvariant(batch: AidBatch): void {
  const accounted = batch.availableQuantity + batch.reservedQuantity + batch.deliveredQuantity;
  if (accounted > batch.quantity) {
    throw new InvariantViolationError(`Batch ${batch.id} quantity is over-allocated.`);
  }
  if ([batch.availableQuantity, batch.reservedQuantity, batch.deliveredQuantity].some((value) => value < 0)) {
    throw new InvariantViolationError(`Batch ${batch.id} contains a negative quantity.`);
  }
}

export function assertDemandInvariant(demand: Demand): void {
  if (demand.remainingQuantity < 0 || demand.reservedQuantity < 0) {
    throw new InvariantViolationError(`Demand ${demand.id} contains a negative quantity.`);
  }
  if (demand.remainingQuantity + demand.reservedQuantity > demand.requestedQuantity) {
    throw new InvariantViolationError(`Demand ${demand.id} exceeds requested quantity.`);
  }
  if (demand.reservedQuantity > demand.receivingCapacity) {
    throw new InvariantViolationError(`Demand ${demand.id} exceeds receiving capacity.`);
  }
}

export function assertRiderInvariant(rider: Rider): void {
  if (rider.currentLoad < 0 || rider.currentLoad > rider.capacity) {
    throw new InvariantViolationError(`Rider ${rider.id} load exceeds capacity.`);
  }
}
