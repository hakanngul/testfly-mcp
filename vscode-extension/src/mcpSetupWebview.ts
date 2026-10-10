import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpRegistrar, McpTarget } from './registrar';
import { getNonce } from './webviewUtils';
import { pageHeader, renderPage } from './webviewShell';

const TARGETS: McpTarget[] = ['antigravity', 'vscode', 'cursor'];

/** Where each assistant picks up newly registered servers. */
const NEXT_STEP: Record<McpTarget, string> = {
    antigravity: 'In Antigravity, open the Agent panel → MCP Servers → Refresh.',
    vscode: 'In VS Code, open .vscode/mcp.json and click Start above each server, or run "MCP: List Servers".',
    cursor: 'In Cursor, open Settings → MCP and enable the testfly and playwright servers.'
};

export class McpSetupWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, bundledBridge: string | undefined, getRoot: () => string | undefined, onChanged: () => void): void {
        if (McpSetupWebview.currentPanel) {
            McpSetupWebview.currentPanel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'testflyMcpSetup',
            'TestFly: MCP Setup',
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        McpSetupWebview.currentPanel = panel;
        panel.webview.html = McpSetupWebview.html(panel.webview.cspSource);
        panel.onDidDispose(() => { McpSetupWebview.currentPanel = undefined; }, null, context.subscriptions);

        const host = McpRegistrar.hostTarget(vscode.env.appName);
        let customBridge: string | undefined;
        let useCustom = !bundledBridge;

        const bridgeState = () => {
            const bridge = useCustom ? customBridge : bundledBridge;
            const valid = !!bridge && path.basename(bridge) === 'testfly-mcp.js' && fs.existsSync(bridge);
            return { bridge, valid };
        };

        const postState = (notice?: { kind: 'ok' | 'err'; title: string; lines?: string[] }) => {
            const root = getRoot();
            const { bridge, valid } = bridgeState();
            panel.webview.postMessage({
                type: 'state',
                notice,
                host,
                hasWorkspace: !!root,
                bridge: { bundled: bundledBridge, custom: customBridge, useCustom, path: bridge, valid },
                targets: TARGETS.map(t => {
                    const status = McpRegistrar.status(t, root);
                    const preview = McpRegistrar.preview(t, bridge || path.join('<select a bridge>', 'testfly-mcp.js'), root);
                    return { ...preview, registered: status.registered, bridgeExists: status.bridgeExists, registeredBridge: status.bridgePath };
                })
            });
        };

        panel.webview.onDidReceiveMessage(async (message) => {
            const root = getRoot();
            switch (message.command) {
                case 'ready':
                case 'refresh':
                    postState();
                    break;
                case 'useBundled':
                    useCustom = false;
                    postState();
                    break;
                case 'browse': {
                    const selected = await vscode.window.showOpenDialog({
                        title: 'Select your local testfly-mcp.js bridge script',
                        canSelectFiles: true,
                        canSelectMany: false,
                        filters: { JavaScript: ['js'] }
                    });
                    if (selected?.length) {
                        customBridge = selected[0].fsPath;
                        useCustom = true;
                    }
                    postState();
                    break;
                }
                case 'copy': {
                    const target = TARGETS.find(t => t === message.target);
                    const { bridge, valid } = bridgeState();
                    if (!target || !bridge || !valid) return;
                    await vscode.env.clipboard.writeText(McpRegistrar.preview(target, bridge, root).snippet);
                    panel.webview.postMessage({ type: 'copied', target });
                    break;
                }
                case 'openFile': {
                    const target = TARGETS.find(t => t === message.target);
                    if (!target) return;
                    const file = McpRegistrar.targetInfo(target, root).file;
                    if (fs.existsSync(file)) await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
                    break;
                }
                case 'apply': {
                    const { bridge, valid } = bridgeState();
                    const targets = TARGETS.filter(t => Array.isArray(message.targets) && message.targets.includes(t));
                    if (!bridge || !valid || targets.length === 0) return;
                    const infos = targets.map(t => McpRegistrar.targetInfo(t, root));
                    const confirm = await vscode.window.showWarningMessage(
                        `Write the TestFly and Playwright MCP servers to ${targets.length === 1 ? '1 file' : `${targets.length} files`}?`,
                        { modal: true, detail: infos.map(i => `• ${i.file}${i.global ? '  (user settings, all projects)' : ''}`).join('\n') + '\n\nOther server entries are kept.' },
                        'Apply'
                    );
                    if (confirm !== 'Apply') return;
                    try {
                        McpRegistrar.register(targets, bridge, root);
                        onChanged();
                        postState({
                            kind: 'ok',
                            title: `TestFly MCP is configured for ${infos.map(i => i.label).join(', ')}.`,
                            lines: targets.map(t => NEXT_STEP[t])
                        });
                    } catch (error: any) {
                        postState({ kind: 'err', title: 'Nothing was written.', lines: [error.message] });
                    }
                    break;
                }
            }
        });
    }

    private static html(cspSource: string): string {
        const body = `
${pageHeader('MCP Setup', 'Connect your AI assistant to the TestFly bridge and Playwright MCP in three steps.', `
    <button class="secondary" data-command="refresh">Refresh</button>`)}
<main>
    <div id="notice" class="callout" role="status" hidden></div>
    <div id="loading"><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="content" hidden>
        <section class="step" aria-labelledby="s1">
            <h2 id="s1"><span class="num" aria-hidden="true">1</span> Choose the bridge</h2>
            <p class="muted">The bridge is the small Node program your assistant starts to reach TestFly. Node.js must be on your PATH.</p>
            <div class="options" role="radiogroup" aria-label="Bridge">
                <label class="option" id="opt-bundled"><input type="radio" name="bridge" value="bundled">
                    <span><span class="target-head"><b>Bundled with this extension</b><span class="badge info">Recommended</span></span><code id="bundled-path"></code></span></label>
                <label class="option"><input type="radio" name="bridge" value="custom">
                    <span><span class="target-head"><b>Local checkout</b><span class="muted">for bridge development</span></span><code id="custom-path"></code>
                    <button class="secondary" type="button" data-command="browse">Browse…</button></span></label>
            </div>
            <p class="msg" id="bridge-msg" hidden></p>
        </section>

        <section class="step" aria-labelledby="s2">
            <h2 id="s2"><span class="num" aria-hidden="true">2</span> Pick the assistants</h2>
            <p class="muted">Each assistant reads its own file. Existing servers in those files are kept.</p>
            <div id="targets" class="targets"></div>
        </section>

        <section class="step" aria-labelledby="s3">
            <h2 id="s3"><span class="num" aria-hidden="true">3</span> Review and apply</h2>
            <p class="muted" id="review-empty">Select at least one assistant above.</p>
            <div id="previews"></div>
            <div class="apply-bar">
                <span class="muted" id="apply-summary"></span>
                <button id="apply" type="button" disabled>Apply</button>
            </div>
        </section>
    </div>
</main>`;

        const css = `
main { max-width: 860px; }
.step { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); padding: 10px 14px 12px; margin-bottom: 14px; }
.step h2 { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 0 0 2px; }
.step > p { margin: 0 0 10px; }
.num { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
.options, .targets { display: grid; gap: 8px; }
.option, .target { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--tf-border); border-radius: var(--tf-radius); cursor: pointer; }
.option:has(input:checked), .target:has(input:checked) { border-color: var(--vscode-focusBorder); }
.option input, .target input { margin-top: 2px; }
.option > span, .target > div { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.option code, .target code { font-size: 11px; overflow-wrap: anywhere; align-self: flex-start; }
.option.disabled { opacity: .6; cursor: default; }
.option button { align-self: flex-start; margin-top: 2px; }
.target.disabled { opacity: .6; cursor: default; }
.target-head { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.msg { font-size: 12px; margin: 6px 0 0; }
.msg.err { color: var(--tf-err); }
.preview { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); margin-bottom: 10px; }
.preview-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 10px; background: var(--tf-surface); border-bottom: 1px solid var(--tf-border); }
.preview pre { margin: 0; border-radius: 0; max-height: 260px; }
.preview .callout { margin: 8px 10px; }
.preview .note { padding: 6px 10px 0; font-size: 12px; }
.apply-bar { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
.callout ol { margin: 4px 0 0; padding-left: 18px; }
`;

        const script = `
const LABEL_FILE = { antigravity: 'User settings (all projects)', vscode: 'Workspace file', cursor: 'Workspace file' };
let state;
const saved = vscode.getState() || {};
let selected = saved.selected ? new Set(saved.selected) : null;
const full = new Set();

function statusBadge(t) {
    if (t.registered && t.bridgeExists) return h('span', { class: 'badge ok', text: '✓ Configured' });
    if (t.registered) return h('span', { class: 'badge warn', title: 'Points to ' + (t.registeredBridge || 'an unknown script') + ', which no longer exists', text: '! Bridge missing' });
    return h('span', { class: 'badge', text: 'Not set up' });
}

function renderBridge() {
    const b = state.bridge;
    const radios = document.querySelectorAll('input[name=bridge]');
    radios[0].disabled = !b.bundled;
    $('#opt-bundled').classList.toggle('disabled', !b.bundled);
    radios[0].checked = !b.useCustom;
    radios[1].checked = b.useCustom;
    $('#bundled-path').textContent = b.bundled || 'Not available in this build';
    $('#custom-path').textContent = b.custom || 'No file selected';
    const msg = $('#bridge-msg');
    msg.hidden = b.valid;
    msg.className = 'msg err';
    msg.textContent = b.path ? 'Select a file named testfly-mcp.js that exists on disk.' : 'Choose a bridge to continue.';
}

function renderTargets() {
    if (!selected) selected = new Set(state.targets.filter(t => t.target === state.host && !t.error).map(t => t.target));
    $('#targets').replaceChildren(...state.targets.map(t => {
        const unavailable = !state.hasWorkspace && LABEL_FILE[t.target] === 'Workspace file';
        if (unavailable) selected.delete(t.target);
        const input = h('input', { type: 'checkbox', value: t.target, checked: selected.has(t.target), disabled: unavailable, 'aria-describedby': 'tf-' + t.target });
        input.addEventListener('change', () => { input.checked ? selected.add(t.target) : selected.delete(t.target); vscode.setState({ selected: [...selected] }); renderPreviews(); });
        return h('label', { class: 'target' + (unavailable ? ' disabled' : '') }, input,
            h('div', { id: 'tf-' + t.target },
                h('span', { class: 'target-head' }, h('b', { text: t.label }),
                    t.target === state.host ? h('span', { class: 'badge info', text: 'This IDE' }) : null,
                    statusBadge(t)),
                h('span', { class: 'muted', text: unavailable ? 'Open a workspace folder to use this assistant.' : LABEL_FILE[t.target] }),
                h('code', { text: t.file })));
    }));
}

function renderPreviews() {
    const chosen = state.targets.filter(t => selected.has(t.target));
    $('#review-empty').hidden = chosen.length > 0;
    const bridgeOk = state.bridge.valid;
    $('#previews').replaceChildren(...chosen.map(t => {
        const showFull = full.has(t.target);
        const note = t.error ? null : !t.exists ? 'Creates this file.'
            : t.upToDate ? 'Already up to date; applying changes nothing.'
            : 'Adds or updates testfly and playwright' + (t.keptServers.length ? '; keeps ' + t.keptServers.join(', ') + '.' : '.');
        return h('div', { class: 'preview' },
            h('div', { class: 'preview-head' },
                h('b', { text: t.label }), h('code', { class: 'muted', text: t.file }),
                h('span', { class: 'push actions' },
                    t.exists ? h('button', { class: 'secondary', type: 'button', 'data-command': 'openFile', 'data-target': t.target, text: 'Open file' }) : null,
                    t.error ? null : h('button', { class: 'secondary', type: 'button', 'data-toggle': t.target, 'aria-pressed': String(showFull), text: showFull ? 'Show added servers' : 'Show whole file' }),
                    h('button', { class: 'secondary', type: 'button', 'data-command': 'copy', 'data-target': t.target, disabled: !bridgeOk || !!t.error, text: 'Copy JSON' }),
                    h('span', { class: 'flash', id: 'copied-' + t.target }))),
            t.error ? h('div', { class: 'callout err' }, h('strong', { text: 'Cannot configure ' + t.label }), t.error) : null,
            note ? h('p', { class: 'note muted', text: note }) : null,
            t.error ? null : h('pre', {}, h('code', { text: bridgeOk ? (showFull ? t.after : t.snippet) : 'Choose a bridge in step 1 to see the configuration.' })));
    }));
    const ready = chosen.filter(t => !t.error);
    const apply = $('#apply');
    apply.disabled = !bridgeOk || ready.length === 0;
    apply.textContent = ready.length > 1 ? 'Apply to ' + ready.length + ' files' : 'Apply';
    $('#apply-summary').textContent = !bridgeOk ? 'Choose a bridge first.'
        : ready.length === 0 ? (chosen.length ? 'Fix the errors above first.' : '')
        : chosen.length > ready.length ? (chosen.length - ready.length) + ' selected assistant(s) will be skipped.' : '';
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'copied') { flash($('#copied-' + msg.target), 'Copied'); return; }
    if (msg.type !== 'state') return;
    state = msg;
    $('#loading').hidden = true;
    $('#content').hidden = false;
    const notice = $('#notice');
    notice.hidden = !msg.notice;
    if (msg.notice) {
        notice.className = 'callout ' + msg.notice.kind;
        notice.replaceChildren(h('strong', { text: msg.notice.title }),
            msg.notice.lines && msg.notice.lines.length ? h(msg.notice.kind === 'ok' ? 'ol' : 'ul', {}, msg.notice.lines.map(l => h('li', { text: l }))) : null);
        announce(msg.notice.title);
        notice.scrollIntoView({ block: 'nearest' });
    }
    renderBridge();
    renderTargets();
    renderPreviews();
});

document.addEventListener('change', (event) => {
    if (event.target.name === 'bridge') post(event.target.value === 'bundled' ? 'useBundled' : 'browse');
});
document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) { event.preventDefault(); const t = toggle.dataset.toggle; full.has(t) ? full.delete(t) : full.add(t); renderPreviews(); return; }
    if (event.target.id === 'apply') { post('apply', { targets: state.targets.filter(t => selected.has(t.target) && !t.error).map(t => t.target) }); return; }
    const el = event.target.closest('button[data-command]');
    if (!el) return;
    event.preventDefault();
    post(el.dataset.command, { target: el.dataset.target });
});
post('ready');
`;
        return renderPage({ cspSource, nonce: getNonce(), title: 'TestFly MCP Setup', css, body, script });
    }
}
