import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_TESTFLY_YML } from './constants';
import { escapeHtml, getNonce } from './webviewUtils';
import { getValue, setValue, Scalar } from './yamlFields';

type FieldType = 'select' | 'text' | 'number' | 'boolean';

interface Field {
    path: string[];
    label: string;
    type: FieldType;
    options?: string[];
    hint?: string;
    /** Value TestFly uses when the key is absent. */
    fallback?: Scalar;
}

interface Section {
    title: string;
    fields: Field[];
}

// Allowed values and defaults follow io.testfly.config.TestFlyConfig / ConfigurationLoader.
const SECTIONS: Section[] = [
    {
        title: 'Execution',
        fields: [
            { path: ['execution', 'mode'], label: 'Mode', type: 'select', options: ['local', 'remote', 'browserstack', 'saucelabs'], hint: 'Required.' },
            { path: ['execution', 'baseUrl'], label: 'Base URL', type: 'text', hint: 'open("/path") is resolved against this. ${ENV_VAR} is supported.' },
            { path: ['execution', 'gridUrl'], label: 'Grid URL', type: 'text', hint: 'Required when mode is remote.' },
            { path: ['execution', 'parallel'], label: 'Parallel', type: 'select', options: ['none', 'methods', 'classes', 'tests', 'instances'], fallback: 'none' },
            { path: ['execution', 'threadCount'], label: 'Thread count', type: 'number', fallback: 1, hint: '1 to CPU cores × 2.' },
            { path: ['execution', 'maxActiveSessions'], label: 'Max active sessions', type: 'number', fallback: 5 }
        ]
    },
    {
        title: 'Browser',
        fields: [
            { path: ['browser', 'name'], label: 'Browser', type: 'select', options: ['chrome', 'firefox', 'edge', 'safari'], hint: 'Required unless browser.matrix is set.' },
            { path: ['browser', 'headless'], label: 'Headless', type: 'boolean', fallback: false },
            { path: ['browser', 'lifecycle'], label: 'Driver lifecycle', type: 'select', options: ['per-test', 'per-suite'], fallback: 'per-test' }
        ]
    },
    {
        title: 'Timeouts (seconds)',
        fields: [
            { path: ['timeouts', 'explicit'], label: 'Explicit wait', type: 'number', hint: 'Required, > 0.' },
            { path: ['timeouts', 'pageLoad'], label: 'Page load', type: 'number', hint: 'Required, > 0.' }
        ]
    },
    {
        title: 'Reporting',
        fields: [
            { path: ['reporting', 'htmlReport'], label: 'HTML report', type: 'boolean', fallback: true },
            { path: ['reporting', 'allure', 'enabled'], label: 'Allure results', type: 'boolean', fallback: false }
        ]
    },
    {
        title: 'AI',
        fields: [
            { path: ['ai', 'enabled'], label: 'AI features enabled', type: 'boolean', fallback: true, hint: 'Master switch for the options below.' },
            { path: ['ai', 'provider'], label: 'Provider', type: 'select', options: ['claude', 'openai', 'gemini'], fallback: 'claude' },
            { path: ['ai', 'model'], label: 'Model', type: 'text', hint: 'Leave empty for the provider default.' },
            { path: ['ai', 'failureAnalysis'], label: 'Failure analysis', type: 'boolean', fallback: false },
            { path: ['ai', 'generatePatch'], label: 'Generate healing patches', type: 'boolean', fallback: false, hint: 'Writes target/remediations/*.patch.' }
        ]
    },
    {
        title: 'Locators',
        fields: [
            { path: ['locators', 'selfHealing'], label: 'Self-healing', type: 'boolean', fallback: false },
            { path: ['locators', 'aiHealing'], label: 'AI healing', type: 'boolean', fallback: false }
        ]
    }
];

function findConfig(root: string): string | undefined {
    return ['testfly.yml', 'testfly.yaml'].map(f => path.join(root, f)).find(f => fs.existsSync(f));
}

function readValues(yaml: string): Record<string, Scalar | undefined> {
    const values: Record<string, Scalar | undefined> = {};
    for (const field of SECTIONS.flatMap(s => s.fields)) {
        values[field.path.join('.')] = getValue(yaml, field.path);
    }
    return values;
}

function validate(values: Record<string, Scalar | undefined>): string[] {
    const problems: string[] = [];
    if (!values['execution.mode']) problems.push('execution.mode is required.');
    if (values['execution.mode'] === 'remote' && !values['execution.gridUrl']) problems.push('execution.gridUrl is required for remote mode.');
    if (!values['browser.name']) problems.push('browser.name is required (unless you use browser.matrix).');
    for (const key of ['timeouts.explicit', 'timeouts.pageLoad']) {
        const v = values[key];
        if (typeof v !== 'number' || v <= 0) problems.push(`${key} must be a number greater than 0.`);
    }
    const threads = values['execution.threadCount'];
    if (threads !== undefined && (typeof threads !== 'number' || threads < 1)) problems.push('execution.threadCount must be at least 1.');
    const aiOff = values['ai.enabled'] === false;
    if (aiOff && (values['ai.failureAnalysis'] === true || values['ai.generatePatch'] === true || values['locators.aiHealing'] === true)) {
        problems.push('ai.enabled is false, so failure analysis, patch generation and AI healing will not run.');
    }
    return problems;
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

        const nonce = getNonce();
        panel.webview.html = ConfigWebview.html(nonce, panel.webview.cspSource);

        const postState = async () => {
            const file = findConfig(workspaceRoot);
            if (!file) {
                panel.webview.postMessage({ type: 'state', exists: false });
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
                problems: validate(values)
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
                } else if (message.command === 'set') {
                    const file = findConfig(workspaceRoot);
                    const field = SECTIONS.flatMap(s => s.fields).find(f => f.path.join('.') === message.key);
                    if (!file || !field) return;
                    const value = ConfigWebview.coerce(field, message.value);
                    if (value === undefined) {
                        await postState();
                        return;
                    }
                    const doc = await vscode.workspace.openTextDocument(file);
                    const next = setValue(doc.getText(), field.path, value);
                    if (next === doc.getText()) return;
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), next);
                    // Saving keeps the form and the file in sync; the change stays undoable in the text editor.
                    if (await vscode.workspace.applyEdit(edit)) await doc.save();
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`TestFly: ${err.message}`);
                await postState();
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

    private static html(nonce: string, cspSource: string): string {
        const sections = SECTIONS.map(section => `
            <fieldset>
                <legend>${escapeHtml(section.title)}</legend>
                ${section.fields.map(f => ConfigWebview.fieldHtml(f)).join('')}
            </fieldset>`).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TestFly Configuration</title>
<style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); max-width: 760px; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid var(--vscode-widget-border, transparent); padding-bottom: 12px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .sub { margin: 4px 0 0; color: var(--vscode-descriptionForeground); }
    button { padding: 4px 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font: inherit; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    fieldset { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; margin: 0 0 14px; padding: 8px 14px 4px; }
    legend { font-weight: 600; padding: 0 6px; }
    .row { display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px; align-items: center; padding: 6px 0; }
    .row label { color: var(--vscode-foreground); }
    .key { display: block; font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); }
    .hint { grid-column: 2; font-size: 12px; color: var(--vscode-descriptionForeground); }
    input[type=text], input[type=number], select { width: 100%; box-sizing: border-box; padding: 4px 6px; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
    select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
    input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--vscode-button-background); }
    .unset { font-style: italic; }
    .problems { margin: 0 0 14px; padding: 8px 12px; border-left: 3px solid var(--vscode-editorWarning-foreground); background: var(--vscode-inputValidation-warningBackground, transparent); }
    .problems ul { margin: 4px 0 0; padding-left: 18px; }
    .empty { margin: 40px auto; max-width: 480px; text-align: center; color: var(--vscode-descriptionForeground); }
    [hidden] { display: none !important; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } .hint { grid-column: 1; } }
</style>
</head>
<body>
<div class="top">
    <div>
        <h1>TestFly configuration</h1>
        <p class="sub" id="status">Loading…</p>
    </div>
    <button class="secondary" id="openYaml" hidden>Open YAML</button>
</div>
<div id="empty" class="empty" hidden>
    <p>No <code>testfly.yml</code> in this workspace.</p>
    <button id="create">Create testfly.yml from starter template</button>
</div>
<div id="form" hidden>
    <div id="problems" class="problems" hidden><strong>Check these before running tests:</strong><ul></ul></div>
    ${sections}
</div>
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    let applying = false;

    document.getElementById('create').addEventListener('click', () => vscode.postMessage({ command: 'create' }));
    document.getElementById('openYaml').addEventListener('click', () => vscode.postMessage({ command: 'openYaml' }));

    document.querySelectorAll('[data-key]').forEach((el) => {
        el.addEventListener('change', () => {
            if (applying) return;
            const value = el.type === 'checkbox' ? el.checked : el.value;
            vscode.postMessage({ command: 'set', key: el.dataset.key, value });
        });
    });

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type !== 'state') return;
        $('empty').hidden = msg.exists;
        $('form').hidden = !msg.exists;
        $('openYaml').hidden = !msg.exists;
        if (!msg.exists) { $('status').textContent = 'No configuration file found.'; return; }
        $('status').textContent = 'Editing ' + msg.fileName + ' — changes are saved as you make them.';

        applying = true;
        document.querySelectorAll('[data-key]').forEach((el) => {
            const key = el.dataset.key;
            const value = msg.values[key];
            const fallback = el.dataset.fallback;
            const unset = value === undefined;
            if (el.type === 'checkbox') {
                el.checked = unset ? fallback === 'true' : value === true;
            } else if (el.tagName === 'SELECT') {
                const text = unset ? '' : String(value);
                if (text && ![...el.options].some(o => o.value === text)) {
                    const custom = document.createElement('option');
                    custom.value = text; custom.textContent = text + ' (custom)';
                    el.appendChild(custom);
                }
                el.value = text;
            } else {
                el.value = unset ? '' : String(value);
            }
            el.classList.toggle('unset', unset);
        });
        applying = false;

        const problems = $('problems');
        problems.hidden = msg.problems.length === 0;
        problems.querySelector('ul').innerHTML = '';
        msg.problems.forEach((p) => {
            const li = document.createElement('li');
            li.textContent = p;
            problems.querySelector('ul').appendChild(li);
        });
    });

    vscode.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
    }

    private static fieldHtml(field: Field): string {
        const key = field.path.join('.');
        const id = `f-${key.replace(/\./g, '-')}`;
        const fallback = field.fallback === undefined ? '' : ` data-fallback="${escapeHtml(String(field.fallback))}"`;
        let control: string;
        if (field.type === 'select') {
            const def = field.fallback === undefined ? '— not set —' : `— default (${field.fallback}) —`;
            control = `<select id="${id}" data-key="${key}"${fallback}><option value="">${escapeHtml(def)}</option>${(field.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>`;
        } else if (field.type === 'boolean') {
            control = `<input type="checkbox" id="${id}" data-key="${key}"${fallback}>`;
        } else {
            const placeholder = field.fallback === undefined ? '' : ` placeholder="default: ${escapeHtml(String(field.fallback))}"`;
            control = `<input type="${field.type}" id="${id}" data-key="${key}"${fallback}${placeholder}${field.type === 'number' ? ' min="0"' : ''}>`;
        }
        return `
            <div class="row">
                <label for="${id}">${escapeHtml(field.label)}<span class="key">${escapeHtml(key)}</span></label>
                ${control}
                ${field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : ''}
            </div>`;
    }
}
