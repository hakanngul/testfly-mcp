import { escapeHtml } from './webviewUtils';

/**
 * Shared page shell for every TestFly webview: one CSP, one stylesheet and a few client helpers,
 * so all panels look and behave alike and follow the active VS Code theme (light, dark, high contrast).
 *
 * Pages render their markup once and receive data through postMessage, which keeps scroll
 * position, focus and expanded cards intact when the data changes.
 */
export interface PageOptions {
    cspSource: string;
    nonce: string;
    title: string;
    /** Page-specific CSS appended after the shared stylesheet. */
    css?: string;
    body: string;
    /** Page script; runs after the shared helpers (`vscode`, `$`, `h`, `post`, `announce`). */
    script: string;
}

export function renderPage(options: PageOptions): string {
    const { cspSource, nonce } = options;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(options.title)}</title>
<style>${BASE_CSS}${options.css ?? ''}</style>
</head>
<body>
<div id="tf-announcer" class="sr-only" role="status" aria-live="polite"></div>
${options.body}
<script nonce="${nonce}">${CLIENT_HELPERS}
${options.script}</script>
</body>
</html>`;
}

/** Page header with a title, a one-line explanation and an action area. */
export function pageHeader(title: string, subtitleHtml: string, actionsHtml = ''): string {
    return `<header class="page-header">
    <div class="page-heading">
        <h1>${escapeHtml(title)}</h1>
        <p class="sub" id="page-sub">${subtitleHtml}</p>
    </div>
    <div class="page-actions">${actionsHtml}</div>
</header>`;
}

const BASE_CSS = `
:root {
    --tf-ok: var(--vscode-testing-iconPassed, #388a34);
    --tf-warn: var(--vscode-editorWarning-foreground, #bf8803);
    --tf-err: var(--vscode-errorForeground, #e51400);
    --tf-info: var(--vscode-textLink-foreground, #3794ff);
    --tf-muted: var(--vscode-descriptionForeground);
    --tf-border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.35)));
    --tf-surface: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --tf-hover: var(--vscode-list-hoverBackground, rgba(128,128,128,.1));
    --tf-radius: 4px;
    --tf-mono: var(--vscode-editor-font-family, monospace);
}
* { box-sizing: border-box; }
body { margin: 0; padding: 16px 20px 32px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); line-height: 1.45; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
main, .page-header { max-width: 980px; }
[hidden] { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
a { color: var(--vscode-textLink-foreground); }
a:hover { color: var(--vscode-textLink-activeForeground); }
code, kbd { font-family: var(--tf-mono); font-size: .92em; padding: 1px 4px; border-radius: 3px; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); }
pre { font-family: var(--tf-mono); font-size: var(--vscode-editor-font-size, 12px); background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.12)); padding: 8px 12px; border-radius: var(--tf-radius); overflow-x: auto; margin: 6px 0; }
pre code { padding: 0; background: none; }
h1 { margin: 0; font-size: 18px; font-weight: 600; }
h2 { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.muted, .sub { color: var(--tf-muted); }
.sub { margin: 4px 0 0; }

/* Page header */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px 16px; flex-wrap: wrap; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--tf-border); }
.page-heading { min-width: 0; flex: 1 1 320px; }
.page-actions, .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* Buttons: primary is the default, at most one per area */
button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; min-height: 26px; font: inherit; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button.danger { color: var(--tf-err); background: transparent; border-color: currentColor; }
button.danger:hover { background: var(--tf-hover); }
button.link { padding: 0; min-height: 0; border: 0; background: none; color: var(--vscode-textLink-foreground); }
button.link:hover { background: none; text-decoration: underline; }
button:disabled { opacity: .5; cursor: default; }
button[aria-busy="true"] { cursor: progress; }
:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline-offset: -1px; }

/* Form controls */
input[type=text], input[type=number], input[type=search], input[type=url], select, textarea { width: 100%; padding: 4px 6px; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
input::placeholder { color: var(--vscode-input-placeholderForeground); }
input[type=checkbox] { width: 16px; height: 16px; margin: 0; accent-color: var(--vscode-button-background); }
[aria-invalid="true"] { border-color: var(--vscode-inputValidation-errorBorder, var(--tf-err)) !important; }

/* Toolbar (search + filters) */
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.toolbar input[type=search] { flex: 1 1 220px; width: auto; }
.toolbar select { width: auto; }

/* Cards */
.card { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); margin-bottom: 12px; background: var(--vscode-editor-background); }
.card > summary, .card > .card-head { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 10px 12px; background: var(--tf-surface); border-radius: var(--tf-radius); cursor: pointer; list-style: none; }
.card > .card-head { cursor: default; }
.card[open] > summary { border-bottom: 1px solid var(--tf-border); border-radius: var(--tf-radius) var(--tf-radius) 0 0; }
.card > summary::-webkit-details-marker { display: none; }
.card > summary::before { content: ''; width: 0; height: 0; border: 4px solid transparent; border-left: 5px solid var(--tf-muted); margin-right: -2px; transition: transform .1s; }
.card[open] > summary::before { transform: rotate(90deg) translateX(2px); }
.card-title { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.card-meta { color: var(--tf-muted); font-size: 12px; display: flex; gap: 4px 12px; flex-wrap: wrap; }
.card-body { padding: 10px 12px 12px; }
.spacer { flex: 1; }
/* Pushes trailing actions to the right edge, also when they wrap onto their own line. */
.push { margin-left: auto; }

/* Badges: status is carried by text, not by color alone */
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border-radius: 9px; border: 1px solid currentColor; font-size: 11px; line-height: 16px; font-weight: 600; white-space: nowrap; color: var(--tf-muted); }
.badge.ok { color: var(--tf-ok); }
.badge.warn { color: var(--tf-warn); }
.badge.err { color: var(--tf-err); }
.badge.info { color: var(--tf-info); }
.badge.solid { color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); border-color: transparent; }

/* Callouts */
.callout { border: 1px solid var(--tf-border); border-left: 3px solid var(--tf-info); border-radius: var(--tf-radius); padding: 8px 12px; margin: 0 0 12px; background: var(--vscode-inputValidation-infoBackground, transparent); }
.callout.ok { border-left-color: var(--tf-ok); background: transparent; }
.callout.warn { border-left-color: var(--tf-warn); background: var(--vscode-inputValidation-warningBackground, transparent); }
.callout.err { border-left-color: var(--tf-err); background: var(--vscode-inputValidation-errorBackground, transparent); }
.callout > strong { display: block; margin-bottom: 2px; }
.callout ul { margin: 4px 0 0; padding-left: 18px; }
.callout p { margin: 4px 0 0; }

/* Empty / error / loading states */
.empty { max-width: 560px; margin: 40px auto; text-align: center; color: var(--tf-muted); }
.empty h2 { color: var(--vscode-foreground); font-size: 15px; }
.empty pre { text-align: left; }
.empty .actions { justify-content: center; margin-top: 12px; }
.skeleton { height: 44px; border-radius: var(--tf-radius); margin-bottom: 12px; background: linear-gradient(90deg, var(--tf-surface) 25%, var(--tf-hover) 50%, var(--tf-surface) 75%); background-size: 200% 100%; animation: tf-shimmer 1.2s infinite linear; }
@keyframes tf-shimmer { to { background-position: -200% 0; } }

/* Tables */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--tf-border); vertical-align: top; }
th { font-weight: 600; color: var(--tf-muted); }
td code { overflow-wrap: anywhere; }

/* Inline status next to actions ("Saved", "Copied") */
.flash { font-size: 12px; color: var(--tf-ok); }
.flash.err { color: var(--tf-err); }

/* Collapsible guide */
details.guide { border: 1px solid var(--tf-border); border-radius: var(--tf-radius); margin-bottom: 16px; }
details.guide > summary { padding: 8px 12px; cursor: pointer; font-weight: 600; }
details.guide > div { padding: 0 12px 10px; }
details.guide ol { padding-left: 20px; margin: 6px 0; }

@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
@media (forced-colors: active) { .badge, .card, .callout, button.danger { border: 1px solid CanvasText; } }
body.vscode-high-contrast .card, body.vscode-high-contrast .callout { border-color: var(--vscode-contrastBorder); }
`;

/** Tiny client helpers shared by all pages; DOM is built with textContent so data is never parsed as HTML. */
const CLIENT_HELPERS = `
const vscode = acquireVsCodeApi();
const $ = (sel, root = document) => root.querySelector(sel);
const post = (command, data = {}) => vscode.postMessage({ command, ...data });
const PROPS = new Set(['open', 'checked', 'value', 'disabled', 'hidden', 'selected', 'indeterminate']);
function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (PROPS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of children.flat()) {
        if (child === undefined || child === null || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}
function announce(text) {
    const el = document.getElementById('tf-announcer');
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 30);
}
function flash(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.className = 'flash' + (isError ? ' err' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 2500);
    announce(text);
}
`;
