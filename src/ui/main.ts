import './styles.css';
import { RelayAidSimulation, type ScenarioName } from '../simulation/scenarios.ts';
import type { DeliveryJob, EventRecord } from '../domain/types.ts';

const scenarioLabels: Record<ScenarioName, string> = {
  split: 'Large batch split',
  ghost_reservation: 'Ghost reservation timeout',
  destination_closure: 'Destination closes in transit',
  dependency_block: 'Dependency block',
};

let selectedScenario: ScenarioName = 'split';
let simulation = new RelayAidSimulation(selectedScenario);
let lastBlockedReasons: string[] = [];
let lastScenarioResult: ReturnType<RelayAidSimulation['runScenario']> | undefined;

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('RelayAid app root is missing.');
const app: HTMLDivElement = appElement;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp);
}

function formatCountdown(timestamp: number): string {
  const minutes = Math.max(0, Math.round((timestamp - simulation.clock.now()) / 60_000));
  return `${minutes} min`;
}

function statusTone(status: string): string {
  if (['unsafe', 'failed', 'blocked', 'closed'].includes(status)) return 'blocked';
  if (['destination_at_risk', 'reroute_pending', 'warning', 'unresponsive'].includes(status)) return 'risk';
  if (['accepted', 'open', 'healthy', 'online', 'published'].includes(status)) return 'safe';
  return 'neutral';
}

function statusPill(status: string): string {
  return `<span class="status ${statusTone(status)}">${escapeHtml(status.replaceAll('_', ' '))}</span>`;
}

function render(): void {
  const batch = simulation.state.batches.get('batch-demo');
  const jobs = [...simulation.state.jobs.values()];
  const claims = [...simulation.state.claims.values()];
  const events = simulation.eventsForDisplay();
  const atRisk = jobs.filter((job) => ['destination_at_risk', 'reroute_pending', 'unsafe'].includes(job.status)).length;
  const activeClaims = claims.filter((claim) => ['held', 'confirmed'].includes(claim.status)).length;
  const jobsNeedingAction = jobs.filter((job) => ['planned', 'claimed', 'destination_at_risk'].includes(job.status)).length;

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <div class="topbar-brand">
            <div class="brand-logo">🚀</div>
            <p class="eyebrow">RelayAid · Operations Control</p>
          </div>
          <h1>Last-Mile Aid Control Tower</h1>
          <p class="lede">Deterministic operator view: safe dispatch, expiring claims, multi-rider splitting, and explainable recovery. All thresholds are configurable simulation policy — not food-safety advice.</p>
        </div>
        <div class="controls" aria-label="Simulation controls">
          <select id="scenario-select" aria-label="Choose simulation scenario">
            ${Object.entries(scenarioLabels).map(([value, label]) => `<option value="${value}" ${value === selectedScenario ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <button class="primary" data-action="reset">⟳ Reset + Plan</button>
          <button data-action="run">▶ Run Scenario</button>
          <button data-action="advance">⏩ +7 min</button>
        </div>
      </header>

      <section class="metrics" aria-label="Operations summary">
        <div class="metric"><div class="metric-label">Simulated time</div><div class="metric-value">${formatTime(simulation.clock.now())}</div><div class="metric-detail">${new Date(simulation.clock.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
        <div class="metric"><div class="metric-label">Unallocated quantity</div><div class="metric-value">${batch?.availableQuantity ?? 0}</div><div class="metric-detail">${batch?.aidType.replaceAll('_', ' ') ?? 'No batch'}</div></div>
        <div class="metric"><div class="metric-label">Jobs needing action</div><div class="metric-value">${jobsNeedingAction}</div><div class="metric-detail">${activeClaims} active claim${activeClaims === 1 ? '' : 's'}</div></div>
        <div class="metric"><div class="metric-label">At-risk destinations</div><div class="metric-value">${atRisk}</div><div class="metric-detail">${batch ? `Safe until ${formatTime(batch.safeUntil)} (${formatCountdown(batch.safeUntil)})` : 'No batch'}</div></div>
      </section>

      <div class="grid">
        <div>
          <section class="panel">
            <div class="panel-header"><h2>Delivery jobs</h2><span class="muted">${jobs.length} leg${jobs.length === 1 ? '' : 's'}</span></div>
            ${jobs.length === 0 ? '<div class="callout">No job was created. Matching is blocked until every hard constraint passes.</div>' : `<div class="table-wrap"><table><thead><tr><th>Job</th><th>Route</th><th>Quantity</th><th>State</th><th>Operator actions</th></tr></thead><tbody>${jobs.map(renderJob).join('')}</tbody></table></div>`}
          </section>
          <section class="panel">
            <div class="panel-header"><h2>Receivers and rider capacity</h2><span class="muted">Live simulation state</span></div>
            <div class="list">${[...simulation.state.receivers.values()].map((receiver) => `<div class="list-item"><h3>${escapeHtml(receiver.name)} ${statusPill(receiver.status)}</h3><p>${escapeHtml(receiver.location.label)} · ${receiver.dependencies.filter((dependency) => !dependency.satisfied).map((dependency) => `Missing ${dependency.label}`).join(', ') || 'Dependencies satisfied'}</p></div>`).join('')}${[...simulation.state.riders.values()].map((rider) => `<div class="list-item"><h3>${escapeHtml(rider.name)} ${statusPill(rider.reliability)}</h3><p>${rider.currentLoad}/${rider.capacity} capacity used · ${statusPill(rider.availability)} · last check-in ${formatTime(rider.lastCheckInAt)}</p></div>`).join('')}</div>
          </section>
        </div>
        <aside>
          <section class="panel">
            <div class="panel-header"><h2>Scenario result</h2><span class="muted">${scenarioLabels[selectedScenario]}</span></div>
            ${lastScenarioResult ? `<div class="callout">${escapeHtml(lastScenarioResult.summary)}</div><div class="checks" style="margin-top: 12px">${lastScenarioResult.checks.map((check) => `<div class="check ${check.passed ? 'pass' : 'fail'}"><div class="check-icon">${check.passed ? '✓' : '!'}</div><div><strong>${escapeHtml(check.label)}</strong><div class="muted">${escapeHtml(check.detail)}</div></div></div>`).join('')}</div>` : '<p class="muted">Reset a scenario to seed data, then use the job actions or run the complete deterministic checklist.</p>'}
          </section>
          <section class="panel">
            <div class="panel-header"><h2>Why matching stopped</h2></div>
            ${lastBlockedReasons.length ? `<div class="list">${lastBlockedReasons.map((reason) => `<div class="list-item"><p>${escapeHtml(reason)}</p></div>`).join('')}</div>` : '<p class="muted">No blocking reason recorded for this reset.</p>'}
          </section>
          <section class="panel">
            <div class="panel-header"><h2>Event timeline</h2><span class="muted">Append-only</span></div>
            <div class="timeline">${events.length ? events.map(renderEvent).join('') : '<p class="muted">Events will appear as the simulation runs.</p>'}</div>
          </section>
        </aside>
      </div>
      <p class="footer-note">Demo defaults: claim TTL 5 min, check-in interval 2 min, release grace 1 min, safety arrival buffer 10 min. Absolute timestamps and reason codes remain visible so operators can audit every decision.</p>
    </main>
  `;

  app.querySelector<HTMLSelectElement>('#scenario-select')?.addEventListener('change', (event) => {
    selectedScenario = (event.target as HTMLSelectElement).value as ScenarioName;
    resetAndPlan();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action ?? '', button.dataset.jobId, button.dataset.claimId)));
}

function renderJob(job: DeliveryJob): string {
  const receiver = simulation.state.receivers.get(job.receiverId);
  const rider = job.riderId ? simulation.state.riders.get(job.riderId) : undefined;
  const claim = job.claimId ? simulation.state.claims.get(job.claimId) : undefined;
  const canClaim = job.status === 'planned' && Boolean(job.riderId);
  const canAdvance = ['claimed', 'en_route_pickup', 'at_pickup', 'picked_up'].includes(job.status);
  const canClose = ['in_transit'].includes(job.status);
  const canRecover = job.status === 'destination_at_risk';
  return `<tr><td><strong>${escapeHtml(job.id)}</strong><span class="muted">${escapeHtml(job.originalReceiverId)}${job.rerouteReason ? ` · ${escapeHtml(job.rerouteReason)}` : ''}</span></td><td>${escapeHtml(receiver?.name ?? 'Unknown')}<br><span class="muted">${escapeHtml(rider?.name ?? 'Unassigned')} · ${job.route.travelMinutes} min ETA</span></td><td><strong>${job.quantity}</strong><span class="muted">safe until ${formatTime(job.safeUntil)}</span></td><td>${statusPill(job.status)}${claim ? `<br><span class="muted">claim ${claim.status} · due ${formatTime(claim.checkInDueAt)}</span>` : ''}</td><td><div class="action-row">${canClaim ? `<button data-action="claim" data-job-id="${job.id}">Claim</button>` : ''}${claim && ['held', 'confirmed'].includes(claim.status) ? `<button data-action="check-in" data-claim-id="${claim.id}">Check in</button>` : ''}${canAdvance ? `<button data-action="transit" data-job-id="${job.id}">Move to transit</button>` : ''}${canClose ? `<button class="warning" data-action="close" data-job-id="${job.id}">Close destination</button>` : ''}${canRecover ? `<button class="primary" data-action="recover" data-job-id="${job.id}">Find fallback</button>` : ''}</div></td></tr>`;
}

function renderEvent(event: EventRecord): string {
  return `<div class="event"><time>${formatTime(event.occurredAt)}</time><div><strong>${escapeHtml(event.type.replaceAll('.', ' · '))}</strong><span>${escapeHtml(event.aggregateType)} ${escapeHtml(event.aggregateId)} · ${escapeHtml(event.actorId)}</span></div></div>`;
}

function resetAndPlan(): void {
  simulation.reset(selectedScenario);
  const plan = simulation.planBatch('batch-demo');
  lastBlockedReasons = plan.blockedReasons;
  lastScenarioResult = undefined;
  render();
}

function handleAction(action: string, jobId?: string, claimId?: string): void {
  try {
    if (action === 'reset') resetAndPlan();
    if (action === 'run') {
      lastScenarioResult = simulation.runScenario(selectedScenario);
      lastBlockedReasons = [];
      render();
    }
    if (action === 'advance') {
      simulation.advanceClock(7);
      render();
    }
    if (action === 'claim' && jobId) {
      const job = simulation.state.jobs.get(jobId);
      if (job?.riderId) simulation.claimJob(jobId, job.riderId, `ui-${jobId}`);
      render();
    }
    if (action === 'check-in' && claimId) {
      simulation.checkIn(claimId);
      render();
    }
    if (action === 'transit' && jobId) {
      const job = simulation.state.jobs.get(jobId);
      if (job?.status === 'planned' && job.riderId) simulation.claimJob(job.id, job.riderId, `ui-${job.id}`);
      simulation.advanceJobToInTransit(jobId);
      render();
    }
    if (action === 'close' && jobId) {
      const job = simulation.state.jobs.get(jobId);
      if (job) simulation.closeReceiver(job.receiverId);
      render();
    }
    if (action === 'recover' && jobId) {
      const result = simulation.recoverJob(jobId);
      lastScenarioResult = { name: selectedScenario, passed: result.rerouted, summary: result.explanation, checks: [{ label: 'Recovery decision', passed: result.rerouted, detail: result.explanation }] };
      render();
    }
  } catch (error) {
    lastScenarioResult = { name: selectedScenario, passed: false, summary: error instanceof Error ? error.message : 'Unexpected simulation error.', checks: [{ label: 'Action completed', passed: false, detail: error instanceof Error ? error.message : 'Unexpected simulation error.' }] };
    render();
  }
}

resetAndPlan();
