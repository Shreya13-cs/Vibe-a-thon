# RelayAid

RelayAid is a deterministic last-mile aid coordination prototype. It is designed around safe completion: hard safety, compatibility, capacity, dependency, and reservation rules are enforced in the domain/application layers before the operator UI can display an action.

## Quick start

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Judge scenarios

The automated scenario suite runs all four required failure simulations:

```bash
npm test -- tests/scenarios/judge-scenarios.test.ts
```

The browser uses the same `RelayAidSimulation` engine. Choose a scenario, select **Reset + plan**, and either run the complete checklist or operate the job actions manually.

1. **Large batch split** — a 180-meal batch is split across rider capacities while Shelter A is capped at 50 meals.
2. **Ghost reservation timeout** — a rider claims a leg, misses check-in, and the claim expires before safe reassignment.
3. **Destination closure** — an in-transit job becomes at risk when its destination closes, then selects a safe fallback or escalates unsafe.
4. **Dependency block** — a ration-kit assignment is refused when the receiver lacks cooking fuel, with the missing dependency named.

## Architecture

```text
src/
  domain/                 entities, invariants, feasibility, state transitions, clocks
  application/            planning, claims, recovery, event log
  simulation/             seeded deterministic scenarios and controllable clock
  ui/                     responsive operator dashboard; no business rules
tests/
  domain/                 focused rule tests
  scenarios/              four judge scenarios and adversarial boundaries
```

The simulation is in-memory by design for the MVP. Every state-changing operation records an append-only event with a timestamp, actor, aggregate, payload, and correlation ID. Demo thresholds are configurable simulation policy and are not food-safety advice.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`

The app intentionally keeps the domain engine browser-independent so the same safety behavior can later power an API or mobile client.
