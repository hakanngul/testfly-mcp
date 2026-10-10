import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_TESTFLY_YML } from './constants';
import { escapeHtml, getNonce } from './webviewUtils';
import { getValue, setValue, Scalar } from './yamlFields';
import { EXAMPLES, FIELDS, Field, SECTIONS, fieldKey, validate } from './configSchema';
import { pageHeader, renderPage } from './webviewShell';

function findConfig(root: string): string | undefined {
    return ['testfly.yml', 'testfly.yaml'].map(f => path.join(root, f)).find(f => fs.existsSync(f));
}

function readValues(yaml: string): Record<string, Scalar | undefined> {
    const values: Record<string, Scalar | undefined> = {};
    for (const field of FIELDS) {
        values[fieldKey(field)] = getValue(yaml, field.path);
    }
    return values;
}

export class ConfigWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, workspaceRoot: string, onChanged?: () => void): void {
        if (ConfigWebview.currentPanel) {
            ConfigWebview.currentPanel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyConfigVisual',
            'TestFly: testfly.yml',
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        ConfigWebview.currentPanel = panel;
        panel.webview.html = ConfigWebview.html(panel.webview.cspSource);

        /** @param saved key that was just written; @param failed a write that could not be made. */
        const postState = async (saved?: string, failed?: { key?: string; message: string }) => {
            const file = findConfig(workspaceRoot);
            if (!file) {
                panel.webview.postMessage({ type: 'state', exists: false, failed });
                return;
            }
            const doc = await vscode.workspace.openTextDocument(file);
            const values = readValues(doc.getText());
            panel.webview.postMessage({
                type: 'state',
                exists: true,
                fileName: path.basename(file),
                dirty: doc.isDirty,
                values,
                problems: validate(values),
                saved,
                failed
            });
        };

        const disposables: vscode.Disposable[] = [
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.fsPath === findConfig(workspaceRoot)) postState();
            }),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.uri.fsPath === findConfig(workspaceRoot)) postState();
            })
        ];
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRoot, 'testfly.{yml,yaml}'));
        watcher.onDidCreate(() => { postState(); onChanged?.(); });
        watcher.onDidDelete(() => { postState(); onChanged?.(); });
        disposables.push(watcher);

        panel.onDidDispose(() => {
            ConfigWebview.currentPanel = undefined;
            disposables.forEach(d => d.dispose());
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message) => {
            try {
                if (message.command === 'ready') {
                    await postState();
                } else if (message.command === 'create') {
                    fs.writeFileSync(path.join(workspaceRoot, 'testfly.yml'), DEFAULT_TESTFLY_YML, { encoding: 'utf8', flag: 'wx' });
                    onChanged?.();
                    await postState();
                } else if (message.command === 'openYaml') {
                    const file = findConfig(workspaceRoot);
                    if (file) await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.Beside });
                } else if (message.command === 'copy') {
                    await vscode.env.clipboard.writeText(String(message.text ?? ''));
                    panel.webview.postMessage({ type: 'copied', id: message.id });
                } else if (message.command === 'set') {
                    const file = findConfig(workspaceRoot);
                    const field = FIELDS.find(f => fieldKey(f) === message.key);
                    if (!file || !field) return;
                    const value = ConfigWebview.coerce(field, message.value);
                    if (value === undefined) {
                        await postState(undefined, { key: message.key, message: field.type === 'number' ? 'Enter a number. Clearing a value is done in the YAML.' : 'Clearing a value is done in the YAML.' });
                        return;
                    }
                    const doc = await vscode.workspace.openTextDocument(file);
                    const next = setValue(doc.getText(), field.path, value);
                    if (next === doc.getText()) return;
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), next);
                    // Saving keeps the form and the file in sync; the change stays undoable in the text editor.
                    if (await vscode.workspace.applyEdit(edit) && await doc.save()) {
                        await postState(message.key);
                    } else {
                        await postState(undefined, { key: message.key, message: `${path.basename(file)} could not be saved.` });
                    }
                }
            } catch (err: any) {
                await postState(undefined, { key: message.key, message: err.message });
            }
        });
    }

    private static coerce(field: Field, raw: unknown): Scalar | undefined {
        if (field.type === 'boolean') return raw === true;
        if (field.type === 'number') {
            const n = Number(raw);
            return raw === '' || !Number.isFinite(n) ? undefined : n;
        }
        const text = String(raw ?? '').trim();
        return text === '' ? undefined : text;
    }

    private static html(cspSource: string): string {
        const nav = SECTIONS.map(s => `<a href="#sec-${s.id}" class="chip" data-section="${s.id}">${escapeHtml(s.title)}<span class="chip-count" hidden></span></a>`).join('');
        const sections = SECTIONS.map(section => `
<section class="group" id="sec-${section.id}" aria-labelledby="h-${section.id}">
    <div class="group-head">
        <h2 id="h-${section.id}">${escapeHtml(section.title)}</h2>
        <p class="muted">${escapeHtml(section.description)}</p>
    </div>
    ${section.fields.map(f => ConfigWebview.fieldHtml(f)).join('')}
</section>`).join('');
        const examples = EXAMPLES.map((e, i) => `
<div class="example">
    <div class="example-head"><b>${escapeHtml(e.title)}</b> <span class="muted">${escapeHtml(e.description)}</span>
        <button class="secondary push" type="button" data-copy="${i}">Copy</button><span class="flash" id="copied-${i}"></span></div>
    <pre><code>${escapeHtml(e.yaml)}</code></pre>
</div>`).join('');

        const body = `
${pageHeader('testfly.yml', '<span id="status">Loading…</span> <span id="saved" class="flash" aria-hidden="true"></span>', `
    <button class="secondary" id="openYaml" data-command="openYaml" hidden>Open YAML</button>`)}
<main>
    <details class="guide" id="guide">
        <summary>Usage guide &amp; example configurations</summary>
        <div>
            <ol>
                <li><b>Basics first.</b> Pick a run mode and a browser and set the base URL; these, plus the two timeouts, are all TestFly needs to start.</li>
                <li><b>Changes save immediately</b> to the YAML file. Comments, ordering and keys this form does not show are kept.</li>
                <li><b>Fix red messages before running.</b> They are settings TestFly rejects at startup. Yellow ones are settings that would silently do nothing.</li>
                <li><b>Undo or clear a value</b> in the YAML (Open YAML, then <kbd>Ctrl/Cmd+Z</kbd>). Lists and maps such as <code>browser.matrix</code> are edited there too.</li>
                <li><b>Keep secrets out of the file.</b> Write <code>\${ANTHROPIC_API_KEY}</code> and put the value in your environment or <code>.env</code>.</li>
            </ol>
            <h2>Examples</h2>
            <p class="muted">Copy a block into testfly.yml and adjust it; matching keys replace the existing ones.</p>
            ${examples}
        </div>
    </details>
    <div id="loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="empty" class="empty" hidden>
        <h2>No testfly.yml in this workspace</h2>
        <p>TestFly reads its settings from <code>testfly.yml</code> in the project root. Start from the starter template and adjust it here.</p>
        <div class="actions"><button data-command="create">Create testfly.yml</button></div>
    </div>
    <div id="fail" class="callout err" role="alert" hidden></div>
    <div id="form" hidden>
        <nav class="chips" aria-label="Sections">${nav}</nav>
        <div id="summary" class="callout" hidden></div>
        ${sections}
    </div>
</main>`;

        const css = `
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; position: sticky; top: 0; padding: 6px 0; background: var(--vscode-editor-background); z-index: 1; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--tf-border); border-radius: 12px; color: var(--vscode-foreground); text-decoration: none; font-size: 12px; }
.chip:hover { background: var(--tf-hover); color: var(--vscode-foreground); }
.chip-count { font-weight: 600; }
.chip-count.err { color: var(--tf-err); }
.chip-count.warn { color: var(--tf-warn); }
.group { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); margin: 0 0 14px; padding: 4px 14px 6px; scroll-margin-top: 44px; max-width: 820px; }
.group-head { padding: 8px 0 4px; border-bottom: 1px solid var(--tf-border); margin-bottom: 4px; }
.group-head h2 { margin: 0; font-size: 14px; }
.group-head p { margin: 2px 0 0; }
.row { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 2px 14px; align-items: start; padding: 8px 0; scroll-margin-top: 60px; }
.row + .row { border-top: 1px dashed var(--tf-border); }
.row > label { padding-top: 3px; }
.row .key { display: block; font-family: var(--tf-mono); font-size: 11px; color: var(--tf-muted); overflow-wrap: anywhere; }
.row .req { color: var(--tf-err); margin-left: 2px; }
.control { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.control .check { display: flex; align-items: center; gap: 8px; min-height: 26px; }
.help { font-size: 12px; color: var(--tf-muted); }
.msg { font-size: 12px; display: flex; gap: 6px; }
.msg.err { color: var(--tf-err); }
.msg.warn { color: var(--tf-warn); }
.row.has-err input, .row.has-err select { border-color: var(--vscode-inputValidation-errorBorder, var(--tf-err)); }
.row.has-warn input, .row.has-warn select { border-color: var(--vscode-inputValidation-warningBorder, var(--tf-warn)); }
.row.just-saved { animation: tf-saved 1.2s ease-out; }
@keyframes tf-saved { from { background: var(--vscode-diffEditor-insertedLineBackground, rgba(46,160,67,.15)); } to { background: transparent; } }
.unset { font-style: italic; }
.example { margin: 8px 0 12px; }
.example-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#summary ul a { color: inherit; }
@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
`;

        const script = `
const FIELDS = ${JSON.stringify(FIELDS.map(f => ({ key: fieldKey(f), when: f.when, fallback: f.fallback, section: SECTIONS.find(s => s.fields.includes(f))!.id, label: f.label })))};
const EXAMPLES = ${JSON.stringify(EXAMPLES.map(e => e.yaml))};
const saved = vscode.getState() || {};
if (saved.guide) $('#guide').open = true;
let applying = false;
let values = {};

function rowOf(key) { return document.querySelector('.row[data-row="' + CSS.escape(key) + '"]'); }
function effective(key) { const f = FIELDS.find(x => x.key === key); return values[key] !== undefined ? values[key] : f && f.fallback; }

function applyVisibility() {
    for (const f of FIELDS) {
        if (!f.when) continue;
        const target = effective(f.when.key);
        const match = f.when.equals ? f.when.equals.includes(target) : target !== undefined && target !== '';
        rowOf(f.key).hidden = !match && values[f.key] === undefined;
    }
}

function showProblems(problems, failed) {
    document.querySelectorAll('.row').forEach(r => { r.classList.remove('has-err', 'has-warn'); r.querySelector('.msg').replaceChildren(); r.querySelector('.msg').hidden = true; });
    document.querySelectorAll('[data-key]').forEach(el => el.removeAttribute('aria-invalid'));
    const all = problems.slice();
    if (failed && failed.key) all.unshift({ key: failed.key, level: 'error', message: failed.message });
    const counts = {};
    for (const p of all) {
        const row = p.key && rowOf(p.key);
        if (!row) continue;
        row.hidden = false;
        const err = p.level === 'error';
        row.classList.add(err ? 'has-err' : 'has-warn');
        const msg = row.querySelector('.msg');
        msg.className = 'msg ' + (err ? 'err' : 'warn');
        msg.append(h('span', { 'aria-hidden': 'true', text: err ? '✕' : '!' }), h('span', { text: p.message }));
        msg.hidden = false;
        if (err) row.querySelector('[data-key]').setAttribute('aria-invalid', 'true');
        const section = FIELDS.find(f => f.key === p.key).section;
        counts[section] = counts[section] || { err: 0, warn: 0 };
        counts[section][err ? 'err' : 'warn']++;
    }
    document.querySelectorAll('.chip').forEach(chip => {
        const c = counts[chip.dataset.section];
        const badge = chip.querySelector('.chip-count');
        badge.hidden = !c;
        if (c) { badge.className = 'chip-count ' + (c.err ? 'err' : 'warn'); badge.textContent = '● ' + (c.err || c.warn); badge.title = (c.err ? c.err + ' errors ' : '') + (c.warn ? c.warn + ' warnings' : ''); }
    });

    const errors = problems.filter(p => p.level === 'error'), warnings = problems.filter(p => p.level === 'warning');
    const summary = $('#summary');
    summary.hidden = problems.length === 0;
    if (problems.length) {
        summary.className = 'callout ' + (errors.length ? 'err' : 'warn');
        const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
        const title = errors.length
            ? plural(errors.length, 'setting stops', 'settings stop') + ' TestFly from starting' + (warnings.length ? ' · ' + plural(warnings.length, 'warning', 'warnings') : '')
            : plural(warnings.length, 'setting needs', 'settings need') + ' attention';
        summary.replaceChildren(h('strong', { text: title }), h('ul', {}, [...errors, ...warnings].map(p => {
            const f = FIELDS.find(x => x.key === p.key);
            return h('li', {}, f ? h('a', { href: '#', 'data-focus': p.key, text: f.label }) : null, f ? ': ' : '', p.message);
        })));
    }
}

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'copied') { flash($('#copied-' + msg.id), 'Copied'); return; }
    if (msg.type !== 'state') return;
    $('#loading').hidden = true;
    $('#empty').hidden = msg.exists;
    $('#form').hidden = !msg.exists;
    $('#openYaml').hidden = !msg.exists;
    const fail = $('#fail');
    fail.hidden = !(msg.failed && !msg.failed.key);
    if (!fail.hidden) fail.replaceChildren(h('strong', { text: 'The change could not be saved' }), h('p', { text: msg.failed.message }));
    if (!msg.exists) { $('#status').textContent = 'No configuration file found.'; return; }
    $('#status').textContent = 'Editing ' + msg.fileName + (msg.dirty ? ' · has unsaved edits in the text editor' : ' · changes save automatically');

    values = msg.values;
    applying = true;
    document.querySelectorAll('[data-key]').forEach((el) => {
        const key = el.dataset.key;
        if (el === document.activeElement && el.type !== 'checkbox' && el.tagName !== 'SELECT') return;
        const value = values[key];
        const fallback = el.dataset.fallback;
        const unset = value === undefined;
        if (el.type === 'checkbox') {
            el.checked = unset ? fallback === 'true' : value === true;
        } else if (el.tagName === 'SELECT') {
            const text = unset ? '' : String(value);
            if (text && ![...el.options].some(o => o.value === text)) el.append(h('option', { value: text, text: text + ' (custom)' }));
            el.value = text;
        } else {
            el.value = unset ? '' : String(value);
        }
        el.classList.toggle('unset', unset);
        const state = rowOf(key).querySelector('.state');
        if (state) state.textContent = unset ? (fallback !== undefined ? 'Default' : '') : '';
    });
    applying = false;
    applyVisibility();
    showProblems(msg.problems, msg.failed);

    if (msg.saved) {
        const row = rowOf(msg.saved);
        if (row) { row.classList.remove('just-saved'); void row.offsetWidth; row.classList.add('just-saved'); }
        flash($('#saved'), 'Saved ✓');
    }
});

document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('change', () => {
        if (applying) return;
        post('set', { key: el.dataset.key, value: el.type === 'checkbox' ? el.checked : el.value });
    });
});
document.addEventListener('click', (event) => {
    const copy = event.target.closest('[data-copy]');
    if (copy) { post('copy', { id: copy.dataset.copy, text: EXAMPLES[Number(copy.dataset.copy)] }); return; }
    const focus = event.target.closest('[data-focus]');
    if (focus) {
        event.preventDefault();
        const row = rowOf(focus.dataset.focus);
        row.hidden = false;
        row.scrollIntoView({ block: 'center' });
        row.querySelector('[data-key]').focus();
        return;
    }
    const cmd = event.target.closest('button[data-command]');
    if (cmd) post(cmd.dataset.command);
});
$('#guide').addEventListener('toggle', () => vscode.setState({ guide: $('#guide').open }));
post('ready');
`;
        return renderPage({ cspSource, nonce: getNonce(), title: 'TestFly Configuration', css, body, script });
    }

    private static fieldHtml(field: Field): string {
        const key = fieldKey(field);
        const id = `f-${key.replace(/\./g, '-')}`;
        const helpId = `${id}-help`;
        const fallback = field.fallback === undefined ? '' : ` data-fallback="${escapeHtml(String(field.fallback))}"`;
        const describedBy = ` aria-describedby="${helpId} ${id}-msg"`;
        const required = /Required/.test(field.description ?? '');
        let control: string;
        if (field.type === 'select') {
            const def = field.fallback === undefined ? '— not set —' : `Default (${field.fallback})`;
            control = `<select id="${id}" data-key="${key}"${fallback}${describedBy}><option value="">${escapeHtml(def)}</option>${(field.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>`;
        } else if (field.type === 'boolean') {
            control = `<span class="check"><input type="checkbox" id="${id}" data-key="${key}"${fallback}${describedBy}><span class="muted state"></span></span>`;
        } else {
            // Placeholders only state defaults; an example value there is easily mistaken for a real one.
            const placeholder = field.fallback === undefined ? '' : ` placeholder="Default: ${escapeHtml(String(field.fallback))}"`;
            const extra = field.type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ' spellcheck="false" autocomplete="off"';
            control = `<input type="${field.type}" id="${id}" data-key="${key}"${fallback}${placeholder}${describedBy}${extra}>`;
        }
        const help = [field.description, field.example ? `e.g. ${field.example}` : '']
            .filter(Boolean).map(t => escapeHtml(t!)).join(' · ');
        const when = field.when ? ' data-when="1"' : '';
        return `
    <div class="row" data-row="${key}"${when}>
        <label for="${id}">${escapeHtml(field.label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}<span class="key">${escapeHtml(key)}</span></label>
        <div class="control">
            ${control}
            ${help ? `<span class="help" id="${helpId}">${help}</span>` : ''}
            <span class="msg" id="${id}-msg" hidden></span>
        </div>
    </div>`;
    }
}
