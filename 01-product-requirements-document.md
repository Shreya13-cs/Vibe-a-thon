# Product Requirements Document

## 1. Document control

- **Product name:** Last-Mile Aid Exchange
- **Working codename:** RelayAid
- **Document status:** Build-ready MVP PRD
- **Source:** `Vibe-A-Thon Problem Statement.docx`
- **Primary audience:** Product, engineering, design, QA, and the Omni Rush build team
- **Target delivery:** A working web prototype that survives the judge's live failure simulations

## 2. Executive summary

RelayAid is a real-time coordination platform for moving perishable food, short-life medical supplies, and essential aid kits from donors to shelters and relief camps. It treats expiry time, transport capacity, receiver demand, compatibility constraints, route conditions, and human reliability as live operational variables.

The product must do more than create a marketplace listing. It must continuously decide whether a delivery is still safe and useful, prevent volunteers from holding work they cannot complete, split large batches across multiple riders, and recover cargo when a rider, route, or destination changes state.

The MVP should optimize for **safe completion**, not maximum assignment volume:

1. Never dispatch aid that is already unsafe or cannot arrive before its safety deadline.
2. Never let a silent volunteer block a perishable batch for an unbounded time.
3. Never send more aid to a receiver than its current usable demand and capacity.
4. Never dispatch a kit when its receiver dependencies are unmet.
5. Always provide a visible recovery path for in-transit aid when the original destination closes or fills.

## 3. Problem statement

The source problem describes a recurring last-mile spoilage trap:

- A donor has more aid than one rider or one shelter can handle.
- A volunteer claims a batch but becomes unresponsive, creating a ghost reservation.
- A receiver's demand changes while a delivery is already moving.
- A supply is technically available but operationally incompatible with the receiver's current resources.
- Perishable aid loses value minute by minute, so ordinary queue-based coordination is too slow.

The prototype will be judged by simulating exactly these failures: tight expiry windows, multi-rider pickup, unresponsive volunteers, and a shelter closing or satisfying its demand during transit.

## 4. Goals and non-goals

### 4.1 Goals

- Give donors a fast way to publish a batch with quantity, type, pickup location, expiry, and handling constraints.
- Give shelters a way to publish demand, capacity, priority, and dependencies.
- Give riders a live queue of feasible jobs based on distance, capacity, timing, and reliability state.
- Match supply to demand using explicit feasibility rules rather than simple first-come-first-served claims.
- Support partial fulfillment and multi-rider splitting.
- Use expiring claims, check-ins, and automatic release to eliminate ghost reservations.
- Re-plan assignments when a rider, route, batch, or receiver changes state.
- Make every decision explainable in the UI so operators can understand why a job was assigned, blocked, rerouted, or released.
- Provide deterministic simulation controls for the judge scenarios.

### 4.2 Non-goals for the MVP

- Full public identity verification or background checks.
- Real payments, donations, tax receipts, or fundraising.
- Production-grade turn-by-turn navigation.
- Medical diagnosis or clinical decision-making.
- Automated legal or food-safety certification.
- Native mobile apps; the MVP is a responsive web application.
- Nationwide logistics optimization. The first release may operate within one city or a simulated city.

## 5. Users and roles

### 5.1 Donor

Creates and manages an aid batch. The donor sees available quantity, claim progress, pickup instructions, expiry countdown, and whether the batch is safely allocated.

### 5.2 Receiver

Represents a shelter, relief camp, clinic, or community kitchen. The receiver publishes demand and capacity, confirms arrivals, closes or updates demand, and declares dependencies such as water, fuel, refrigeration, or trained handling.

### 5.3 Rider / volunteer

Accepts a feasible transport task, reports pickup and delivery milestones, checks in periodically, and can report delay, breakdown, or inability to complete.

### 5.4 Dispatcher / operations coordinator

Views the live network, overrides or approves exceptional decisions, resolves conflicts, and uses the simulator to demonstrate recovery behavior.

### 5.5 System administrator

Configures safety thresholds, claim timeouts, role permissions, and demo data. This role is optional in the visible MVP but useful for reliable judging.

## 6. Product principles

1. **Safety before completion:** An uncompleted safe delivery is better than a completed unsafe delivery.
2. **Time is a first-class field:** Show absolute timestamps and countdowns everywhere a decision depends on time.
3. **Reservations expire:** A claim is a temporary commitment, not ownership.
4. **Partial progress is valid:** The system should preserve completed pickup or delivery work instead of resetting an entire batch.
5. **Explain every decision:** Each assignment or rejection should state the decisive constraints.
6. **Design for failure:** The happy path is not the product; recovery is.
7. **Human override is visible:** Operators can intervene, but overrides are logged and cannot silently bypass safety rules.

## 7. MVP scope

### 7.1 Core capabilities

1. Role-based demo login or role switcher.
2. Donor batch creation and lifecycle management.
3. Receiver demand and dependency management.
4. Rider availability, capacity, location, and reliability state.
5. Feasibility-aware matching and assignment.
6. Multi-rider split planning.
7. Claim TTL, heartbeat, auto-release, and reassignment.
8. Pickup, transit, arrival, acceptance, rejection, cancellation, and reroute states.
9. Receiver demand closure and in-transit recovery.
10. Operations dashboard with alerts, countdowns, and event history.
11. Deterministic failure simulator for the four judge scenarios.
12. Seed data and a resettable demo environment.

### 7.2 Recommended screen map

- `/` — role selection and product overview
- `/dashboard` — role-aware dashboard
- `/batches` — donor batches and supply map/list
- `/batches/new` — create an aid batch
- `/demands` — receiver demand board
- `/riders` — rider availability and capacity
- `/dispatch` — operations control tower
- `/jobs/:id` — job detail and state timeline
- `/simulate` — judge scenario controls
- `/activity` — append-only operational event log

## 8. Functional requirements

### FR-01: Create an aid batch

The system shall allow a donor to create a batch with:

- batch type: cooked food, medicine, ration kit, infant formula, or other aid;
- quantity and unit;
- pickup location;
- available-from time;
- safe-until time and optional hard-expiry time;
- packaging or handling notes;
- required vehicle or storage conditions;
- contact and pickup instructions.

The system shall reject a batch with an expiry in the past, non-positive quantity, or missing pickup location.

### FR-02: Publish receiver demand

The system shall allow a receiver to publish demand with:

- aid type and acceptable substitutions;
- requested quantity and remaining quantity;
- receiving capacity for the time window;
- location and operating hours;
- priority or urgency;
- dependencies such as clean water, cooking fuel, refrigeration, or trained handling;
- status: open, constrained, paused, fulfilled, or closed.

### FR-03: Represent rider capability

The system shall track each rider's:

- online/offline/paused status;
- current location;
- carrying capacity by unit or volume;
- available storage requirements;
- current assigned load;
- check-in timestamp;
- reliability state: healthy, warning, unresponsive, or suspended.

### FR-04: Compute feasible assignments

An assignment is feasible only when all hard constraints pass:

- aid type is compatible with receiver demand;
- receiver demand is still open and has remaining capacity;
- receiver dependencies are satisfied;
- rider capacity is sufficient for the proposed split;
- pickup and delivery can occur before the safety deadline using the configured time buffer;
- the rider is available and not already committed beyond capacity;
- the route is not blocked by a simulated closure or operational restriction.

The system should rank feasible assignments using urgency, time-to-expiry, distance, receiver priority, and consolidation potential.

### FR-05: Split a batch across multiple riders

If a batch exceeds a rider's usable capacity or a receiver's remaining capacity, the system shall create multiple shipment legs. Each leg must have:

- a unique job ID;
- a quantity that does not exceed rider capacity;
- a receiver allocation;
- its own claim and status;
- a shared parent batch reference;
- a visible remaining-unallocated quantity.

The split plan must be recalculated when a leg is cancelled, released, delivered, or rerouted.

### FR-06: Prevent ghost reservations

When a rider claims a job, the system shall create a reservation with:

- claim timestamp;
- claim expiry timestamp;
- required check-in deadline;
- expected pickup deadline;
- rider and job references;
- release reason if it expires.

The reservation shall automatically release when the rider misses the check-in or pickup deadline. The job shall return to the matching pool if it remains safe and feasible. If it no longer remains safe, it shall be escalated or marked unsafe rather than silently re-queued.

### FR-07: Check in and advance the job state

The rider shall be able to report:

`claimed -> en route to pickup -> arrived at pickup -> picked up -> in transit -> arrived -> accepted`

The system shall reject invalid transitions and record every transition with actor, timestamp, and reason.

### FR-08: Recover from rider failure

The system shall support rider actions for delay, breakdown, inability to complete, and explicit cancellation. Operations shall see a warning before a hard timeout and a clear release event after timeout.

The recovery engine shall prefer:

1. reassignment to a nearby feasible rider;
2. partial reroute to another compatible receiver;
3. return-to-donor or safe-hold instruction;
4. safe disposal/escalation when no safe destination remains.

### FR-09: Recover from receiver changes

When a receiver becomes closed, paused, or fulfilled while a job is in transit, the system shall:

- stop additional dispatches to that receiver;
- mark affected jobs as `destination_at_risk`;
- recalculate remaining demand across other compatible receivers;
- offer or automatically select a fallback based on configured policy;
- preserve the original receiver and reroute reason in the audit trail;
- prevent rerouting when the new destination cannot be reached safely.

### FR-10: Enforce dependencies

The system shall block assignment of a supply when a required receiver dependency is not currently satisfied. It shall show the exact blocking dependency and the action needed to unblock it.

### FR-11: Operations dashboard

The dashboard shall show:

- expiring batches;
- jobs requiring check-in;
- unresponsive riders;
- destinations at risk;
- unallocated quantity;
- unsafe or blocked aid;
- active reroutes;
- event timeline;
- system health and current simulated time.

### FR-12: Simulation mode

The simulator shall allow an operator to seed or trigger:

- a batch expiring in 15–90 minutes;
- a batch larger than one rider's capacity;
- a rider becoming unresponsive after claiming;
- a receiver becoming fulfilled or closed while a job is in transit;
- a route delay or blocked route;
- a missing dependency at a receiver.

Every scenario shall be resettable and produce a visible pass/fail checklist.

## 9. State model

### 9.1 Batch states

`draft`, `published`, `partially_allocated`, `fully_allocated`, `pickup_in_progress`, `partially_delivered`, `completed`, `expired`, `cancelled`, `unsafe`

### 9.2 Demand states

`draft`, `open`, `constrained`, `paused`, `fulfilled`, `closed`, `expired`

### 9.3 Claim states

`available`, `held`, `confirmed`, `expired`, `released`, `cancelled`

### 9.4 Job states

`planned`, `claimed`, `en_route_pickup`, `at_pickup`, `picked_up`, `in_transit`, `destination_at_risk`, `reroute_pending`, `rerouted`, `arrived`, `accepted`, `rejected`, `failed`, `unsafe`, `cancelled`

State transitions must be centralized in a domain service or state machine, not scattered across UI components.

## 10. Safety and matching rules

### 10.1 Hard constraints

Hard constraints are never bypassed by ranking or a manual UI click:

- quantity must be positive;
- expiry must be in the future;
- ETA plus safety buffer must be before safe-until;
- receiver must accept the aid type;
- receiver must have remaining need and capacity;
- dependencies must be satisfied;
- rider must have enough usable capacity;
- a job cannot be double-claimed;
- a completed leg cannot be reassigned.

### 10.2 Soft ranking factors

Among feasible options, rank by:

1. lowest time-to-expiry;
2. highest receiver urgency;
3. shortest safe ETA;
4. best capacity utilization;
5. fewest transfers or handoffs;
6. rider reliability and recent check-in health.

### 10.3 Default buffers

Use configurable defaults for the prototype, for example:

- claim TTL: 5 minutes;
- check-in interval: 2 minutes;
- warning threshold: 3 minutes before missed check-in;
- pickup buffer: 5 minutes;
- safety arrival buffer: 10 minutes;
- automatic release grace period: 1 minute.

These values are demo defaults, not food-safety advice. The UI must label them as configurable simulation policy.

## 11. Data model

Minimum entities:

- `User`: identity and role;
- `DonorProfile`: donor details and pickup instructions;
- `Receiver`: location, hours, capacity, dependencies, status;
- `AidBatch`: type, quantity, timestamps, constraints, status;
- `Demand`: receiver need, accepted types, capacity, priority, status;
- `RiderProfile`: location, capacity, availability, reliability;
- `Assignment`: proposed match and score explanation;
- `Claim`: expiring reservation and heartbeat data;
- `DeliveryJob`: shipment leg and lifecycle state;
- `RouteSnapshot`: ETA, distance, delay, and simulated restrictions;
- `Event`: immutable audit record;
- `SimulationScenario`: named failure scenario and expected checks.

Important invariants:

- allocated quantity never exceeds batch quantity;
- delivered quantity never exceeds allocated quantity;
- accepted quantity never exceeds receiver demand or capacity;
- a rider's active load never exceeds capacity;
- a claim belongs to at most one active job;
- every status change creates an event;
- every reroute retains a parent job or shipment reference.

## 12. Non-functional requirements

- **Responsiveness:** Main dashboard interactions should update within 500 ms in the local prototype.
- **Freshness:** Countdown and operational state should update without requiring a full page refresh.
- **Reliability:** A failed browser refresh must not create duplicate claims or duplicate deliveries.
- **Determinism:** The simulator must use a controllable clock so tests are repeatable.
- **Accessibility:** Keyboard navigation, visible focus, readable contrast, and status text that is not conveyed by color alone.
- **Observability:** Each decision should have a traceable event and reason code.
- **Security:** Role-based access, server-side authorization, validation of all state transitions, and no secrets in the client bundle.
- **Portability:** Keep business rules independent of the UI so the domain engine can later power a mobile client or API.

## 13. Acceptance criteria

The MVP is ready for judging when a fresh user can:

1. Create a 180-meal batch with 75 minutes of safe life.
2. Create a shelter demand for 50 meals and show the remaining 130 meals.
3. Split the batch across at least two riders with visible quantities and deadlines.
4. Claim a leg, make the rider unresponsive, advance simulated time, and observe automatic release and reassignment.
5. Put a rider in transit, close or fulfill the original shelter, and observe a safe fallback decision or an explicit unsafe escalation.
6. Create a supply with unmet dependencies and see the assignment blocked with an explanation.
7. Inspect the event history and understand every assignment, timeout, release, and reroute.
8. Reset the simulator and reproduce the same result.

## 14. Success metrics for the prototype

- 100% of judge scenarios produce a visible, deterministic outcome.
- 0 duplicate active claims for the same job.
- 0 assignments that violate a hard safety or compatibility constraint.
- 100% of expired claims are released within the configured grace period.
- 100% of state transitions have an audit event.
- A new operator can understand the next required action from the dashboard without reading source code.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Real-time behavior becomes brittle | High | Use a deterministic simulation clock and one domain event pipeline before adding live sockets |
| Matching logic is hidden in UI code | High | Keep feasibility and state transitions in pure domain services with tests |
| Rerouting creates double delivery | High | Use idempotent commands and quantity invariants |
| Too much feature scope for a sprint | High | Build the four judge scenarios before maps, notifications, or auth polish |
| Fake data is hard to reset | Medium | Add scenario seeders and a reset button from day one |
| Safety logic appears to give real-world medical/food advice | Medium | Label thresholds as configurable demo policy and keep final safety decisions with operators |
| Multiple agents create conflicting edits | Medium | One lead agent owns integration; parallel agents work in bounded areas and report back |

## 16. Multiple-agent strategy inside Omni Rush

Use multiple agents only where work can be separated by file ownership or deliverable. Do not let several agents edit the same core files simultaneously.

### Recommended agent roles

1. **Lead / integrator agent**
   - Owns the master plan, architecture decisions, branch or worktree integration, and final verification.
   - Maintains the decision log and resolves conflicts.

2. **Product and UX agent**
   - Converts this PRD into screen states, empty/error/loading states, and a responsive information hierarchy.
   - Owns UI copy and interaction acceptance notes.

3. **Domain and state-machine agent**
   - Implements entities, invariants, feasibility rules, claim expiry, and state transitions.
   - Owns domain tests and must not change visual components.

4. **Dispatch and recovery agent**
   - Implements split planning, scoring, timeout release, rerouting, fallback selection, and event creation.
   - Owns adversarial operational scenarios.

5. **Frontend agent**
   - Builds the dashboard, batch/demand/job screens, simulator controls, and visual status system using mocked or real domain APIs.
   - Does not duplicate business rules in components.

6. **QA / adversarial agent**
   - Runs the four judge simulations plus boundary cases: zero quantity, expired batch, duplicate click, simultaneous claim, receiver capacity race, and failed reroute.
   - Reports failures with reproduction steps; it should not silently “fix” tests.

7. **Release / documentation agent**
   - Keeps setup instructions, demo script, screenshots, and commit history clean.
   - Verifies the repository can be started from a fresh checkout.

### Collaboration contract

- Each agent starts from this PRD and the requirements analysis.
- Each agent states assumptions before coding.
- Each agent lists files it will own before editing.
- Shared domain contracts are written first and changed only by the lead or domain agent.
- Agents return: changed files, checks run, unresolved risks, and next handoff.
- The lead integrates one small slice at a time and runs the full check after every integration.
- If a task is not independently testable, keep it with the lead instead of parallelizing it.

In Omni Rush, organize sessions into groups such as `01 Discovery`, `02 Architecture`, `03 Build`, `04 QA`, and `05 Ready for Demo`. The app's workflow model supports renaming, pinning, archiving, reordering, and moving sessions into workspace-specific groups; use those actions to keep agent work visible and recoverable. See `start-here/do-work-with-it/workflows.mdx` in the Omni Rush documentation.

## 17. Out of scope decisions to revisit after judging

- Real geocoding and routing provider integration.
- SMS, push, WhatsApp, or email notifications.
- Identity and trust scoring based on historical completions.
- Multi-city tenancy and organization administration.
- Offline-first mobile support.
- Advanced optimization such as vehicle routing with time windows.
