import * as vscode from 'vscode';
import * as path from 'path';
import { RemediationService, RemediationPatch } from './remediationService';
import { escapeHtml, getNonce } from './webviewUtils';

export class PatchReviewerWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;
    private static workspaceRoot: string;
    private static onChanged: (() => void) | undefined;

    /** @param onChanged called after a patch is applied or discarded, so sidebars can refresh. */
    public static show(context: vscode.ExtensionContext, workspaceRoot: string, onChanged?: () => void): void {
        PatchReviewerWebview.workspaceRoot = workspaceRoot;
        PatchReviewerWebview.onChanged = onChanged;
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (PatchReviewerWebview.currentPanel) {
            PatchReviewerWebview.currentPanel.reveal(column);
            PatchReviewerWebview.render();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyPatchReviewer',
            'TestFly: Self-Healing Patches',
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        PatchReviewerWebview.currentPanel = panel;

        panel.onDidDispose(() => {
            PatchReviewerWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message) => {
            const root = PatchReviewerWebview.workspaceRoot;
            if (message.command === 'refresh') {
                PatchReviewerWebview.render();
                return;
            }
            const patchPath = RemediationService.resolvePatch(root, message.fileName);
            if (!patchPath) {
                vscode.window.showErrorMessage(`TestFly: Patch ${message.fileName} no longer exists.`);
                PatchReviewerWebview.render();
                return;
            }
            if (message.command === 'apply') {
                await PatchReviewerWebview.apply(root, patchPath);
            } else if (message.command === 'open') {
                await vscode.window.showTextDocument(vscode.Uri.file(patchPath), { preview: true });
            } else if (message.command === 'openTarget') {
                const target = path.join(root, message.targetPath || '');
                if (message.targetPath && target.startsWith(root + path.sep)) {
                    await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: true });
                }
            } else if (message.command === 'discard') {
                const confirm = await vscode.window.showWarningMessage(
                    `Discard ${message.fileName}? The file is moved to the trash; your source code is not changed.`,
                    { modal: true }, 'Discard'
                );
                if (confirm !== 'Discard') return;
                await vscode.workspace.fs.delete(vscode.Uri.file(patchPath), { useTrash: true });
                PatchReviewerWebview.changed();
            }
        });

        PatchReviewerWebview.render();
    }

    /** Re-render if the panel is open (e.g. after target/remediations changed on disk). */
    public static refresh(): void {
        PatchReviewerWebview.render();
    }

    private static async apply(root: string, patchPath: string): Promise<void> {
        const fileName = path.basename(patchPath);
        const confirm = await vscode.window.showWarningMessage(
            `Apply ${fileName} to your source files?`,
            { modal: true, detail: 'The patch is checked with "git apply --check" first. On success it is moved to target/remediations/applied/.' },
            'Apply patch'
        );
        if (confirm !== 'Apply patch') return;
        const res = await RemediationService.applyPatch(root, patchPath);
        if (!res.success) {
            vscode.window.showErrorMessage(res.message);
            return;
        }
        try {
            RemediationService.archiveApplied(root, patchPath);
        } catch (err: any) {
            vscode.window.showWarningMessage(`Patch applied, but it could not be moved to applied/: ${err.message}`);
        }
        vscode.window.showInformationMessage(`TestFly: Applied ${fileName}.`);
        PatchReviewerWebview.changed();
    }

    private static changed(): void {
        PatchReviewerWebview.render();
        PatchReviewerWebview.onChanged?.();
    }

    private static render(): void {
        const panel = PatchReviewerWebview.currentPanel;
        if (!panel) return;
        const patches = RemediationService.listPatches(PatchReviewerWebview.workspaceRoot);
        panel.webview.html = PatchReviewerWebview.html(patches, panel.webview.cspSource);
    }

    private static html(patches: RemediationPatch[], cspSource: string): string {
        const nonce = getNonce();
        const cards = patches.length === 0
            ? `<div class="empty">
                   <h2>No pending patches</h2>
                   <p>When a test fails on a broken locator and AI healing is enabled, TestFly's <code>AiHealingEngine</code> writes a unified diff to <code>target/remediations/</code>. It will show up here automatically.</p>
                   <p>Enable it in <code>testfly.yml</code>:</p>
                   <pre>ai:\n  generatePatch: true\nlocators:\n  aiHealing: true</pre>
               </div>`
            : patches.map(p => {
                const stats = diffStats(p.content);
                const targetPath = p.content.match(/^\+\+\+\s+b\/(.+)$/m)?.[1]?.trim();
                return `
                <section class="card">
                    <header>
                        <div class="title">
                            <span class="name">${escapeHtml(p.fileName)}</span>
                            ${targetPath ? `<a href="#" class="target" data-command="openTarget" data-file="${escapeHtml(p.fileName)}" data-target="${escapeHtml(targetPath)}">${escapeHtml(targetPath)}</a>` : ''}
                            <span class="meta"><span class="add">+${stats.added}</span> <span class="del">−${stats.removed}</span> · ${p.createdAt ? escapeHtml(p.createdAt.toLocaleString()) : ''}</span>
                        </div>
                        <div class="actions">
                            <button class="secondary" data-command="open" data-file="${escapeHtml(p.fileName)}">Open in editor</button>
                            <button class="secondary" data-command="discard" data-file="${escapeHtml(p.fileName)}">Discard</button>
                            <button data-command="apply" data-file="${escapeHtml(p.fileName)}">Apply patch</button>
                        </div>
                    </header>
                    <pre class="diff">${renderDiff(p.content)}</pre>
                </section>`;
            }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TestFly Self-Healing Patches</title>
<style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border, transparent); padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .sub { margin: 4px 0 0; color: var(--vscode-descriptionForeground); }
    button { padding: 4px 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font: inherit; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .card { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; margin-bottom: 16px; overflow: hidden; }
    .card header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; background: var(--vscode-editorWidget-background); }
    .title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-weight: 600; }
    .target { color: var(--vscode-textLink-foreground); text-decoration: none; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .target:hover { text-decoration: underline; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .actions { display: flex; gap: 6px; }
    .add { color: var(--vscode-gitDecoration-addedResourceForeground, #3fb950); }
    .del { color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149); }
    .diff { margin: 0; padding: 8px 0; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.5; background: var(--vscode-editor-background); }
    .diff span { display: block; padding: 0 12px; white-space: pre; }
    .diff .l-add { background: var(--vscode-diffEditor-insertedLineBackground, rgba(46,160,67,.15)); }
    .diff .l-del { background: var(--vscode-diffEditor-removedLineBackground, rgba(248,81,73,.15)); }
    .diff .l-hunk { color: var(--vscode-textLink-foreground); }
    .diff .l-file { color: var(--vscode-descriptionForeground); }
    .empty { max-width: 560px; margin: 40px auto; color: var(--vscode-descriptionForeground); line-height: 1.6; }
    .empty h2 { color: var(--vscode-foreground); font-size: 15px; }
    .empty pre { background: var(--vscode-textCodeBlock-background); padding: 8px 12px; border-radius: 3px; }
</style>
</head>
<body>
<div class="top">
    <div>
        <h1>Self-Healing Patches</h1>
        <p class="sub">${patches.length} pending in <code>target/remediations/</code> · review each diff before applying</p>
    </div>
    <button class="secondary" data-command="refresh">Refresh</button>
</div>
${cards}
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
        const el = event.target.closest('[data-command]');
        if (!el) return;
        event.preventDefault();
        vscode.postMessage({ command: el.dataset.command, fileName: el.dataset.file, targetPath: el.dataset.target });
    });
</script>
</body>
</html>`;
    }
}

function diffStats(content: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of content.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++;
        else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return { added, removed };
}

function renderDiff(content: string): string {
    return content.replace(/\n$/, '').split('\n').map(line => {
        let cls = '';
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) cls = 'l-file';
        else if (line.startsWith('@@')) cls = 'l-hunk';
        else if (line.startsWith('+')) cls = 'l-add';
        else if (line.startsWith('-')) cls = 'l-del';
        return `<span class="${cls}">${escapeHtml(line) || ' '}</span>`;
    }).join('');
}
