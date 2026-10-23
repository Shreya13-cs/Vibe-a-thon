export type AidType = 'cooked_food' | 'medicine' | 'ration_kit' | 'infant_formula' | 'other';

export type BatchStatus =
  | 'draft'
  | 'published'
  | 'partially_allocated'
  | 'fully_allocated'
  | 'pickup_in_progress'
  | 'partially_delivered'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'unsafe';

export type DemandStatus = 'draft' | 'open' | 'constrained' | 'paused' | 'fulfilled' | 'closed' | 'expired';
export type ClaimStatus = 'available' | 'held' | 'confirmed' | 'expired' | 'released' | 'cancelled';
export type JobStatus =
  | 'planned'
  | 'claimed'
  | 'en_route_pickup'
  | 'at_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'destination_at_risk'
  | 'reroute_pending'
  | 'rerouted'
  | 'arrived'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'unsafe'
  | 'cancelled';

export type ReliabilityState = 'healthy' | 'warning' | 'unresponsive' | 'suspended';
export type RiderAvailability = 'online' | 'offline' | 'paused';
export type ReceiverStatus = 'open' | 'paused' | 'fulfilled' | 'closed';

export type DependencyKind = 'clean_water' | 'cooking_fuel' | 'refrigeration' | 'trained_handling';

export interface Dependency {
  kind: DependencyKind;
  label: string;
  satisfied: boolean;
}

export interface Location {
  label: string;
  latitude: number;
  longitude: number;
}

export interface AidBatch {
  id: string;
  donorName: string;
  aidType: AidType;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  deliveredQuantity: number;
  pickupLocation: Location;
  availableFrom: number;
  safeUntil: number;
  hardExpiry?: number;
  handlingNotes?: string;
  requiredStorage?: string;
  status: BatchStatus;
}

export interface Demand {
  id: string;
  receiverId: string;
  aidType: AidType;
  acceptableSubstitutions: AidType[];
  requestedQuantity: number;
  remainingQuantity: number;
  reservedQuantity: number;
  receivingCapacity: number;
  priority: 'routine' | 'urgent' | 'critical';
  status: DemandStatus;
  dependencies: Dependency[];
}

export interface Receiver {
  id: string;
  name: string;
  location: Location;
  operatingUntil: number;
  status: ReceiverStatus;
  dependencies: Dependency[];
  acceptedAidTypes: AidType[];
}

export interface Rider {
  id: string;
  name: string;
  location: Location;
  capacity: number;
  currentLoad: number;
  storageRequirements: string[];
  availability: RiderAvailability;
  reliability: ReliabilityState;
  lastCheckInAt: number;
}

export interface RouteSnapshot {
  distanceKm: number;
  pickupMinutes: number;
  travelMinutes: number;
  blocked: boolean;
  restrictionReason?: string;
}

export interface DeliveryJob {
  id: string;
  batchId: string;
  demandId: string;
  receiverId: string;
  riderId?: string;
  quantity: number;
  status: JobStatus;
  route: RouteSnapshot;
  safeUntil: number;
  claimId?: string;
  originalReceiverId: string;
  rerouteReason?: string;
}

export interface Claim {
  id: string;
  jobId: string;
  riderId: string;
  claimedAt: number;
  expiresAt: number;
  checkInDueAt: number;
  status: ClaimStatus;
  releaseReason?: string;
}

export interface Assignment {
  id: string;
  jobId: string;
  riderId: string;
  receiverId: string;
  quantity: number;
  score: number;
  reasons: string[];
}

export interface EventRecord {
  eventId: string;
  type: string;
  occurredAt: number;
  actorId: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface SafetyPolicy {
  claimTtlMinutes: number;
  checkInIntervalMinutes: number;
  warningThresholdMinutes: number;
  pickupBufferMinutes: number;
  safetyArrivalBufferMinutes: number;
  releaseGraceMinutes: number;
}

export interface TimeProvider {
  now(): number;
}

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  claimTtlMinutes: 5,
  checkInIntervalMinutes: 2,
  warningThresholdMinutes: 3,
  pickupBufferMinutes: 5,
  safetyArrivalBufferMinutes: 10,
  releaseGraceMinutes: 1,
};
