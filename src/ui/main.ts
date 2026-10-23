import './styles.css';
import { store, type AppUser, type UserRole } from '../store/app-store.ts';
import type { AidType, DeliveryJob } from '../domain/types.ts';

// ── Helpers ────────────────────────────────────────────────────
function esc(v: string): string {
  return v.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] ?? c));
}

function fmt(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts);
}

function fromNow(ts: number): string {
  const diff = Math.round((ts - Date.now()) / 60_000);
  if (diff < 0) return `${Math.abs(diff)} min ago`;
  if (diff === 0) return 'now';
  return `in ${diff} min`;
}

function statusTone(s: string): string {
  if (['unsafe', 'failed', 'blocked', 'closed', 'expired'].includes(s)) return 'blocked';
  if (['destination_at_risk', 'reroute_pending', 'warning', 'unresponsive'].includes(s)) return 'risk';
  if (['accepted', 'open', 'healthy', 'online', 'published', 'fulfilled'].includes(s)) return 'safe';
  return 'neutral';
}

function pill(s: string): string {
  return `<span class="status ${statusTone(s)}">${esc(s.replaceAll('_', ' '))}</span>`;
}

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3200);
}

// ── Router ────────────────────────────────────────────────────
type Route =
  | '/'
  | '/dashboard'
  | '/batches'
  | '/batches/new'
  | '/demands'
  | '/demands/new'
  | '/rider'
  | '/dispatch'
  | '/activity';

function getRoute(): Route {
  const hash = location.hash.replace('#', '') || '/';
  const valid: Route[] = ['/', '/dashboard', '/batches', '/batches/new', '/demands', '/demands/new', '/rider', '/dispatch', '/activity'];
  return valid.includes(hash as Route) ? (hash as Route) : '/';
}

function navigate(route: Route): void {
  location.hash = route;
}

// ── App Bootstrap ──────────────────────────────────────────────
const appEl = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  const route = getRoute();
  const user = store.state.currentUser;

  // Guard: unauthenticated users always see login
  if (!user && route !== '/') {
    navigate('/');
    return;
  }

  appEl.innerHTML = buildShell(route, user);
  attachListeners(route);
}

function buildShell(route: Route, user: AppUser | null): string {
  if (!user || route === '/') return buildLanding();
  return `
    <div class="app-layout">
      ${buildSidebar(user, route)}
      <main class="app-main">
        ${buildPage(route, user)}
      </main>
    </div>
  `;
}

// ── Landing / Role Selection ──────────────────────────────────
function buildLanding(): string {
  return `
    <div class="landing">
      <div class="landing-hero">
        <div class="brand-logo landing-logo">🚀</div>
        <p class="eyebrow">RelayAid · Last-Mile Aid Exchange</p>
        <h1>Coordinate life-saving aid,<br>in real time.</h1>
        <p class="lede">Join as a Donor, Receiver, Rider, or Dispatcher. Every role connects to the same live coordination platform — safe dispatch, expiring claims, and automatic recovery.</p>
      </div>
      <div class="role-grid">
        ${buildRoleCard('donor', '📦', 'Donor', 'Publish aid batches with quantity, type, pickup location, and expiry. Track claim progress and allocation in real time.')}
        ${buildRoleCard('receiver', '🏠', 'Receiver / Shelter', 'Publish demand, declare dependencies, confirm arrivals, and close or fulfill your needs as aid arrives.')}
        ${buildRoleCard('rider', '🚴', 'Rider / Volunteer', 'See your assigned job queue, claim deliveries, check in during transit, and report milestones.')}
        ${buildRoleCard('dispatcher', '🎛️', 'Dispatcher', 'View the live aid network, resolve conflicts, override assignments, and inspect the full event audit trail.')}
      </div>
      <div class="landing-login" id="login-form">
        <div class="panel" style="max-width:460px;margin:0 auto;">
          <div class="panel-header"><h2>Sign in to continue</h2></div>
          <div class="form-group">
            <label for="login-name">Your name</label>
            <input id="login-name" type="text" placeholder="e.g. Anika Sharma" autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="login-role">Select role</label>
            <select id="login-role">
              <option value="donor">Donor</option>
              <option value="receiver">Receiver / Shelter</option>
              <option value="rider">Rider / Volunteer</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </div>
          <button class="primary full-width" id="btn-login">Enter RelayAid →</button>
        </div>
      </div>
    </div>
  `;
}

function buildRoleCard(role: string, icon: string, title: string, desc: string): string {
  return `
    <div class="role-card" data-role="${role}">
      <div class="role-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>
  `;
}

// ── Sidebar ───────────────────────────────────────────────────
function buildSidebar(user: AppUser, current: Route): string {
  const links: Array<{ href: Route; icon: string; label: string; roles: UserRole[] }> = [
    { href: '/dashboard', icon: '🏠', label: 'Dashboard', roles: ['donor', 'receiver', 'rider', 'dispatcher'] },
    { href: '/batches', icon: '📦', label: 'My Batches', roles: ['donor', 'dispatcher'] },
    { href: '/batches/new', icon: '➕', label: 'Create Batch', roles: ['donor'] },
    { href: '/demands', icon: '📋', label: 'Demand Board', roles: ['receiver', 'dispatcher'] },
    { href: '/demands/new', icon: '📢', label: 'Publish Demand', roles: ['receiver'] },
    { href: '/rider', icon: '🚴', label: 'My Jobs', roles: ['rider'] },
    { href: '/dispatch', icon: '🎛️', label: 'Control Tower', roles: ['dispatcher', 'donor', 'receiver'] },
    { href: '/activity', icon: '📜', label: 'Activity Log', roles: ['donor', 'receiver', 'rider', 'dispatcher'] },
  ];
  const visible = links.filter((l) => l.roles.includes(user.role));
  const alertCount = [...store.state.jobs.values()].filter((j) =>
    ['destination_at_risk', 'unsafe'].includes(j.status)
  ).length;

  return `
    <nav class="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <div class="brand-logo">🚀</div>
        <div>
          <p class="sidebar-product">RelayAid</p>
          <p class="sidebar-role">${esc(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</p>
        </div>
      </div>
      <div class="sidebar-user">
        <div class="user-avatar">${esc(user.name.charAt(0).toUpperCase())}</div>
        <div>
          <p class="user-name">${esc(user.name)}</p>
          <button class="link-btn" id="btn-logout">Sign out</button>
        </div>
      </div>
      <ul class="sidebar-nav">
        ${visible.map((l) => `
          <li>
            <a href="#${l.href}" class="nav-link ${current === l.href ? 'active' : ''}">
              <span class="nav-icon">${l.icon}</span>
              <span>${l.label}</span>
              ${l.href === '/dispatch' && alertCount > 0 ? `<span class="nav-badge">${alertCount}</span>` : ''}
            </a>
          </li>
        `).join('')}
      </ul>
    </nav>
  `;
}

// ── Page Router ───────────────────────────────────────────────
function buildPage(route: Route, user: AppUser): string {
  switch (route) {
    case '/dashboard': return buildDashboard(user);
    case '/batches': return buildBatchList(user);
    case '/batches/new': return buildBatchForm();
    case '/demands': return buildDemandBoard(user);
    case '/demands/new': return buildDemandForm(user);
    case '/rider': return buildRiderView(user);
    case '/dispatch': return buildDispatch();
    case '/activity': return buildActivity();
    default: return buildDashboard(user);
  }
}

// ── Dashboard ─────────────────────────────────────────────────
function buildDashboard(user: AppUser): string {
  const now = Date.now();
  const batches = [...store.state.batches.values()];
  const jobs = [...store.state.jobs.values()];
  const claims = [...store.state.claims.values()];
  const riders = [...store.state.riders.values()];
  const receivers = [...store.state.receivers.values()];
  const demands = [...store.state.demands.values()];
  const atRisk = jobs.filter((j) => ['destination_at_risk', 'unsafe'].includes(j.status)).length;
  const activeClaims = claims.filter((c) => ['held', 'confirmed'].includes(c.status)).length;
  const expiringSoon = batches.filter((b) => b.safeUntil - now < 30 * 60_000 && b.safeUntil > now && ['published', 'partially_allocated'].includes(b.status));
  const totalUnallocated = batches.reduce((s, b) => s + b.availableQuantity, 0);
  const openDemands = demands.filter((d) => d.status === 'open').length;
  const onlineRiders = riders.filter((r) => r.availability === 'online').length;

  return `
    <div class="page-header">
      <h1>Welcome back, ${esc(user.name)}</h1>
      <p class="lede">Here's the live state of your aid network.</p>
    </div>

    <section class="metrics" aria-label="Operations summary">
      <div class="metric">
        <div class="metric-label">Unallocated Aid</div>
        <div class="metric-value">${totalUnallocated}</div>
        <div class="metric-detail">${batches.length} batch${batches.length !== 1 ? 'es' : ''} total</div>
      </div>
      <div class="metric">
        <div class="metric-label">Open Demands</div>
        <div class="metric-value">${openDemands}</div>
        <div class="metric-detail">${receivers.length} receiver${receivers.length !== 1 ? 's' : ''} registered</div>
      </div>
      <div class="metric">
        <div class="metric-label">Online Riders</div>
        <div class="metric-value">${onlineRiders}</div>
        <div class="metric-detail">${activeClaims} active claim${activeClaims !== 1 ? 's' : ''}</div>
      </div>
      <div class="metric ${atRisk > 0 ? 'metric-danger' : ''}">
        <div class="metric-label">At-Risk Destinations</div>
        <div class="metric-value">${atRisk}</div>
        <div class="metric-detail">${jobs.filter((j) => j.status === 'in_transit').length} deliveries in transit</div>
      </div>
    </section>

    ${expiringSoon.length > 0 ? `
      <div class="alert-banner warning" role="alert">
        ⚠️ <strong>${expiringSoon.length} batch${expiringSoon.length > 1 ? 'es' : ''} expiring in less than 30 minutes.</strong>
        ${expiringSoon.map((b) => `${esc(b.donorName)}: ${b.availableQuantity} units, safe until ${fmt(b.safeUntil)} (${fromNow(b.safeUntil)})`).join(' · ')}
      </div>
    ` : ''}

    <div class="grid">
      <div>
        <section class="panel">
          <div class="panel-header"><h2>Recent Jobs</h2><a href="#/dispatch" class="panel-link">View all →</a></div>
          ${jobs.length === 0 ? '<p class="muted">No jobs yet. Create a batch and publish a demand to start matching.</p>' : `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Job</th><th>Route</th><th>Qty</th><th>Status</th><th>Safe until</th></tr></thead>
                <tbody>${jobs.slice(0, 8).map((j) => {
    const recv = store.state.receivers.get(j.receiverId);
    const rider = j.riderId ? store.state.riders.get(j.riderId) : undefined;
    return `<tr>
                    <td><strong>${esc(j.id)}</strong></td>
                    <td>${esc(recv?.name ?? 'Unknown')}<br><span class="muted">${esc(rider?.name ?? 'Unassigned')} · ${j.route.travelMinutes} min</span></td>
                    <td><strong>${j.quantity}</strong></td>
                    <td>${pill(j.status)}</td>
                    <td><span class="muted">${fmt(j.safeUntil)}</span></td>
                  </tr>`;
  }).join('')}</tbody>
              </table>
            </div>
          `}
        </section>
      </div>
      <aside>
        <section class="panel">
          <div class="panel-header"><h2>Quick Actions</h2></div>
          <div class="quick-actions">
            ${user.role === 'donor' ? '<a href="#/batches/new" class="btn-card">📦 Create Aid Batch</a>' : ''}
            ${user.role === 'receiver' ? '<a href="#/demands/new" class="btn-card">📢 Publish Demand</a>' : ''}
            ${user.role === 'rider' ? '<a href="#/rider" class="btn-card">🚴 View My Jobs</a>' : ''}
            ${user.role === 'dispatcher' ? '<a href="#/dispatch" class="btn-card">🎛️ Open Control Tower</a>' : ''}
            <a href="#/activity" class="btn-card">📜 Activity Log</a>
            <a href="#/dispatch" class="btn-card">🌐 Live Network</a>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><h2>Receivers</h2></div>
          <div class="list">
            ${receivers.length === 0 ? '<p class="muted">No receivers registered yet.</p>' : receivers.slice(0, 5).map((r) => `
              <div class="list-item">
                <h3>${esc(r.name)} ${pill(r.status)}</h3>
                <p>${esc(r.location.label)} · ${r.dependencies.filter((d) => !d.satisfied).length > 0 ? `⚠️ Missing: ${r.dependencies.filter((d) => !d.satisfied).map((d) => d.label).join(', ')}` : '✅ All dependencies met'}</p>
              </div>
            `).join('')}
          </div>
        </section>
      </aside>
    </div>
  `;
}

// ── Batch List ────────────────────────────────────────────────
function buildBatchList(user: AppUser): string {
  const batches = [...store.state.batches.values()].filter((b) => user.role === 'dispatcher' || b.donorName === user.name);
  return `
    <div class="page-header">
      <h1>Aid Batches</h1>
      <a href="#/batches/new" class="btn primary">+ Create Batch</a>
    </div>
    ${batches.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h2>No batches yet</h2>
        <p>Create your first aid batch to get started.</p>
        <a href="#/batches/new" class="btn primary">Create Batch</a>
      </div>
    ` : `
      <div class="card-grid">
        ${batches.map((b) => {
    const now = Date.now();
    const jobs = [...store.state.jobs.values()].filter((j) => j.batchId === b.id);
    return `
          <div class="batch-card">
            <div class="batch-card-header">
              <span class="batch-type-badge">${esc(b.aidType.replaceAll('_', ' '))}</span>
              ${pill(b.status)}
            </div>
            <h3>${esc(b.donorName)}</h3>
            <div class="batch-stats">
              <div><span class="stat-label">Total</span><span class="stat-value">${b.quantity}</span></div>
              <div><span class="stat-label">Unallocated</span><span class="stat-value">${b.availableQuantity}</span></div>
              <div><span class="stat-label">Reserved</span><span class="stat-value">${b.reservedQuantity}</span></div>
              <div><span class="stat-label">Delivered</span><span class="stat-value">${b.deliveredQuantity}</span></div>
            </div>
            <p class="muted">📍 ${esc(b.pickupLocation.label)}</p>
            <p class="muted ${b.safeUntil < now ? 'text-danger' : b.safeUntil - now < 30 * 60_000 ? 'text-warning' : ''}">
              🕐 Safe until: ${fmt(b.safeUntil)} (${fromNow(b.safeUntil)})
            </p>
            ${b.handlingNotes ? `<p class="muted">📝 ${esc(b.handlingNotes)}</p>` : ''}
            <div class="batch-jobs">
              <span class="muted">${jobs.length} job leg${jobs.length !== 1 ? 's' : ''} planned</span>
            </div>
          </div>
        `;
  }).join('')}
      </div>
    `}
  `;
}

// ── Batch Form ────────────────────────────────────────────────
function buildBatchForm(): string {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 3600_000);
  const fmt8601 = (d: Date) => d.toISOString().slice(0, 16);

  return `
    <div class="page-header">
      <h1>Create Aid Batch</h1>
      <p class="lede">Fill in the details below. The system will automatically match your batch to receiver demands and available riders.</p>
    </div>
    <div class="form-card panel">
      <form id="batch-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label for="bf-donor">Donor / Organisation name *</label>
            <input id="bf-donor" name="donorName" type="text" required placeholder="e.g. Community Kitchen" value="${esc(store.state.currentUser?.name ?? '')}" />
          </div>
          <div class="form-group">
            <label for="bf-type">Aid type *</label>
            <select id="bf-type" name="aidType" required>
              <option value="cooked_food">Cooked Food</option>
              <option value="medicine">Medicine</option>
              <option value="ration_kit">Ration Kit</option>
              <option value="infant_formula">Infant Formula</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="bf-qty">Quantity (meals / units / kits) *</label>
            <input id="bf-qty" name="quantity" type="number" min="1" required placeholder="e.g. 180" />
          </div>
          <div class="form-group">
            <label for="bf-pickup">Pickup location *</label>
            <input id="bf-pickup" name="pickupLabel" type="text" required placeholder="e.g. Central Aid Hub, Sector 7" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="bf-from">Available from *</label>
            <input id="bf-from" name="availableFrom" type="datetime-local" required value="${fmt8601(now)}" />
          </div>
          <div class="form-group">
            <label for="bf-until">Safe until (expiry) *</label>
            <input id="bf-until" name="safeUntil" type="datetime-local" required value="${fmt8601(inOneHour)}" />
          </div>
        </div>
        <div class="form-group">
          <label for="bf-notes">Packaging / handling notes</label>
          <textarea id="bf-notes" name="handlingNotes" rows="2" placeholder="e.g. Requires refrigeration below 4°C, fragile packaging"></textarea>
        </div>
        <div class="form-group">
          <label for="bf-storage">Required vehicle / storage conditions</label>
          <input id="bf-storage" name="requiredStorage" type="text" placeholder="e.g. refrigerated van" />
        </div>
        <div class="form-actions">
          <button type="submit" class="primary">🚀 Publish Batch</button>
          <a href="#/batches" class="btn">Cancel</a>
        </div>
        <div id="batch-form-error" class="form-error hidden"></div>
      </form>
    </div>
  `;
}

// ── Demand Board ──────────────────────────────────────────────
function buildDemandBoard(user: AppUser): string {
  const demands = [...store.state.demands.values()];
  const myDemands = user.role === 'receiver'
    ? demands.filter((d) => {
      const recv = store.state.receivers.get(d.receiverId);
      return recv?.name === user.name;
    })
    : demands;

  return `
    <div class="page-header">
      <h1>Demand Board</h1>
      ${user.role === 'receiver' ? '<a href="#/demands/new" class="btn primary">+ Publish Demand</a>' : ''}
    </div>
    ${myDemands.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h2>No demands yet</h2>
        <p>${user.role === 'receiver' ? 'Publish your first demand to receive aid.' : 'No demands have been published yet.'}</p>
        ${user.role === 'receiver' ? '<a href="#/demands/new" class="btn primary">Publish Demand</a>' : ''}
      </div>
    ` : `
      <div class="card-grid">
        ${myDemands.map((d) => {
    const recv = store.state.receivers.get(d.receiverId);
    const pct = Math.round(((d.requestedQuantity - d.remainingQuantity) / d.requestedQuantity) * 100);
    const unmetDeps = d.dependencies.filter((dep) => !dep.satisfied);
    return `
          <div class="demand-card">
            <div class="demand-card-header">
              <span class="batch-type-badge">${esc(d.aidType.replaceAll('_', ' '))}</span>
              ${pill(d.status)}
              <span class="priority-badge priority-${d.priority}">${d.priority}</span>
            </div>
            <h3>${esc(recv?.name ?? 'Unknown Receiver')}</h3>
            <p class="muted">📍 ${esc(recv?.location.label ?? '')}</p>
            <div class="progress-bar-wrap">
              <div class="progress-bar" style="width:${pct}%"></div>
            </div>
            <p class="muted">${d.requestedQuantity - d.remainingQuantity} / ${d.requestedQuantity} units fulfilled</p>
            ${unmetDeps.length > 0 ? `
              <div class="dependency-block">
                ⛔ Blocked by: ${unmetDeps.map((dep) => `<strong>${esc(dep.label)}</strong>`).join(', ')}
                ${user.role === 'dispatcher' || user.role === 'receiver' ? unmetDeps.map((dep) => `
                  <button class="small warning mt-2" data-action="satisfy-dep" data-receiver-id="${recv?.id}" data-dep="${dep.kind}">✓ Mark ${esc(dep.label)} available</button>
                `).join('') : ''}
              </div>
            ` : '<p class="muted">✅ All dependencies met</p>'}
            ${(user.role === 'receiver' || user.role === 'dispatcher') && d.status === 'open' ? `
              <div class="action-row mt-2">
                <button class="small warning" data-action="fulfill-demand" data-demand-id="${d.id}">Mark Fulfilled</button>
                <button class="small danger" data-action="close-demand" data-demand-id="${d.id}">Close Demand</button>
              </div>
            ` : ''}
          </div>
        `;
  }).join('')}
      </div>
    `}
  `;
}

// ── Demand Form ───────────────────────────────────────────────
function buildDemandForm(user: AppUser): string {
  const myReceivers = [...store.state.receivers.values()].filter((r) => r.name === user.name || user.role === 'dispatcher');
  const deps = ['clean_water', 'cooking_fuel', 'refrigeration', 'trained_handling'];
  return `
    <div class="page-header">
      <h1>Publish Demand</h1>
      <p class="lede">Declare your shelter's needs. The system will automatically match and dispatch aid once a feasible rider and batch are available.</p>
    </div>

    ${myReceivers.length === 0 ? `
      <div class="alert-banner info">
        ℹ️ You need to register your shelter first before publishing demand.
      </div>
      <div class="form-card panel">
        <form id="receiver-form" novalidate>
          <h2 style="margin-bottom:var(--space-5)">Register your shelter</h2>
          <div class="form-row">
            <div class="form-group">
              <label for="rf-name">Shelter name *</label>
              <input id="rf-name" name="receiverName" required type="text" placeholder="e.g. City Relief Camp A" value="${esc(user.name)}" />
            </div>
            <div class="form-group">
              <label for="rf-loc">Location / address *</label>
              <input id="rf-loc" name="locationLabel" required type="text" placeholder="e.g. Sector 12, East Block" />
            </div>
          </div>
          <div class="form-group">
            <label>Accepted aid types</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="acceptedTypes" value="cooked_food" checked> Cooked Food</label>
              <label><input type="checkbox" name="acceptedTypes" value="medicine"> Medicine</label>
              <label><input type="checkbox" name="acceptedTypes" value="ration_kit" checked> Ration Kit</label>
              <label><input type="checkbox" name="acceptedTypes" value="infant_formula"> Infant Formula</label>
              <label><input type="checkbox" name="acceptedTypes" value="other"> Other</label>
            </div>
          </div>
          <div class="form-group">
            <label for="rf-hours">Operating hours from now (hours)</label>
            <input id="rf-hours" name="operatingHours" type="number" min="1" max="72" value="12" />
          </div>
          <div class="form-group">
            <label>Infrastructure dependencies (check all that apply)</label>
            <div class="checkbox-group">
              ${deps.map((d) => `<label><input type="checkbox" name="deps" value="${d}"> ${d.replaceAll('_', ' ')}</label>`).join('')}
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="primary">Register Shelter →</button>
          </div>
          <div id="receiver-form-error" class="form-error hidden"></div>
        </form>
      </div>
    ` : `
      <div class="form-card panel">
        <form id="demand-form" novalidate>
          <div class="form-row">
            <div class="form-group">
              <label for="df-recv">Your shelter *</label>
              <select id="df-recv" name="receiverId" required>
                ${myReceivers.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="df-type">Aid type needed *</label>
              <select id="df-type" name="aidType" required>
                <option value="cooked_food">Cooked Food</option>
                <option value="medicine">Medicine</option>
                <option value="ration_kit">Ration Kit</option>
                <option value="infant_formula">Infant Formula</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="df-qty">Quantity needed *</label>
              <input id="df-qty" name="quantity" type="number" min="1" required placeholder="e.g. 50" />
            </div>
            <div class="form-group">
              <label for="df-cap">Receiving capacity (max per window)</label>
              <input id="df-cap" name="capacity" type="number" min="1" placeholder="e.g. 60" />
            </div>
          </div>
          <div class="form-group">
            <label for="df-priority">Priority / urgency *</label>
            <select id="df-priority" name="priority" required>
              <option value="routine">Routine</option>
              <option value="urgent" selected>Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dependencies (check what your shelter currently lacks)</label>
            <div class="checkbox-group">
              ${deps.map((d) => `<label><input type="checkbox" name="deps" value="${d}"> Missing: ${d.replaceAll('_', ' ')}</label>`).join('')}
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="primary">📢 Publish Demand</button>
            <a href="#/demands" class="btn">Cancel</a>
          </div>
          <div id="demand-form-error" class="form-error hidden"></div>
        </form>
      </div>
    `}
  `;
}

// ── Rider View ────────────────────────────────────────────────
function buildRiderView(user: AppUser): string {
  // Find or describe rider profile
  const myRider = [...store.state.riders.values()].find((r) => r.name === user.name);
  const myJobs = myRider
    ? [...store.state.jobs.values()].filter((j) => j.riderId === myRider.id)
    : [];
  const myClaims = myRider
    ? [...store.state.claims.values()].filter((c) => c.riderId === myRider.id)
    : [];

  const nextStepLabel: Record<string, string> = {
    planned: 'Claim Job',
    claimed: 'En Route to Pickup',
    en_route_pickup: 'Arrived at Pickup',
    at_pickup: 'Picked Up',
    picked_up: 'Mark In Transit',
    in_transit: 'Mark Arrived',
    arrived: 'Confirm Accepted',
  };

  const nextStepStatus: Record<string, DeliveryJob['status']> = {
    claimed: 'en_route_pickup',
    en_route_pickup: 'at_pickup',
    at_pickup: 'picked_up',
    picked_up: 'in_transit',
    in_transit: 'arrived',
    arrived: 'accepted',
  };

  return `
    <div class="page-header">
      <h1>My Rider Dashboard</h1>
      <p class="lede">Manage your availability, claim jobs, and report delivery milestones.</p>
    </div>

    ${!myRider ? `
      <div class="form-card panel">
        <form id="rider-reg-form" novalidate>
          <h2 style="margin-bottom:var(--space-5)">Register as a rider</h2>
          <div class="form-row">
            <div class="form-group">
              <label for="rr-name">Your name *</label>
              <input id="rr-name" name="riderName" type="text" required value="${esc(user.name)}" />
            </div>
            <div class="form-group">
              <label for="rr-loc">Current location *</label>
              <input id="rr-loc" name="locationLabel" type="text" required placeholder="e.g. Near Central Market" />
            </div>
          </div>
          <div class="form-group">
            <label for="rr-cap">Carrying capacity (units) *</label>
            <input id="rr-cap" name="capacity" type="number" min="1" required placeholder="e.g. 40" />
          </div>
          <div class="form-actions">
            <button type="submit" class="primary">🚴 Go Online</button>
          </div>
          <div id="rider-form-error" class="form-error hidden"></div>
        </form>
      </div>
    ` : `
      <div class="grid">
        <div>
          <section class="panel">
            <div class="panel-header">
              <h2>My Jobs</h2>
              <span class="muted">${myJobs.length} job${myJobs.length !== 1 ? 's' : ''} assigned</span>
            </div>
            ${myJobs.length === 0 ? '<p class="muted">No jobs assigned yet. Stay online and jobs will appear as batches are matched.</p>' : `
              <div class="job-list">
                ${myJobs.map((j) => {
    const recv = store.state.receivers.get(j.receiverId);
    const activeClaim = myClaims.find((c) => c.jobId === j.id && ['held', 'confirmed'].includes(c.status));
    const canClaim = j.status === 'planned';
    const nextStep = nextStepStatus[j.status];
    const needsRecover = j.status === 'destination_at_risk';
    return `
                  <div class="job-card ${['destination_at_risk', 'unsafe'].includes(j.status) ? 'job-at-risk' : ''}">
                    <div class="job-card-header">
                      <strong>${esc(j.id)}</strong>
                      ${pill(j.status)}
                    </div>
                    <div class="job-route">
                      <span>📍 ${esc(recv?.name ?? 'Unknown')} — ${j.quantity} units</span>
                      <span class="muted">${j.route.travelMinutes} min travel</span>
                    </div>
                    <p class="muted">🕐 Safe until: ${fmt(j.safeUntil)} (${fromNow(j.safeUntil)})</p>
                    ${j.rerouteReason ? `<div class="callout" style="margin-top:8px">↪️ ${esc(j.rerouteReason)}</div>` : ''}
                    ${activeClaim ? `
                      <p class="muted">⏱ Check-in due: ${fmt(activeClaim.checkInDueAt)} · Claim expires: ${fmt(activeClaim.expiresAt)}</p>
                    ` : ''}
                    <div class="action-row mt-2">
                      ${canClaim ? `<button class="primary small" data-action="claim-job" data-job-id="${j.id}" data-rider-id="${myRider.id}">✋ Claim</button>` : ''}
                      ${activeClaim ? `<button class="small" data-action="check-in" data-claim-id="${activeClaim.id}">✅ Check In</button>` : ''}
                      ${nextStep && !canClaim && !needsRecover && j.status !== 'accepted' ? `
                        <button class="small" data-action="advance-job" data-job-id="${j.id}" data-to="${nextStep}">${nextStepLabel[j.status] ?? 'Advance'}</button>
                      ` : ''}
                      ${needsRecover ? `<button class="primary small" data-action="recover-job" data-job-id="${j.id}">🔄 Find Fallback</button>` : ''}
                      ${!['accepted', 'failed', 'unsafe', 'cancelled'].includes(j.status) ? `
                        <button class="small danger" data-action="fail-job" data-job-id="${j.id}">⚠️ Report Problem</button>
                      ` : ''}
                    </div>
                  </div>
                `;
  }).join('')}
              </div>
            `}
          </section>
        </div>
        <aside>
          <section class="panel">
            <div class="panel-header"><h2>My Status</h2></div>
            <div class="rider-profile">
              <div class="rider-avatar">${esc(myRider.name.charAt(0))}</div>
              <div>
                <h3>${esc(myRider.name)}</h3>
                <p class="muted">📍 ${esc(myRider.location.label)}</p>
                <p class="muted">Capacity: ${myRider.currentLoad}/${myRider.capacity} units</p>
                <p class="muted">Last check-in: ${fmt(myRider.lastCheckInAt)}</p>
                <div style="margin-top:8px">${pill(myRider.availability)} ${pill(myRider.reliability)}</div>
              </div>
            </div>
            <div class="action-row mt-4">
              ${myRider.availability !== 'online' ? `<button data-action="set-availability" data-rider-id="${myRider.id}" data-value="online" class="primary small">Go Online</button>` : ''}
              ${myRider.availability === 'online' ? `<button data-action="set-availability" data-rider-id="${myRider.id}" data-value="paused" class="small warning">Pause</button>` : ''}
              ${myRider.availability !== 'offline' ? `<button data-action="set-availability" data-rider-id="${myRider.id}" data-value="offline" class="small danger">Go Offline</button>` : ''}
            </div>
          </section>
        </aside>
      </div>
    `}
  `;
}

// ── Dispatch / Control Tower ──────────────────────────────────
function buildDispatch(): string {
  const jobs = [...store.state.jobs.values()];
  const riders = [...store.state.riders.values()];
  const receivers = [...store.state.receivers.values()];
  const batches = [...store.state.batches.values()];
  const claims = [...store.state.claims.values()];
  const atRisk = jobs.filter((j) => ['destination_at_risk', 'reroute_pending', 'unsafe'].includes(j.status));
  const unresponsiveRiders = riders.filter((r) => r.reliability === 'unresponsive');

  return `
    <div class="page-header">
      <h1>Operations Control Tower</h1>
      <p class="lede">Full live network view. Monitor, intervene, and recover.</p>
    </div>

    <section class="metrics" aria-label="Operations summary">
      <div class="metric ${atRisk.length > 0 ? 'metric-danger' : ''}">
        <div class="metric-label">At-Risk Jobs</div>
        <div class="metric-value">${atRisk.length}</div>
        <div class="metric-detail">Need immediate action</div>
      </div>
      <div class="metric">
        <div class="metric-label">In Transit</div>
        <div class="metric-value">${jobs.filter((j) => j.status === 'in_transit').length}</div>
        <div class="metric-detail">${jobs.filter((j) => j.status === 'planned').length} waiting for claim</div>
      </div>
      <div class="metric">
        <div class="metric-label">Active Claims</div>
        <div class="metric-value">${claims.filter((c) => ['held', 'confirmed'].includes(c.status)).length}</div>
        <div class="metric-detail">${claims.filter((c) => c.status === 'expired').length} expired</div>
      </div>
      <div class="metric">
        <div class="metric-label">Unresponsive Riders</div>
        <div class="metric-value ${unresponsiveRiders.length > 0 ? 'text-danger' : ''}">${unresponsiveRiders.length}</div>
        <div class="metric-detail">${riders.filter((r) => r.availability === 'online').length} online total</div>
      </div>
    </section>

    ${atRisk.length > 0 ? `
      <div class="alert-banner critical" role="alert">
        🚨 <strong>${atRisk.length} job${atRisk.length > 1 ? 's' : ''} at risk!</strong>
        ${atRisk.map((j) => {
    const recv = store.state.receivers.get(j.receiverId);
    return `Job ${esc(j.id)} → ${esc(recv?.name ?? '?')}`;
  }).join(' · ')}
      </div>
    ` : ''}

    <div class="grid">
      <div>
        <section class="panel">
          <div class="panel-header"><h2>All Delivery Jobs</h2><span class="muted">${jobs.length} legs</span></div>
          ${jobs.length === 0 ? '<p class="muted">No jobs yet. Aid batches and demands are needed for matching to begin.</p>' : `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Job</th><th>Route</th><th>Qty</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  ${jobs.map((j) => {
    const recv = store.state.receivers.get(j.receiverId);
    const rider = j.riderId ? store.state.riders.get(j.riderId) : undefined;
    const activeClaim = claims.find((c) => c.jobId === j.id && ['held', 'confirmed'].includes(c.status));
    return `<tr class="${['destination_at_risk', 'unsafe'].includes(j.status) ? 'row-danger' : ''}">
                      <td>
                        <strong>${esc(j.id)}</strong>
                        ${j.rerouteReason ? `<span class="muted">↪️ ${esc(j.rerouteReason)}</span>` : ''}
                      </td>
                      <td>${esc(recv?.name ?? 'Unknown')}<br><span class="muted">${esc(rider?.name ?? 'Unassigned')} · ${j.route.travelMinutes} min</span></td>
                      <td><strong>${j.quantity}</strong><br><span class="muted">until ${fmt(j.safeUntil)}</span></td>
                      <td>${pill(j.status)}${activeClaim ? `<br><span class="muted">due ${fmt(activeClaim.checkInDueAt)}</span>` : ''}</td>
                      <td>
                        <div class="action-row">
                          ${j.status === 'destination_at_risk' ? `<button class="small primary" data-action="recover-job" data-job-id="${j.id}">🔄 Recover</button>` : ''}
                          ${j.status === 'in_transit' && recv ? `<button class="small warning" data-action="close-receiver" data-receiver-id="${recv.id}">Close Dest.</button>` : ''}
                        </div>
                      </td>
                    </tr>`;
  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Receivers</h2></div>
          <div class="list">
            ${receivers.length === 0 ? '<p class="muted">No receivers registered yet.</p>' : receivers.map((r) => {
    const rDemands = [...store.state.demands.values()].filter((d) => d.receiverId === r.id);
    const unmetDeps = r.dependencies.filter((d) => !d.satisfied);
    return `
              <div class="list-item">
                <h3>${esc(r.name)} ${pill(r.status)}</h3>
                <p>📍 ${esc(r.location.label)} · ${rDemands.length} demand${rDemands.length !== 1 ? 's' : ''}</p>
                ${unmetDeps.length > 0 ? `<p class="muted">⛔ Missing: ${unmetDeps.map((d) => esc(d.label)).join(', ')}</p>` : '<p class="muted">✅ Dependencies met</p>'}
                <div class="action-row mt-2">
                  ${r.status === 'open' ? `<button class="small warning" data-action="close-receiver" data-receiver-id="${r.id}">Close Receiver</button>` : ''}
                  ${unmetDeps.map((dep) => `<button class="small" data-action="satisfy-dep" data-receiver-id="${r.id}" data-dep="${dep.kind}">✓ ${esc(dep.label)}</button>`).join('')}
                </div>
              </div>
            `;
  }).join('')}
          </div>
        </section>
      </div>
      <aside>
        <section class="panel">
          <div class="panel-header"><h2>Riders</h2></div>
          <div class="list">
            ${riders.length === 0 ? '<p class="muted">No riders registered.</p>' : riders.map((r) => `
              <div class="list-item">
                <h3>${esc(r.name)} ${pill(r.availability)} ${pill(r.reliability)}</h3>
                <p>${r.currentLoad}/${r.capacity} capacity · Last check-in: ${fmt(r.lastCheckInAt)}</p>
                <div class="action-row mt-2">
                  ${r.availability !== 'online' ? `<button class="small" data-action="set-availability" data-rider-id="${r.id}" data-value="online">Go Online</button>` : ''}
                  ${r.availability === 'online' ? `<button class="small warning" data-action="set-availability" data-rider-id="${r.id}" data-value="offline">Take Offline</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><h2>Batches</h2></div>
          <div class="list">
            ${batches.length === 0 ? '<p class="muted">No batches yet.</p>' : batches.map((b) => {
    const now = Date.now();
    return `
              <div class="list-item">
                <h3>${esc(b.donorName)} ${pill(b.status)}</h3>
                <p>${b.aidType.replaceAll('_', ' ')} · ${b.availableQuantity} unallocated / ${b.quantity} total</p>
                <p class="muted ${b.safeUntil < now ? 'text-danger' : b.safeUntil - now < 30 * 60_000 ? 'text-warning' : ''}">Safe until: ${fmt(b.safeUntil)} (${fromNow(b.safeUntil)})</p>
              </div>
            `;
  }).join('')}
          </div>
        </section>
      </aside>
    </div>
  `;
}

// ── Activity Log ──────────────────────────────────────────────
function buildActivity(): string {
  const events = store.eventsForDisplay();
  return `
    <div class="page-header">
      <h1>Activity Log</h1>
      <p class="lede">Immutable, append-only audit record of every decision, assignment, timeout, and reroute.</p>
    </div>
    <section class="panel">
      <div class="timeline" id="event-timeline">
        ${events.length === 0 ? '<p class="muted">Events will appear here as actions are taken.</p>' : events.map((e) => `
          <div class="event">
            <time>${fmt(e.occurredAt)}</time>
            <div>
              <strong>${esc(e.type.replaceAll('.', ' · '))}</strong>
              <span>${esc(e.aggregateType)} ${esc(e.aggregateId)} · actor: ${esc(e.actorId)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

// ── Event Listeners ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function attachListeners(_route: Route): void {
  // Global logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    store.logout();
    navigate('/');
  });

  // Landing: login form
  document.getElementById('btn-login')?.addEventListener('click', () => {
    const name = (document.getElementById('login-name') as HTMLInputElement)?.value.trim();
    const role = (document.getElementById('login-role') as HTMLSelectElement)?.value as UserRole;
    if (!name) { toast('Please enter your name.', 'error'); return; }
    const user: AppUser = { id: `user-${Date.now()}`, name, role };
    store.login(user);
    navigate('/dashboard');
  });

  // Role card click selects the role on the landing form
  document.querySelectorAll<HTMLDivElement>('.role-card').forEach((card) => {
    card.addEventListener('click', () => {
      const role = card.dataset.role as UserRole;
      const sel = document.getElementById('login-role') as HTMLSelectElement;
      if (sel) sel.value = role;
      document.getElementById('login-form')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Batch form
  document.getElementById('batch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const errEl = document.getElementById('batch-form-error')!;
    errEl.classList.add('hidden');
    try {
      const qty = parseInt((form.quantity as unknown as HTMLInputElement).value, 10);
      store.createBatch({
        donorName: (form.donorName as unknown as HTMLInputElement).value.trim(),
        aidType: (form.aidType as unknown as HTMLSelectElement).value as AidType,
        quantity: qty,
        pickupLabel: (form.pickupLabel as unknown as HTMLInputElement).value.trim(),
        availableFromISO: (form.availableFrom as unknown as HTMLInputElement).value,
        safeUntilISO: (form.safeUntil as unknown as HTMLInputElement).value,
        handlingNotes: (form.handlingNotes as unknown as HTMLTextAreaElement).value.trim() || undefined,
        requiredStorage: (form.requiredStorage as unknown as HTMLInputElement).value.trim() || undefined,
      });
      toast('✅ Batch published! Matching engine is running.', 'success');
      navigate('/batches');
    } catch (err) {
      errEl.textContent = err instanceof Error ? err.message : 'Failed to create batch.';
      errEl.classList.remove('hidden');
    }
  });

  // Receiver registration form
  document.getElementById('receiver-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const errEl = document.getElementById('receiver-form-error')!;
    errEl.classList.add('hidden');
    try {
      const acceptedTypes = [...form.querySelectorAll<HTMLInputElement>('input[name="acceptedTypes"]:checked')].map((i) => i.value as AidType);
      const deps = [...form.querySelectorAll<HTMLInputElement>('input[name="deps"]:checked')].map((i) => ({ kind: i.value, label: i.value.replaceAll('_', ' ') }));
      const hours = parseInt((form.operatingHours as unknown as HTMLInputElement).value, 10) || 12;
      store.registerReceiver({
        name: (form.receiverName as unknown as HTMLInputElement).value.trim(),
        locationLabel: (form.locationLabel as unknown as HTMLInputElement).value.trim(),
        acceptedAidTypes: acceptedTypes.length > 0 ? acceptedTypes : ['cooked_food', 'ration_kit'],
        operatingHoursHours: hours,
        dependencies: deps,
      });
      toast('✅ Shelter registered! Now publish your demand.', 'success');
      render();
    } catch (err) {
      errEl.textContent = err instanceof Error ? err.message : 'Failed to register receiver.';
      errEl.classList.remove('hidden');
    }
  });

  // Demand form
  document.getElementById('demand-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const errEl = document.getElementById('demand-form-error')!;
    errEl.classList.add('hidden');
    try {
      const qty = parseInt((form.quantity as unknown as HTMLInputElement).value, 10);
      const cap = parseInt((form.capacity as unknown as HTMLInputElement).value, 10) || qty;
      const deps = [...form.querySelectorAll<HTMLInputElement>('input[name="deps"]:checked')].map((i) => ({ kind: i.value, label: i.value.replaceAll('_', ' ') }));
      store.publishDemand({
        receiverId: (form.receiverId as unknown as HTMLSelectElement).value,
        aidType: (form.aidType as unknown as HTMLSelectElement).value as AidType,
        requestedQuantity: qty,
        receivingCapacity: cap,
        priority: (form.priority as unknown as HTMLSelectElement).value as 'routine' | 'urgent' | 'critical',
        dependencies: deps,
      });
      toast('✅ Demand published! The system will match when aid is available.', 'success');
      navigate('/demands');
    } catch (err) {
      errEl.textContent = err instanceof Error ? err.message : 'Failed to publish demand.';
      errEl.classList.remove('hidden');
    }
  });

  // Rider registration
  document.getElementById('rider-reg-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const errEl = document.getElementById('rider-form-error')!;
    errEl.classList.add('hidden');
    try {
      const cap = parseInt((form.capacity as unknown as HTMLInputElement).value, 10);
      store.registerRider({
        name: (form.riderName as unknown as HTMLInputElement).value.trim(),
        locationLabel: (form.locationLabel as unknown as HTMLInputElement).value.trim(),
        capacity: cap,
        storageRequirements: [],
      });
      toast('✅ You are now online as a rider!', 'success');
      render();
    } catch (err) {
      errEl.textContent = err instanceof Error ? err.message : 'Failed to register.';
      errEl.classList.remove('hidden');
    }
  });

  // Action buttons (dispatched from any page)
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action!;
      try {
        if (action === 'claim-job') {
          store.claimJob(btn.dataset.jobId!, btn.dataset.riderId!);
          toast('✅ Job claimed! Check in before the deadline.', 'success');
          render();
        }
        if (action === 'check-in') {
          store.checkIn(btn.dataset.claimId!);
          toast('✅ Checked in. Keep moving!', 'success');
          render();
        }
        if (action === 'advance-job') {
          store.advanceJobState(btn.dataset.jobId!, btn.dataset.to as DeliveryJob['status'] as never);
          toast('✅ Status updated.', 'success');
          render();
        }
        if (action === 'recover-job') {
          const result = store.recoverJob(btn.dataset.jobId!);
          toast(result.rerouted ? `✅ ${result.explanation}` : `⚠️ ${result.explanation}`, result.rerouted ? 'success' : 'error');
          render();
        }
        if (action === 'fail-job') {
          store.reportJobFailure(btn.dataset.jobId!, 'Rider reported a problem.');
          toast('⚠️ Problem reported. The system will attempt recovery.', 'info');
          render();
        }
        if (action === 'set-availability') {
          store.setRiderAvailability(btn.dataset.riderId!, btn.dataset.value as 'online' | 'offline' | 'paused');
          toast(`Availability set to ${btn.dataset.value}.`, 'info');
          render();
        }
        if (action === 'close-receiver') {
          store.closeReceiver(btn.dataset.receiverId!);
          toast('Receiver closed. In-transit jobs marked at risk.', 'info');
          render();
        }
        if (action === 'satisfy-dep') {
          store.satisfyDependency(btn.dataset.receiverId!, btn.dataset.dep!);
          toast('✅ Dependency satisfied. Matching engine will retry.', 'success');
          render();
        }
        if (action === 'fulfill-demand') {
          store.fulfillDemand(btn.dataset.demandId!);
          toast('✅ Demand marked fulfilled.', 'success');
          render();
        }
        if (action === 'close-demand') {
          store.closeDemand(btn.dataset.demandId!);
          toast('Demand closed.', 'info');
          render();
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'An error occurred.', 'error');
      }
    });
  });
}

// ── Bootstrap ─────────────────────────────────────────────────
window.addEventListener('hashchange', render);
store.subscribe(render);
render();
