# Requirements Analysis

## 1. Purpose

This document translates the problem statement and PRD into implementation-ready requirements, domain rules, workflows, risks, test scenarios, and an MVP delivery sequence.

The critical interpretation is that RelayAid is a **stateful, event-driven coordination system**, not a CRUD listing site. The main engineering challenge is preserving safety and quantity invariants while actors and conditions change.

## 2. Source-derived requirements

The source handout gives four mandatory behaviors:

1. **Capacity mismatch:** A large batch must be split across riders and/or receivers.
2. **Ghost reservations:** A claimed batch must become available again when a volunteer stops responding.
3. **Mid-journey demand change:** An in-transit job must be recovered when its destination becomes full or closes.
4. **Compatibility dependencies:** Some aid must not be dispatched until receiver prerequisites are present.

The judging instructions add two delivery constraints:

- The prototype must support live operational simulations.
- The repository must receive regular continuous commits during the sprint.

## 3. Requirement classification

### Must have for the judged MVP

- Seeded demo data and resettable simulation clock.
- Donor, receiver, rider, and dispatcher experiences.
- Batch, demand, rider, claim, delivery job, event, and simulation entities.
- Hard feasibility checks.
- Multi-rider splitting.
- Claim TTL and automatic release.
- In-transit destination closure and reroute/recovery.
- Dependency blocking.
- Event timeline and reason codes.
- Automated or scripted tests for all judge scenarios.

### Should have if time remains

- Real-time updates via WebSocket or server-sent events.
- Map-style visualization.
- Route delay simulation.
- Reliability history and operator notes.
- Browser notifications.
- Better role authentication.

### Could have after the sprint

- Real routing and traffic APIs.
- Mobile PWA features.
- Notification integrations.
- Organization-level analytics.
- Advanced optimization and fairness policies.

### Must not distract from the prototype

- Payment workflows.
- Complex public onboarding.
- Full production compliance claims.
- A polished map before the state engine works.

## 4. Actors, commands, and events

### Actor commands

| Actor | Command | Preconditions | Result |
|---|---|---|---|
| Donor | CreateBatch | Valid type, quantity, location, future safe-until | Published batch |
| Donor | UpdateBatch | Batch not completed/expired | Updated batch and event |
| Receiver | OpenDemand | Valid location, type, quantity, capacity | Open demand |
| Receiver | PauseDemand | Receiver authorized | Demand unavailable for new allocations |
| Receiver | CloseDemand | Receiver authorized | New allocations blocked; active jobs evaluated |
| Receiver | ConfirmDependency | Dependency evidence present | Dependency becomes satisfied |
| Rider | GoAvailable | Rider profile valid | Rider enters matching pool |
| Rider | ClaimJob | Job feasible and available | Timed claim |
| Rider | CheckIn | Claim/job active | Deadline extended or status refreshed |
| Rider | ReportPickup | At pickup and quantity verified | Job becomes picked up |
| Rider | ReportDelay | Active job | ETA recalculated and risk evaluated |
| Rider | ReportUnableToComplete | Active job | Recovery flow begins |
| Rider | ConfirmDelivery | At receiver and quantity accepted | Job completed |
| Dispatcher | RerouteJob | Safe fallback exists or operator override is allowed | New destination or escalation |
| Dispatcher | AdvanceClock | Simulation mode | Timers and recovery rules execute |

### Domain events

Use append-only events for auditability and deterministic replay:

- `batch.created`
- `batch.published`
- `demand.opened`
- `demand.updated`
- `assignment.proposed`
- `job.created`
- `claim.created`
- `claim.checked_in`
- `claim.expired`
- `claim.released`
- `job.picked_up`
- `job.delayed`
- `job.destination_at_risk`
- `job.reroute_proposed`
- `job.rerouted`
- `job.arrived`
- `job.accepted`
- `job.rejected`
- `job.marked_unsafe`
- `demand.fulfilled`
- `demand.closed`
- `dependency.blocked`
- `dependency.satisfied`
- `simulation.advanced`

Every event should include `eventId`, `type`, `occurredAt`, `actorId`, `aggregateType`, `aggregateId`, `payload`, and `correlationId`.

## 5. Business rules

### 5.1 Quantity accounting

For every batch:

`available + held + allocated + delivered + discarded = original quantity`

The implementation may use a simpler representation, but it must preserve this conservation rule. Quantity changes must be atomic from the perspective of competing claims.

For every demand:

`remaining demand = requested quantity - accepted quantity - reserved quantity`

Do not subtract delivered quantity twice when a job is rerouted.

### 5.2 Time accounting

A proposed delivery is safe only if:

`current time + pickup time + travel ETA + safety buffer <= safe-until`

If the result is false, the job must be blocked or escalated. A manual override may change the operational policy only if the product explicitly labels it as an override and records the reason; it must not silently make the job appear safe.

### 5.3 Claim accounting

- A job has at most one active claim.
- Claim creation is idempotent using a client request ID or server-generated idempotency key.
- Check-in updates the claim's liveness deadline.
- Expiry releases the claim exactly once.
- A released job is re-evaluated before re-queueing.
- A completed or unsafe job can never return to the matching pool.

### 5.4 Compatibility

Compatibility is the intersection of:

- supply type accepted by demand;
- handling/storage requirements supported by rider and receiver;
- receiver dependencies currently satisfied;
- packaging or unit constraints;
- legal or operational restrictions configured for the simulation.

Keep this as a named policy function so the UI can show the failed rule instead of a generic “not eligible” message.

### 5.5 Receiver changes

When demand becomes fulfilled or closed:

- queued jobs are cancelled or re-planned immediately;
- claimed but not picked-up jobs are released;
- picked-up/in-transit jobs enter `destination_at_risk`;
- the recovery service searches compatible fallback receivers;
- if none are safe, the job enters `unsafe` or `return_required` depending on policy.

## 6. Recommended architecture

### 6.1 Logical layers

1. **Presentation layer:** responsive pages, role views, countdowns, forms, status timeline, simulator.
2. **Application layer:** commands, queries, orchestration, permissions, idempotency.
3. **Domain layer:** entities, invariants, matching, state machine, recovery policy.
4. **Persistence layer:** database or in-memory adapter, event log, seeded scenarios.
5. **Simulation adapter:** controllable clock, route/ETA overrides, failure injection.

The domain layer should be runnable without a browser so the judge scenarios can be tested from a script.

### 6.2 Event flow example: unresponsive rider

1. Rider claims job.
2. System creates `claim.created` with `expiresAt` and `checkInDueAt`.
3. Scheduler or simulation clock emits a timeout check.
4. No check-in is found by the deadline.
5. System emits `claim.expired` and `claim.released`.
6. Job returns to `planned` if still feasible.
7. Matcher proposes the next safe rider.
8. Dashboard shows the release reason and reassignment.

### 6.3 Event flow example: receiver fills while rider is in transit

1. Rider's job is `in_transit`.
2. Receiver demand changes to `fulfilled` or `closed`.
3. System emits `demand.fulfilled` or `demand.closed`.
4. A subscriber marks the job `destination_at_risk`.
5. Recovery service evaluates fallback receivers against time, capacity, and dependencies.
6. System proposes or executes a reroute.
7. Original and new destination are shown in the job timeline.

## 7. UI and UX requirements

### 7.1 Dashboard priority order

The first screen should answer, in this order:

1. What is about to become unsafe?
2. Which jobs need a human action now?
3. Which claims are at risk of expiring?
4. Which receiver or rider changed state?
5. How much aid remains unallocated?

### 7.2 Required visual states

Every data-driven view needs loading, empty, success, error, blocked, expired, and offline/stale states.

Use semantic labels such as `Safe`, `At risk`, `Blocked`, `Expired`, and `Needs action`; do not rely only on green, amber, and red colors.

### 7.3 Explainability copy

Examples:

- “Blocked: arrival would be 8 minutes after the safety deadline.”
- “Held by Alex until 20:14. Check-in due in 1 minute.”
- “Not eligible: receiver has no clean water, required for this kit.”
- “Destination closed while in transit. Two safe fallback receivers found.”

## 8. Test analysis

### 8.1 Required end-to-end scenarios

#### Scenario A: Split a large batch

- Given: 180 meals, safe for 75 minutes, rider capacities 40/40/60/60, shelter capacity 50.
- When: dispatch planning runs.
- Then: no rider receives more than capacity, shelter receives no more than 50, remaining quantity is visible, and other compatible demand is considered.

#### Scenario B: Ghost reservation timeout

- Given: one job is claimed with a 5-minute TTL.
- When: the rider does not check in and the clock advances past the deadline.
- Then: claim expires once, job is released, a reason event is recorded, and the job is safely re-matched if time remains.

#### Scenario C: Destination closes in transit

- Given: a rider has picked up 40 meals and is in transit to Shelter A.
- When: Shelter A becomes fulfilled or closed.
- Then: the job becomes at risk, fallback destinations are evaluated, the rider receives a new instruction, or the job is escalated unsafe if no safe route exists.

#### Scenario D: Dependency block

- Given: raw ration kits require water and fuel, but a receiver lacks fuel.
- When: matching runs.
- Then: no job is created for that receiver and the UI names the missing dependency.

### 8.2 Boundary and concurrency tests

- Two riders click claim at the same time.
- Claim expires at the exact moment a check-in arrives.
- Demand has one unit of capacity remaining and two jobs are proposed.
- ETA equals the safety deadline.
- Batch expires while one leg is still in transit.
- A duplicate delivery confirmation is submitted.
- A reroute command is retried after the first attempt succeeded.
- A rider's capacity decreases below current load.

## 9. Delivery sequence

### Slice 1: Domain contract

Implement types, state transitions, quantity invariants, time provider, and event record. Verify with unit tests.

### Slice 2: Scenario engine

Implement seed data, controllable clock, scenario reset, and failure injection. Verify the four judge scenarios without UI.

### Slice 3: Matching and recovery

Implement feasibility, ranking, splitting, claim TTL, timeout release, and fallback selection. Verify adversarial tests.

### Slice 4: Operator UI

Build dashboard, timelines, alerts, and simulator controls. Connect to the domain/application layer.

### Slice 5: Role flows

Add donor batch creation, receiver demand, rider job actions, and permission checks.

### Slice 6: Demo hardening

Improve empty/error states, reset behavior, deterministic timestamps, demo script, seed data, and README.

## 10. Definition of done

A slice is complete only when:

- its requirements are implemented;
- its domain behavior has a focused test;
- its UI has loading/error/empty states where applicable;
- the feature is demonstrated through the browser or command path;
- the lead has reviewed the diff;
- a conventional commit records the slice;
- no known hard invariant is bypassed.

## 11. Open decisions

These are safe to decide during implementation without blocking the PRD:

- local in-memory persistence versus a lightweight database for the demo;
- polling versus sockets for state refresh;
- exact visual map treatment;
- whether rerouting is automatic or requires dispatcher confirmation.

The lead should document each choice in a short decision log and avoid changing it mid-slice without updating the tests.
