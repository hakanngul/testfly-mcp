import * as vscode from 'vscode';
import { ActionCacheService } from './actionCacheService';
import { getNonce } from './webviewUtils';
import { pageHeader, renderPage } from './webviewShell';

/** What each io.testfly.agent.ActionType does when a frozen plan is replayed. */
const ACTION_HELP: Record<string, string> = {
    NAVIGATE: 'Opens a URL, or a path relative to execution.baseUrl.',
    CLICK: 'Clicks the element found by the locator.',
    TYPE: 'Types the value into the element.',
    CLEAR: 'Clears an input field.',
    SELECT: 'Chooses a <select> option by its visible text.',
    HOVER: 'Moves the mouse over the element.',
    WAIT_VISIBLE: 'Waits until the element is visible.',
    PRESS_ENTER: 'Presses Enter on the element.'
};

export class ActionCacheWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;
    private static workspaceRoot: string;

    /** @param focusKey cache key of a plan to expand and scroll to (from the sidebar). */
    public static show(context: vscode.ExtensionContext, workspaceRoot: string, focusKey?: string): void {
        ActionCacheWebview.workspaceRoot = workspaceRoot;
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ActionCacheWebview.currentPanel) {
            ActionCacheWebview.currentPanel.reveal(column);
            ActionCacheWebview.postState(focusKey);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyActionCache',
            'TestFly: Action Cache',
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        ActionCacheWebview.currentPanel = panel;
        panel.webview.html = ActionCacheWebview.html(panel.webview.cspSource);

        panel.onDidDispose(() => {
            ActionCacheWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        let pendingFocus = focusKey;
        panel.webview.onDidReceiveMessage(async (message) => {
            const root = ActionCacheWebview.workspaceRoot;
            switch (message.command) {
                case 'ready':
                    ActionCacheWebview.postState(pendingFocus);
                    pendingFocus = undefined;
                    break;
                case 'refresh':
                    ActionCacheWebview.postState();
                    break;
                case 'openFile':
                    if (ActionCacheService.exists(root)) {
                        await vscode.window.showTextDocument(vscode.Uri.file(ActionCacheService.getCachePath(root)), { preview: true });
                    }
                    break;
                case 'invalidate': {
                    const plan = ActionCacheService.readCache(root).find(p => p.key === message.key);
                    if (!plan) {
                        ActionCacheWebview.postState();
                        return;
                    }
                    const choice = await vscode.window.showWarningMessage(
                        `Invalidate "${plan.goal}"?`,
                        { modal: true, detail: 'The frozen plan is removed. The next run that reaches this goal asks the AI to compile it again and caches the new plan.' },
                        'Invalidate'
                    );
                    if (choice !== 'Invalidate') return;
                    const ok = ActionCacheService.invalidate(root, plan.key);
                    ActionCacheWebview.postState(undefined, ok
                        ? { kind: 'ok', text: `Invalidated "${plan.goal}". It will be recompiled on the next run.` }
                        : { kind: 'err', text: `Could not update ${ActionCacheService.getCachePath(root)}.` });
                    break;
                }
                case 'clearAll': {
                    const count = ActionCacheService.readCache(root).length;
                    const choice = await vscode.window.showWarningMessage(
                        `Clear all ${count} cached plans?`,
                        { modal: true, detail: 'Every act("Goal") call is compiled by the AI again on its next run.' },
                        'Clear all'
                    );
                    if (choice !== 'Clear all') return;
                    const ok = ActionCacheService.clearAll(root);
                    ActionCacheWebview.postState(undefined, ok
                        ? { kind: 'ok', text: 'All cached plans were cleared.' }
                        : { kind: 'err', text: 'The cache file could not be cleared.' });
                    break;
                }
            }
        });
    }

    /** Push fresh data to the panel if it is open (e.g. after a test run rewrote the cache). */
    public static refresh(): void {
        ActionCacheWebview.postState();
    }

    private static postState(focusKey?: string, notice?: { kind: 'ok' | 'err'; text: string }): void {
        const panel = ActionCacheWebview.currentPanel;
        if (!panel) return;
        const snapshot = ActionCacheService.read(ActionCacheWebview.workspaceRoot);
        panel.webview.postMessage({ type: 'state', snapshot, focusKey, notice });
    }

    private static html(cspSource: string): string {
        const actions = Object.entries(ACTION_HELP)
            .map(([name, help]) => `<tr><td><span class="badge act" data-act="${name}">${name}</span></td><td>${help.replace(/</g, '&lt;')}</td></tr>`)
            .join('');

        const body = `
${pageHeader('Action Cache', 'Frozen <code>act("Goal")</code> plans that replay without calling the AI · <code>.testfly/action-cache.json</code>', `
    <button class="secondary" data-command="refresh">Refresh</button>
    <button class="secondary" data-command="openFile" id="open-file" hidden>Open JSON</button>
    <button class="danger" data-command="clearAll" id="clear-all" hidden>Clear all…</button>`)}
<main>
    <details class="guide" id="guide">
        <summary>How the action cache works</summary>
        <div>
            <ol>
                <li>The first time a test calls <code>act("Log in as standard user")</code>, the AI turns the goal into concrete steps.</li>
                <li>TestFly freezes those steps here, keyed by page path and goal, so later runs replay them in 0&nbsp;ms and deterministically.</li>
                <li>If the page changes and a frozen step fails, TestFly drops the plan and compiles it again. Use <b>Invalidate</b> to force that yourself.</li>
            </ol>
            <h2>Supported actions</h2>
            <div class="table-wrap"><table><tbody>${actions}</tbody></table></div>
        </div>
    </details>
    <div id="notice" class="callout" role="status" hidden></div>
    <div id="loading"><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="error" class="callout err" hidden>
        <strong>The action cache could not be read</strong>
        <p id="error-text"></p>
        <p>TestFly ignores an unreadable cache and compiles goals again. Fix or delete the file to keep cached plans.</p>
        <div class="actions" style="margin-top:8px"><button class="secondary" data-command="openFile">Open JSON</button></div>
    </div>
    <div id="empty" class="empty" hidden>
        <h2>No cached plans yet</h2>
        <p>Plans appear here after a test runs an autonomous step, for example:</p>
        <pre><code>act("Log in as standard user");</code></pre>
        <p>Each goal is compiled once by the AI and then replayed from this cache.</p>
    </div>
    <div id="list-area" hidden>
        <div class="toolbar" role="search">
            <input type="search" id="search" placeholder="Search goals, locators, values…" aria-label="Search cached plans">
            <select id="page-filter" aria-label="Filter by page"></select>
            <select id="sort" aria-label="Sort plans">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="goal">Goal A–Z</option>
                <option value="steps">Most steps</option>
            </select>
            <span class="muted" id="count" aria-live="polite"></span>
        </div>
        <div id="list"></div>
        <p id="no-match" class="empty" hidden>No plans match the current search.</p>
    </div>
</main>`;

        const css = `
.badge.act { color: var(--tf-info); }
.badge.act[data-act="NAVIGATE"] { color: var(--vscode-charts-purple, var(--tf-info)); }
.badge.act[data-act="TYPE"], .badge.act[data-act="SELECT"], .badge.act[data-act="CLEAR"] { color: var(--vscode-charts-orange, var(--tf-warn)); }
.badge.act[data-act="WAIT_VISIBLE"] { color: var(--tf-muted); }
.card.focus { outline: 1px solid var(--vscode-focusBorder); }
.key { font-family: var(--tf-mono); font-size: 11px; color: var(--tf-muted); overflow-wrap: anywhere; }
td.num { width: 28px; color: var(--tf-muted); }
`;

        const script = `
const ACTION_HELP = ${JSON.stringify(ACTION_HELP)};
const saved = vscode.getState() || {};
const open = new Set(saved.open || []);
let plans = [];
$('#search').value = saved.search || '';
$('#sort').value = saved.sort || 'newest';
if (saved.guide) $('#guide').open = true;

function persist() {
    vscode.setState({ search: $('#search').value, sort: $('#sort').value, page: $('#page-filter').value, open: [...open], guide: $('#guide').open });
}

function pagePath(p) { return p.key.includes('::') ? p.key.slice(0, p.key.indexOf('::')) || '/' : '/'; }
function relative(ms) {
    if (!ms) return 'unknown time';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    const units = [[60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year']];
    let v = Math.floor(s / 60);
    for (const [size, name] of units) {
        if (v < size) return v + ' ' + name + (v === 1 ? '' : 's') + ' ago';
        v = Math.floor(v / size);
    }
}

function card(p) {
    const steps = p.steps || [];
    const details = h('details', { class: 'card', 'data-key': p.key, open: open.has(p.key) },
        h('summary', {},
            h('span', { class: 'card-title', text: p.goal }),
            h('span', { class: 'badge', title: 'Page path in the cache key', text: pagePath(p) }),
            h('span', { class: 'badge solid', text: steps.length + (steps.length === 1 ? ' step' : ' steps') }),
            h('span', { class: 'card-meta', title: p.createdAt ? new Date(p.createdAt).toLocaleString() : '', text: 'Compiled ' + relative(p.createdAt) }),
            h('button', { class: 'danger push', type: 'button', 'data-command': 'invalidate', 'data-key': p.key, 'aria-label': 'Invalidate ' + p.goal, text: 'Invalidate…' })
        ),
        h('div', { class: 'card-body' },
            p.urlPattern ? h('p', { class: 'muted' }, 'Compiled on ', h('code', { text: p.urlPattern })) : null,
            steps.length === 0 ? h('p', { class: 'muted', text: 'This plan has no steps.' }) :
            h('div', { class: 'table-wrap' }, h('table', {},
                h('thead', {}, h('tr', {}, ['#', 'Action', 'Locator', 'Value', 'Description'].map(t => h('th', { scope: 'col', text: t })))),
                h('tbody', {}, steps.map((s, i) => h('tr', {},
                    h('td', { class: 'num', text: i + 1 }),
                    h('td', {}, h('span', { class: 'badge act', 'data-act': s.action, title: ACTION_HELP[s.action] || 'Unknown action', text: s.action || '?' })),
                    h('td', {}, s.locator ? h('code', { text: s.locator }) : h('span', { class: 'muted', text: '—' })),
                    h('td', {}, s.value ? h('code', { text: s.value }) : h('span', { class: 'muted', text: '—' })),
                    h('td', { text: s.description || '' })
                )))
            )),
            h('p', { class: 'key', text: 'Cache key: ' + p.key })
        )
    );
    details.addEventListener('toggle', () => { details.open ? open.add(p.key) : open.delete(p.key); persist(); });
    return details;
}

function renderList() {
    const q = $('#search').value.trim().toLowerCase();
    const page = $('#page-filter').value;
    const sort = $('#sort').value;
    let shown = plans.filter(p => !page || pagePath(p) === page);
    if (q) shown = shown.filter(p => [p.goal, p.urlPattern, p.key, ...(p.steps || []).flatMap(s => [s.action, s.locator, s.value, s.description])]
        .some(v => v && String(v).toLowerCase().includes(q)));
    const by = {
        newest: (a, b) => b.createdAt - a.createdAt,
        oldest: (a, b) => a.createdAt - b.createdAt,
        goal: (a, b) => a.goal.localeCompare(b.goal),
        steps: (a, b) => (b.steps || []).length - (a.steps || []).length
    }[sort];
    shown.sort(by);
    $('#list').replaceChildren(...shown.map(card));
    $('#no-match').hidden = shown.length > 0;
    $('#count').textContent = shown.length === plans.length ? plans.length + (plans.length === 1 ? ' plan' : ' plans') : shown.length + ' of ' + plans.length + ' plans';
}

function renderPages() {
    const select = $('#page-filter');
    const current = select.value || saved.page || '';
    const pages = [...new Set(plans.map(pagePath))].sort();
    select.replaceChildren(h('option', { value: '', text: 'All pages' }), ...pages.map(p => h('option', { value: p, text: p })));
    select.value = pages.includes(current) ? current : '';
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type !== 'state') return;
    const snap = msg.snapshot;
    plans = snap.plans;
    $('#loading').hidden = true;
    $('#error').hidden = !snap.error;
    $('#error-text').textContent = snap.error || '';
    $('#empty').hidden = !!snap.error || plans.length > 0;
    $('#list-area').hidden = plans.length === 0;
    $('#open-file').hidden = !snap.exists;
    $('#clear-all').hidden = plans.length === 0;

    const notice = $('#notice');
    notice.hidden = !msg.notice;
    if (msg.notice) {
        notice.className = 'callout ' + msg.notice.kind;
        notice.textContent = msg.notice.text;
        announce(msg.notice.text);
    }

    renderPages();
    if (msg.focusKey) { open.add(msg.focusKey); $('#search').value = ''; $('#page-filter').value = ''; }
    renderList();
    if (msg.focusKey) {
        const el = [...document.querySelectorAll('.card')].find(c => c.dataset.key === msg.focusKey);
        if (el) { el.classList.add('focus'); el.scrollIntoView({ block: 'center' }); el.querySelector('summary').focus(); }
    }
});

document.addEventListener('click', (event) => {
    const el = event.target.closest('button[data-command]');
    if (!el) return;
    event.preventDefault();
    post(el.dataset.command, { key: el.dataset.key });
});
for (const id of ['#search', '#page-filter', '#sort']) $(id).addEventListener('input', () => { renderList(); persist(); });
$('#guide').addEventListener('toggle', persist);
post('ready');
`;
        return renderPage({ cspSource, nonce: getNonce(), title: 'TestFly Action Cache', css, body, script });
    }
}
