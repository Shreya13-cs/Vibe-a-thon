# Omni Rush Build Workflow

## 1. Outcome

Follow this workflow to build, test, and present the RelayAid website through Omni Rush without losing the core safety logic to parallel edits or UI-first shortcuts.

The workflow is intentionally staged: first prove the state engine, then expose it through the website, then use the simulator to prove recovery.

## 2. Workspace setup

### 2.1 Create the working structure

Use this repository layout as the target:

```text
docs/
  01-product-requirements-document.md
  02-requirements-analysis.md
  03-omnirush-build-workflow.md
src/
  domain/
  application/
  infrastructure/
  ui/
  simulation/
tests/
```

Keep the domain and simulation code independent of browser components.

### 2.2 Create Omni Rush session groups

Create workspace groups with this exact sequence:

1. `01 Discovery`
2. `02 Architecture`
3. `03 Domain Engine`
4. `04 Web Experience`
5. `05 Simulation QA`
6. `06 Demo Ready`

Pin the lead session and the current decision log. Move sessions as work advances. Omni Rush workflows support renaming, pinning, archiving, reordering, and moving sessions into workspace-specific groups; use those actions as the project board rather than scattering decisions across unnamed chats. Reference: `start-here/do-work-with-it/workflows.mdx`.

## 3. The lead session contract

Start one session named:

`RelayAid — Lead Integrator`

Give it this standing instruction:

> You are the lead integrator for RelayAid. Treat `docs/01-product-requirements-document.md` as the product contract and `docs/02-requirements-analysis.md` as the engineering contract. Do not weaken hard safety constraints to make a test pass. Before editing, inspect the repository and current git status. Keep business rules in the domain/application layers, not inside UI components. After every slice, report changed files, tests run, remaining risks, and the next handoff. Integrate small changes and keep the four judge scenarios runnable from a clean checkout.

The lead owns architecture decisions, integration, final tests, and the demo script. Other agents must return work to the lead; they do not independently redefine requirements.

## 4. Phase-by-phase workflow

### Phase 0 — Read and lock the brief

**Session:** `RelayAid — Discovery`

Prompt:

> Read the PRD and requirements analysis. Produce a one-page implementation brief containing users, core entities, state transitions, hard constraints, the four judge scenarios, and the smallest viable stack already supported by this repository. Do not write application code yet. Identify assumptions and list the decisions that must not be changed casually.

Output:

- implementation brief;
- risk list;
- decision log;
- proposed file ownership map.

Move this session to `01 Discovery` and pin it.

### Phase 1 — Inspect the repository and choose the smallest stack

**Session:** `RelayAid — Setup`

Prompt:

> Inspect the repository, manifests, scripts, and existing source files. Determine whether an app already exists. If it is empty, propose the smallest web stack that supports a responsive UI, a testable domain layer, and a deterministic simulator. Do not install or replace tooling without evidence. Record exact start, test, lint, typecheck, and build commands.

If the repository is empty, select a conventional stack only after the inspection confirms there is no existing stack. Keep the domain engine portable and testable.

### Phase 2 — Define contracts before parallel work

**Session:** `RelayAid — Architecture`

Prompt:

> Turn the requirements analysis into TypeScript or language-level contracts for entities, commands, events, time provider, matching result, claim result, and recovery result. Include invariants and invalid transition errors. Keep the contracts framework-agnostic. Add focused tests for the state machine and quantity accounting.

Do not start frontend work until this contract is reviewed. This prevents several agents from inventing incompatible data shapes.

### Phase 3 — Parallel agent build plan

Start parallel work only after the lead has committed the domain contract. Use one task per bounded area and tell each agent what it may edit.

#### Agent A: Domain engine

Prompt:

> Own only `src/domain/**` and its focused tests. Implement the entity model, hard constraints, state transitions, quantity invariants, compatibility checks, and a controllable clock interface. Do not edit UI, routing, or package configuration. Return changed files, tests run, and any contract questions.

#### Agent B: Dispatch and recovery

Prompt:

> Own only `src/application/dispatch/**`, `src/application/recovery/**`, and related tests. Implement matching, split planning, claim TTL, heartbeat handling, automatic release, fallback receiver selection, idempotent commands, and event creation using the agreed domain contracts. Do not duplicate rules in UI code.

#### Agent C: Frontend and UX

Prompt:

> Own only `src/ui/**` and UI-level tests. Build the role-aware dashboard, batch and demand forms, job timeline, alerts, countdowns, simulator controls, and empty/error/blocked states. Consume the agreed application interfaces; do not reimplement matching or safety logic in components.

#### Agent D: Simulator and QA

Prompt:

> Own only `src/simulation/**` and `tests/scenarios/**`. Build deterministic seed data, clock advancement, failure injection, reset behavior, and the four judge scenarios. Add boundary tests for duplicate claims, race conditions, expiry, capacity, and rerouting. Do not weaken assertions to fit implementation behavior.

#### Agent E: Release and documentation

Prompt:

> Own only setup documentation, demo instructions, and non-code release notes. Document the exact commands to run the app and the four scenarios. Do not edit domain or UI files. Verify instructions from a clean checkout if possible.

The lead should integrate these slices one at a time, not merge everything blindly. If two agents need the same file, keep that file with the lead.

### Phase 4 — Build the vertical slice first

Before expanding the UI, implement one complete flow:

1. seed one donor batch;
2. seed one receiver demand;
3. calculate a feasible assignment;
4. create a claim;
5. advance the clock;
6. release the claim if no check-in occurs;
7. record events;
8. show the result in the dashboard.

This proves that the browser is connected to real rules rather than static mockups.

### Phase 5 — Add the judged failure scenarios

Implement and verify in this order:

1. **Large batch split:** prove quantity and capacity invariants.
2. **Ghost reservation:** prove TTL, heartbeat, release, and re-matching.
3. **Destination closure:** prove in-transit risk detection and fallback selection.
4. **Dependency block:** prove compatibility enforcement and explanation.

For each scenario, use the same loop:

1. Reset simulator.
2. Record initial state.
3. Trigger exactly one failure.
4. Advance the simulated clock if needed.
5. Observe state, event log, and user-facing explanation.
6. Assert the expected result.
7. Capture a screenshot or short demo note.

### Phase 6 — Add resilience and UX polish

Only after the four scenarios pass:

- add optimistic loading where safe;
- add stale-state banners;
- make commands idempotent;
- handle browser refresh;
- improve responsive layout;
- add keyboard navigation;
- add realistic seed data;
- add operator-friendly copy;
- show absolute timestamps alongside countdowns.

Do not add maps, notifications, or external services before these basics are stable.

### Phase 7 — Run the release rehearsal

Use a dedicated session named:

`RelayAid — Demo Rehearsal`

Prompt:

> Start from the current repository state and rehearse the judge flow as a new operator. Run the app, reset the simulator, execute all four scenarios, and report any step that is ambiguous, nondeterministic, or impossible without reading source code. Do not modify code until the failure report is complete.

Then fix the highest-risk issues in order:

1. incorrect safety or quantity behavior;
2. broken reset or nondeterministic simulation;
3. unclear recovery action;
4. missing event/audit evidence;
5. visual polish.

### Phase 8 — Finalize the repository

Before calling the project demo-ready:

- run the exact start command;
- run focused domain tests;
- run scenario tests;
- run typecheck/lint/build if configured;
- inspect `git diff` and `git status`;
- confirm no secrets, private notes, or generated junk are tracked;
- confirm the README includes setup and the four-scenario demo script;
- make a small conventional commit for each coherent slice.

The source brief explicitly asks for regular continuous commits. Commit after domain contracts, dispatch/recovery, UI, simulator/QA, and release hardening rather than making one opaque final commit.

## 5. Prompt patterns that keep agents reliable

### Investigate before edit

> Inspect the relevant files and all callers first. Summarize the current behavior, the smallest safe change, and the checks you will run. Then make the change.

### Preserve invariants

> Do not bypass or weaken a hard constraint. If the requested behavior conflicts with an invariant, stop and report the conflict with a concrete example.

### Return a useful handoff

> End with: changed files, behavior added, tests/checks run with results, assumptions, known gaps, and the exact next action for the lead.

### Review instead of duplicate

> Review the current implementation for violations of the PRD and requirements analysis. Do not edit code. Report findings by severity with file/line evidence and a minimal reproduction.

## 6. Quality gates

### Gate A: Contract gate

- entities and events are named;
- invalid transitions are rejected;
- quantity and time invariants have tests;
- the clock is injectable.

### Gate B: Recovery gate

- claims expire;
- missed check-ins release claims;
- jobs are re-evaluated before re-queueing;
- destination closure creates an at-risk state;
- safe fallbacks are selected or unsafe escalation is explicit.

### Gate C: UI gate

- every critical status has text;
- countdowns do not replace absolute timestamps;
- blocked/expired/error states are actionable;
- refresh does not duplicate commands;
- the operator can find the next action.

### Gate D: Demo gate

- the simulator resets;
- all four judge scenarios are reproducible;
- the event log proves what happened;
- the app can be started from the documented commands;
- the repository contains continuous, reviewable commits.

## 7. Recommended session organization

Maintain these named sessions:

- `RelayAid — Lead Integrator`
- `RelayAid — Discovery`
- `RelayAid — Architecture`
- `RelayAid — Domain Engine`
- `RelayAid — Dispatch Recovery`
- `RelayAid — Frontend UX`
- `RelayAid — Simulator QA`
- `RelayAid — Demo Rehearsal`

Pin the lead, architecture, and current QA sessions. Move completed sessions to `06 Demo Ready` only after the lead verifies their checks. Archive abandoned explorations instead of deleting them so decisions remain recoverable.

## 8. Final demo script

1. Open the dashboard as dispatcher.
2. Point out the countdown, at-risk alerts, and unallocated quantity.
3. Open the large-batch scenario and show split allocations.
4. Claim one leg as a rider.
5. Advance time without checking in and show automatic release and reassignment.
6. Reset and start the in-transit scenario.
7. Close or fulfill the destination and show the fallback decision.
8. Reset and show a dependency-blocked assignment.
9. Open the event timeline and explain the audit trail.
10. End by showing the repository's setup instructions and recent commits.

## 9. Definition of success

The build process is successful when a new agent can enter the workspace, read the three docs, understand the ownership boundaries, run the app, reproduce the four scenarios, and make a focused change without guessing where the safety logic lives.
