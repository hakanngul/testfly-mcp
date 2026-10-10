import * as vscode from 'vscode';
import * as path from 'path';
import { RemediationService, parsePatch } from './remediationService';
import { getNonce } from './webviewUtils';
import { pageHeader, renderPage } from './webviewShell';

type Notice = { kind: 'ok' | 'err'; text: string; fileName?: string };

export class PatchReviewerWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;
    private static workspaceRoot: string;
    private static onChanged: (() => void) | undefined;
    /** Bumped on every state push so stale "git apply --check" results are dropped. */
    private static generation = 0;

    /** @param onChanged called after a patch is applied or discarded, so sidebars can refresh. */
    public static show(context: vscode.ExtensionContext, workspaceRoot: string, onChanged?: () => void): void {
        PatchReviewerWebview.workspaceRoot = workspaceRoot;
        PatchReviewerWebview.onChanged = onChanged;
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (PatchReviewerWebview.currentPanel) {
            PatchReviewerWebview.currentPanel.reveal(column);
            PatchReviewerWebview.postState();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyPatchReviewer',
            'TestFly: Self-Healing Patches',
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        PatchReviewerWebview.currentPanel = panel;
        panel.webview.html = PatchReviewerWebview.html(panel.webview.cspSource);

        panel.onDidDispose(() => {
            PatchReviewerWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message) => {
            const root = PatchReviewerWebview.workspaceRoot;
            switch (message.command) {
                case 'ready':
                case 'refresh':
                    PatchReviewerWebview.postState();
                    return;
                case 'openReport':
                    await vscode.commands.executeCommand('testfly.openReport');
                    return;
                case 'openApplied': {
                    const applied = RemediationService.resolveApplied(root, message.fileName);
                    if (applied) await vscode.window.showTextDocument(vscode.Uri.file(applied), { preview: true });
                    return;
                }
                case 'openTarget': {
                    const target = path.join(root, message.targetPath || '');
                    if (!message.targetPath || !target.startsWith(root + path.sep)) return;
                    const line = Math.max(0, Number(message.line || 1) - 1);
                    try {
                        await vscode.window.showTextDocument(vscode.Uri.file(target), {
                            preview: true,
                            selection: new vscode.Range(line, 0, line, 0)
                        });
                    } catch {
                        vscode.window.showWarningMessage(`TestFly: ${message.targetPath} does not exist in this workspace.`);
                    }
                    return;
                }
            }

            const patchPath = RemediationService.resolvePatch(root, message.fileName);
            if (!patchPath) {
                PatchReviewerWebview.postState({ kind: 'err', text: `${message.fileName} no longer exists.` });
                return;
            }
            if (message.command === 'apply') {
                await PatchReviewerWebview.apply(root, patchPath);
            } else if (message.command === 'open') {
                await vscode.window.showTextDocument(vscode.Uri.file(patchPath), { preview: true });
            } else if (message.command === 'discard') {
                const confirm = await vscode.window.showWarningMessage(
                    `Discard ${message.fileName}?`,
                    { modal: true, detail: 'The patch file is moved to the trash. Your source code is not changed.' },
                    'Discard'
                );
                if (confirm !== 'Discard') return;
                await vscode.workspace.fs.delete(vscode.Uri.file(patchPath), { useTrash: true });
                PatchReviewerWebview.changed({ kind: 'ok', text: `Discarded ${message.fileName}.` });
            }
        });
    }

    /** Push fresh data if the panel is open (e.g. after target/remediations changed on disk). */
    public static refresh(): void {
        PatchReviewerWebview.postState();
    }

    private static async apply(root: string, patchPath: string): Promise<void> {
        const fileName = path.basename(patchPath);
        const confirm = await vscode.window.showWarningMessage(
            `Apply ${fileName} to your source files?`,
            { modal: true, detail: 'The patch is checked with "git apply --check" first. On success it is moved to target/remediations/applied/, and the change shows up in Source Control where you can review or revert it.' },
            'Apply patch'
        );
        if (confirm !== 'Apply patch') return;
        PatchReviewerWebview.post({ type: 'busy', fileName });
        const res = await RemediationService.applyPatch(root, patchPath);
        if (!res.success) {
            PatchReviewerWebview.postState({ kind: 'err', text: res.message, fileName });
            return;
        }
        let text = `Applied ${fileName}. Review the change in Source Control before committing.`;
        try {
            RemediationService.archiveApplied(root, patchPath);
        } catch (err: any) {
            text += ` It could not be moved to applied/: ${err.message}`;
        }
        PatchReviewerWebview.changed({ kind: 'ok', text });
    }

    private static changed(notice: Notice): void {
        PatchReviewerWebview.postState(notice);
        PatchReviewerWebview.onChanged?.();
    }

    private static post(message: unknown): void {
        PatchReviewerWebview.currentPanel?.webview.postMessage(message);
    }

    private static postState(notice?: Notice): void {
        if (!PatchReviewerWebview.currentPanel) return;
        const root = PatchReviewerWebview.workspaceRoot;
        const generation = ++PatchReviewerWebview.generation;
        const patches = RemediationService.listPatches(root);
        PatchReviewerWebview.post({
            type: 'state',
            notice,
            patches: patches.map(p => ({
                fileName: p.fileName,
                createdAt: p.createdAt?.getTime(),
                files: parsePatch(p.content),
                raw: p.content,
                context: RemediationService.failureContext(root, p.fileName)
            })),
            applied: RemediationService.listApplied(root).slice(0, 20).map(a => ({ fileName: a.fileName, appliedAt: a.appliedAt.getTime() }))
        });
        // Checks run after the first paint; each result updates its card's status badge.
        (async () => {
            for (const p of patches) {
                const result = await RemediationService.checkPatch(root, p.filePath);
                if (generation !== PatchReviewerWebview.generation) return;
                PatchReviewerWebview.post({ type: 'check', fileName: p.fileName, ...result });
            }
        })();
    }

    private static html(cspSource: string): string {
        const body = `
${pageHeader('Self-Healing Patches', 'AI-suggested fixes for failed tests · <code>target/remediations/</code>', `
    <button class="secondary" data-command="refresh">Refresh</button>`)}
<main>
    <details class="guide" id="guide">
        <summary>How patch review works</summary>
        <div>
            <ol>
                <li><b>A test fails.</b> With <code>ai.generatePatch</code> on, TestFly asks the AI for a fix and writes it as a unified diff to <code>target/remediations/&lt;test&gt;.patch</code>.</li>
                <li><b>Review it here.</b> <i>Why</i> shows the recorded failure, <i>Affected code</i> links to the changed lines, and the diff shows the code before and after.</li>
                <li><b>Apply or discard.</b> The status badge tells you whether the patch still applies to your current code. Applying runs <code>git apply</code> and moves the file to <code>applied/</code>; the change then appears in Source Control.</li>
            </ol>
            <p class="muted">Enable patches in <code>testfly.yml</code> (an AI provider and API key are required):</p>
            <pre><code>ai:
  failureAnalysis: true   # adds the AI's explanation under "Why"
  generatePatch: true</code></pre>
        </div>
    </details>
    <div id="notice" class="callout" role="status" hidden></div>
    <div id="loading"><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="empty" class="empty" hidden>
        <h2>No patches waiting for review</h2>
        <p>When a test fails and AI patch generation is enabled, the suggested fix appears here automatically.</p>
        <pre><code>ai:
  generatePatch: true
locators:
  aiHealing: true</code></pre>
    </div>
    <div id="list"></div>
    <details class="guide" id="applied-area" hidden>
        <summary id="applied-title">Applied patches</summary>
        <div><div class="table-wrap"><table><tbody id="applied"></tbody></table></div></div>
    </details>
</main>`;

        const css = `
.section { margin: 0 0 12px; }
.section > h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--tf-muted); margin-bottom: 4px; }
.why dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; }
.why dt { color: var(--tf-muted); }
.why dd { margin: 0; overflow-wrap: anywhere; }
.why pre { max-height: 160px; white-space: pre-wrap; }
.locations { margin: 0; padding-left: 18px; }
.view-toggle { display: inline-flex; border: 1px solid var(--tf-border); border-radius: 3px; overflow: hidden; }
.view-toggle button { border: 0; border-radius: 0; min-height: 22px; padding: 2px 10px; color: var(--vscode-foreground); background: transparent; }
.view-toggle button[aria-pressed="true"] { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
.diff-file { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); margin: 6px 0 10px; overflow: hidden; }
.diff-file > .file-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 10px; background: var(--tf-surface); border-bottom: 1px solid var(--tf-border); font-family: var(--tf-mono); font-size: 12px; }
.diff { width: 100%; border-collapse: collapse; font-family: var(--tf-mono); font-size: var(--vscode-editor-font-size, 12px); line-height: 1.5; table-layout: fixed; }
.diff td { border: 0; padding: 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; vertical-align: top; }
.diff col.c-ln { width: 44px; }
.diff col.c-sign { width: 16px; }
.diff th { font-family: var(--vscode-font-family); padding: 4px 8px; }
.diff td.ln { text-align: right; color: var(--tf-muted); user-select: none; padding-right: 6px; }
.diff td.sign { padding: 0 2px; user-select: none; color: var(--tf-muted); }
.diff .add { background: var(--vscode-diffEditor-insertedLineBackground, rgba(46,160,67,.15)); }
.diff .del { background: var(--vscode-diffEditor-removedLineBackground, rgba(248,81,73,.15)); }
.diff .hunk td { color: var(--vscode-textLink-foreground); background: var(--tf-surface); padding-top: 2px; padding-bottom: 2px; }
.diff .gap { background: var(--tf-surface); }
.split .mid { border-left: 1px solid var(--tf-border); }
.counts .add-n { color: var(--vscode-gitDecoration-addedResourceForeground, var(--tf-ok)); }
.counts .del-n { color: var(--vscode-gitDecoration-deletedResourceForeground, var(--tf-err)); }
.card-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--tf-border); }
`;

        const script = `
const saved = vscode.getState() || {};
let view = saved.view || 'split';
const closed = new Set(saved.closed || []);
const status = new Map();
const errors = new Map();
let patches = [];
if (saved.guide) $('#guide').open = true;
function persist() { vscode.setState({ view, closed: [...closed], guide: $('#guide').open }); }

function relative(ms) {
    if (!ms) return '';
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.floor(m / 60) + ' h ago';
    return Math.floor(m / 1440) + ' d ago';
}
const fileOf = (f) => f.newPath || f.oldPath || 'unknown file';

function statusBadge(fileName) {
    const s = status.get(fileName);
    if (!s) return h('span', { class: 'badge', 'data-status': fileName, text: 'Checking…' });
    return h('span', { class: 'badge ' + (s.ok ? 'ok' : 'err'), 'data-status': fileName, title: s.message, text: s.ok ? '✓ Applies cleanly' : '✕ Does not apply' });
}

function whySection(p) {
    const c = p.context;
    if (!c) {
        return h('div', { class: 'section why' }, h('h2', { text: 'Why' }),
            h('p', { class: 'muted' }, 'No failure was recorded for this test in testfly-metrics.json, so the reason is unknown. ',
                h('button', { class: 'link', type: 'button', 'data-command': 'openReport', text: 'Open test report' })));
    }
    return h('div', { class: 'section why' }, h('h2', { text: 'Why' }),
        h('dl', {},
            h('dt', { text: 'Test' }), h('dd', {}, h('code', { text: c.testId })),
            c.status ? [h('dt', { text: 'Result' }), h('dd', {}, h('span', { class: 'badge ' + (c.status === 'PASSED' ? 'ok' : 'err'), text: c.status }), c.browser ? ' on ' + c.browser : '')] : null,
            c.errorMessage ? [h('dt', { text: 'Error' }), h('dd', {}, h('pre', { text: c.errorMessage }))] : null,
            c.aiAnalysis ? [h('dt', { text: 'AI analysis' }), h('dd', { text: c.aiAnalysis })] : null
        ),
        c.aiAnalysis ? null : h('p', { class: 'muted', text: 'Turn on ai.failureAnalysis to get the AI\\'s explanation here.' })
    );
}

function locations(p) {
    return h('div', { class: 'section' }, h('h2', { text: 'Affected code' }),
        h('ul', { class: 'locations' }, p.files.flatMap(f => f.hunks.map(hk => {
            const end = hk.newStart + Math.max(hk.newLines, 1) - 1;
            const label = fileOf(f).split('/').pop() + ' · ' + (end > hk.newStart ? 'lines ' + hk.newStart + '–' + end : 'line ' + hk.newStart);
            return h('li', {},
                h('a', { href: '#', 'data-command': 'openTarget', 'data-target': fileOf(f), 'data-line': hk.newStart, title: fileOf(f), text: label }),
                hk.section ? h('span', { class: 'muted' }, ' in ', h('code', { text: hk.section })) : null);
        })))
    );
}

// table-layout: fixed takes widths from the first row, so pin them with a colgroup.
function cols(kinds) { return h('colgroup', {}, kinds.map(k => h('col', { class: 'c-' + k }))); }
function row(cls, cells) { return h('tr', { class: cls }, cells); }
function td(cls, text) { return h('td', { class: cls, text: text === undefined ? '' : text }); }

function unifiedTable(f) {
    const rows = [];
    for (const hk of f.hunks) {
        rows.push(row('hunk', [h('td', { colspan: 4, text: '@@ -' + hk.oldStart + ' +' + hk.newStart + ' @@ ' + hk.section })]));
        let o = hk.oldStart, n = hk.newStart;
        for (const l of hk.lines) {
            if (l.kind === '-') rows.push(row('del', [td('ln', o++), td('ln', ''), td('sign', '−'), td('code', l.text)]));
            else if (l.kind === '+') rows.push(row('add', [td('ln', ''), td('ln', n++), td('sign', '+'), td('code', l.text)]));
            else rows.push(row('', [td('ln', o++), td('ln', n++), td('sign', ''), td('code', l.text)]));
        }
    }
    return h('table', { class: 'diff unified' }, cols(['ln', 'ln', 'sign', 'code']), h('tbody', {}, rows));
}

function splitTable(f) {
    const rows = [row('', [h('th', { colspan: 3, scope: 'col', text: 'Before' }), h('th', { colspan: 3, scope: 'col', class: 'mid', text: 'After' })])];
    for (const hk of f.hunks) {
        rows.push(row('hunk', [h('td', { colspan: 6, text: '@@ -' + hk.oldStart + ' +' + hk.newStart + ' @@ ' + hk.section })]));
        let o = hk.oldStart, n = hk.newStart;
        const lines = hk.lines;
        for (let i = 0; i < lines.length;) {
            if (lines[i].kind === ' ') {
                rows.push(row('', [td('ln', o++), td('sign', ''), td('code', lines[i].text), h('td', { class: 'ln mid', text: n++ }), td('sign', ''), td('code', lines[i].text)]));
                i++;
                continue;
            }
            const dels = [], adds = [];
            while (i < lines.length && lines[i].kind === '-') dels.push(lines[i++]);
            while (i < lines.length && lines[i].kind === '+') adds.push(lines[i++]);
            for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
                const d = dels[k], a = adds[k];
                rows.push(h('tr', {},
                    d ? [td('ln del', o++), td('sign del', '−'), td('code del', d.text)] : [td('ln gap'), td('sign gap'), td('code gap')],
                    a ? [h('td', { class: 'ln mid add', text: n++ }), td('sign add', '+'), td('code add', a.text)] : [h('td', { class: 'ln mid gap' }), td('sign gap'), td('code gap')]
                ));
            }
        }
    }
    return h('table', { class: 'diff split' }, cols(['ln', 'sign', 'code', 'ln', 'sign', 'code']), h('tbody', {}, rows));
}

function changes(p) {
    const toggle = h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Diff layout' },
        h('button', { type: 'button', 'data-view': 'split', 'aria-pressed': String(view === 'split'), text: 'Before / after' }),
        h('button', { type: 'button', 'data-view': 'unified', 'aria-pressed': String(view === 'unified'), text: 'Unified' }));
    const parsed = p.files.length > 0;
    return h('div', { class: 'section' },
        h('div', { class: 'actions', style: 'justify-content: space-between; margin-bottom: 4px' }, h('h2', { text: 'Changes', style: 'margin:0' }), parsed ? toggle : null),
        parsed ? p.files.map(f => h('div', { class: 'diff-file' },
            h('div', { class: 'file-head' },
                h('a', { href: '#', 'data-command': 'openTarget', 'data-target': fileOf(f), 'data-line': f.hunks[0] ? f.hunks[0].newStart : 1, text: fileOf(f) }),
                h('span', { class: 'counts' }, h('span', { class: 'add-n', text: '+' + f.added }), ' ', h('span', { class: 'del-n', text: '−' + f.removed }))),
            h('div', { class: 'table-wrap' }, view === 'split' ? splitTable(f) : unifiedTable(f))))
        : [h('div', { class: 'callout warn' }, h('strong', { text: 'This file is not a unified diff' }), 'git apply will most likely reject it. Raw content:'), h('pre', { text: p.raw })]
    );
}

function card(p) {
    const added = p.files.reduce((n, f) => n + f.added, 0), removed = p.files.reduce((n, f) => n + f.removed, 0);
    const title = p.context ? p.context.testId : p.fileName.replace(/\\.patch$/, '');
    const el = h('details', { class: 'card', 'data-file': p.fileName, open: !closed.has(p.fileName) },
        h('summary', {},
            h('span', { class: 'card-title', text: title }),
            statusBadge(p.fileName),
            h('span', { class: 'counts card-meta' },
                h('span', {}, h('span', { class: 'add-n', text: '+' + added }), ' ', h('span', { class: 'del-n', text: '−' + removed })),
                h('span', { text: p.files.length + (p.files.length === 1 ? ' file' : ' files') }),
                h('span', { title: p.createdAt ? new Date(p.createdAt).toLocaleString() : '', text: relative(p.createdAt) }))
        ),
        h('div', { class: 'card-body' },
            errors.has(p.fileName) ? h('div', { class: 'callout err', 'data-error': p.fileName, role: 'alert' },
                h('strong', { text: 'The patch could not be applied' }), h('pre', { text: errors.get(p.fileName) }),
                h('p', { text: 'Your code has probably changed since the patch was generated. Edit the file by hand using the diff below, or discard the patch and re-run the test.' })) : null,
            whySection(p),
            p.files.length ? locations(p) : null,
            changes(p),
            h('div', { class: 'card-actions' },
                h('button', { class: 'secondary', type: 'button', 'data-command': 'open', 'data-file': p.fileName, text: 'Open .patch' }),
                h('button', { class: 'danger', type: 'button', 'data-command': 'discard', 'data-file': p.fileName, text: 'Discard…' }),
                h('button', { type: 'button', 'data-command': 'apply', 'data-file': p.fileName, text: 'Apply patch…' }))
        )
    );
    el.addEventListener('toggle', () => { el.open ? closed.delete(p.fileName) : closed.add(p.fileName); persist(); });
    return el;
}

function render() {
    const scroll = window.scrollY;
    $('#list').replaceChildren(...patches.map(card));
    window.scrollTo(0, scroll);
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'check') {
        status.set(msg.fileName, msg);
        const badge = document.querySelector('[data-status="' + CSS.escape(msg.fileName) + '"]');
        if (badge) badge.replaceWith(statusBadge(msg.fileName));
        return;
    }
    if (msg.type === 'busy') {
        const btn = document.querySelector('button[data-command="apply"][data-file="' + CSS.escape(msg.fileName) + '"]');
        if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Applying…'; }
        return;
    }
    if (msg.type !== 'state') return;
    patches = msg.patches;
    for (const key of [...status.keys()]) if (!patches.some(p => p.fileName === key)) status.delete(key);
    $('#loading').hidden = true;
    $('#empty').hidden = patches.length > 0;
    $('#page-sub').replaceChildren(patches.length + (patches.length === 1 ? ' patch' : ' patches') + ' waiting for review · ', h('code', { text: 'target/remediations/' }));

    const notice = $('#notice');
    const cardError = msg.notice && msg.notice.kind === 'err' && msg.notice.fileName && patches.some(p => p.fileName === msg.notice.fileName);
    notice.hidden = !msg.notice || cardError;
    if (msg.notice && !cardError) { notice.className = 'callout ' + msg.notice.kind; notice.textContent = msg.notice.text; }
    for (const key of [...errors.keys()]) if (!patches.some(p => p.fileName === key)) errors.delete(key);
    if (cardError) { errors.set(msg.notice.fileName, msg.notice.text); closed.delete(msg.notice.fileName); }
    render();
    if (cardError) {
        const box = document.querySelector('[data-error="' + CSS.escape(msg.notice.fileName) + '"]');
        if (box) box.scrollIntoView({ block: 'center' });
    }
    if (msg.notice) announce(msg.notice.text);

    $('#applied-area').hidden = msg.applied.length === 0;
    $('#applied-title').textContent = 'Applied patches (' + msg.applied.length + ')';
    $('#applied').replaceChildren(...msg.applied.map(a => h('tr', {},
        h('td', {}, h('a', { href: '#', 'data-command': 'openApplied', 'data-file': a.fileName, text: a.fileName })),
        h('td', { class: 'muted', text: new Date(a.appliedAt).toLocaleString() }))));
});

document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-view]');
    if (toggle) { view = toggle.dataset.view; persist(); render(); return; }
    const el = event.target.closest('[data-command]');
    if (!el) return;
    event.preventDefault();
    post(el.dataset.command, { fileName: el.dataset.file, targetPath: el.dataset.target, line: el.dataset.line });
});
$('#guide').addEventListener('toggle', persist);
post('ready');
`;
        return renderPage({ cspSource, nonce: getNonce(), title: 'TestFly Self-Healing Patches', css, body, script });
    }
}
