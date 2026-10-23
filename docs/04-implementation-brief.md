# RelayAid — One-Page Implementation Brief

## Product intent

Build a responsive web prototype that coordinates perishable food, short-life medical supplies, and essential kits from donors to shelters/relief camps through live feasibility checks, expiring reservations, multi-rider splitting, and recovery when people or destinations change state. The prototype is judged on operational failure handling, not on marketplace polish.

## Users

- **Donor:** publishes an aid batch, pickup details, quantity, handling constraints, and safe-until time.
- **Receiver:** publishes demand, capacity, accepted aid types, operating status, and dependencies such as water, fuel, refrigeration, or trained handling.
- **Rider/volunteer:** views feasible jobs, claims one temporarily, checks in, reports pickup/transit/delivery, or reports delay/failure.
- **Dispatcher/operator:** monitors the network, resolves at-risk jobs, approves or performs safe reroutes, and runs judge simulations.
- **Administrator (optional MVP surface):** configures demo thresholds, permissions, seed data, and simulation policy.

## Core entities

`User`, `Receiver`, `AidBatch`, `Demand`, `RiderProfile`, `Assignment`, `Claim`, `DeliveryJob`, `RouteSnapshot`, `Event`, and `SimulationScenario`.

The domain must preserve these invariants:

- allocated quantity never exceeds batch quantity;
- delivered/accepted quantity never exceeds allocated quantity, demand, or capacity;
- rider active load never exceeds rider capacity;
- each job has at most one active claim;
- completed or unsafe jobs cannot be reassigned;
- every status transition creates an audit event;
- every reroute keeps its original job/batch relationship.

## State transitions

- **Batch:** `draft → published → partially_allocated → fully_allocated → pickup_in_progress → partially_delivered → completed`; failure endings are `expired`, `cancelled`, or `unsafe`.
- **Demand:** `draft → open → constrained/paused → fulfilled/closed/expired`.
- **Claim:** `available → held → confirmed`; timeout or cancellation leads to `expired`/`released`/`cancelled`.
- **Delivery job:** `planned → claimed → en_route_pickup → at_pickup → picked_up → in_transit → arrived → accepted`; recovery states include `destination_at_risk`, `reroute_pending`, `rerouted`, `failed`, `unsafe`, and `cancelled`.

Centralize transitions in a domain state machine/service. UI components must not implement their own lifecycle rules.

## Hard constraints

An assignment is invalid if any hard constraint fails:

1. Quantity is positive and the batch is not expired.
2. `current time + pickup time + ETA + safety buffer ≤ safe-until`.
3. Aid type and handling requirements are compatible with the receiver and rider.
4. Receiver demand is open and has remaining need/capacity.
5. All receiver dependencies are satisfied.
6. Rider is available and has enough usable capacity.
7. Route is not blocked by simulated restrictions.
8. A job cannot be double-claimed.

Default demo policy may use a 5-minute claim TTL, 2-minute check-in interval, 5-minute pickup buffer, 10-minute safety buffer, and 1-minute release grace period. These are configurable simulation values, not real-world safety certification.

## Four judge scenarios

1. **Large batch split:** Create 180 meals with 75 minutes remaining, a shelter needing 50, and riders with capacities such as 40/40/60/60. Split safely across jobs/riders without exceeding capacity or demand; show remaining quantity.
2. **Ghost reservation:** A rider claims a job and stops responding. Advance the simulation clock beyond the claim/check-in deadline. Release the claim exactly once, record the reason, and re-match only if the job remains safe.
3. **Destination closes in transit:** A rider has picked up aid for Shelter A. Shelter A becomes fulfilled/closed. Mark the job at risk, stop new dispatches there, find a compatible safe fallback, reroute, or explicitly escalate as unsafe.
4. **Dependency block:** Attempt to send a raw ration kit to a receiver missing required water or fuel. Do not create a job; display the exact missing dependency and unblock action.

## Smallest viable stack supported by this repository

The repository now supports a minimal **TypeScript + Vite + Vitest** stack:

- Node-compatible runtime;
- TypeScript 5.x with strict compiler checks;
- Vite 6 for the local development server and production build;
- Vitest 2 for unit/scenario tests;
- framework-independent domain code under `src/domain/`;
- deterministic clock, invariant, feasibility, and state-machine foundations already present;
- commands: `npm run dev`, `npm run typecheck`, `npm test`, and `npm run build`.

There is currently no frontend framework or application UI in the inspected source tree. Continue with the existing stack rather than replacing it. Add the smallest browser presentation layer that consumes the domain/application contracts; do not move business rules into components. Prefer a lightweight local persistence adapter for the prototype, and keep the domain engine independent so persistence or realtime transport can be upgraded later.

## Assumptions

- The first release is a single-city or simulated-city prototype.
- Demo role switching is acceptable instead of production identity verification.
- A controllable simulation clock is more important than real GPS/routing integration.
- Local deterministic data is sufficient for judging; real external integrations are out of scope.
- Rerouting may be automatic or dispatcher-confirmed, but the policy must be explicit and audited.
- Polling is acceptable initially; sockets should not delay the domain engine.

## Decisions that must not change casually

- Safety feasibility is a hard gate, never merely a ranking score.
- Claims are temporary reservations with TTL and heartbeat/check-in behavior.
- Quantity accounting is invariant-based and must remain atomic/idempotent.
- All status changes and reroutes are recorded as append-only events.
- The simulation clock and scenario reset are first-class capabilities.
- Domain/application rules stay outside UI components.
- The four judge scenarios are acceptance gates before maps, notifications, payments, or auth polish.
- One lead/integrator owns shared contracts and integration; parallel work must have explicit file ownership.
- Every coherent build slice receives a reviewable Git commit.

## Immediate next step

Run repository setup: inspect available runtimes and tools, select and document the minimal stack, define the domain contracts/state machine, and add tests for quantity accounting and invalid transitions before implementing the website UI.
