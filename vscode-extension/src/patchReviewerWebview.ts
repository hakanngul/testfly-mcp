import * as vscode from 'vscode';
import { RemediationService, RemediationPatch } from './remediationService';

export class PatchReviewerWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, workspaceRoot: string): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (PatchReviewerWebview.currentPanel) {
            PatchReviewerWebview.currentPanel.reveal(column);
            PatchReviewerWebview.render(workspaceRoot);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyPatchReviewer',
            'TestFly: AI Self-Healing Remediation Patches',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        PatchReviewerWebview.currentPanel = panel;

        panel.onDidDispose(() => {
            PatchReviewerWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'apply') {
                const res = await RemediationService.applyPatch(workspaceRoot, message.filePath);
                if (res.success) {
                    vscode.window.showInformationMessage(res.message);
                } else {
                    vscode.window.showErrorMessage(res.message);
                }
                PatchReviewerWebview.render(workspaceRoot);
            } else if (message.command === 'refresh') {
                PatchReviewerWebview.render(workspaceRoot);
            }
        });

        PatchReviewerWebview.render(workspaceRoot);
    }

    private static render(workspaceRoot: string): void {
        if (!PatchReviewerWebview.currentPanel) return;

        const patches = RemediationService.listPatches(workspaceRoot);
        const webview = PatchReviewerWebview.currentPanel.webview;

        const patchCards = patches.length === 0
            ? `<div class="empty-state">No pending remediation patches in <code>target/remediations/</code>.<br>When TestFly's <code>AiHealingEngine</code> automatically repairs broken selectors during test runs, unified git diff patches will appear here.</div>`
            : patches.map(p => `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <span class="patch-title">🩹 ${escapeHtml(p.fileName)}</span>
                            ${p.targetClass ? `<span class="target-class">Target: <b>${escapeHtml(p.targetClass)}</b></span>` : ''}
                        </div>
                        <button class="btn btn-apply" onclick="applyPatch('${escapeHtml(p.filePath)}')">✅ Apply Patch to Java Code</button>
                    </div>
                    <div class="card-meta">
                        <span>🕒 Created: ${p.createdAt ? p.createdAt.toLocaleString() : 'Recent'}</span>
                    </div>
                    <pre class="diff-view"><code>${escapeHtml(p.content)}</code></pre>
                </div>
            `).join('');

        webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFly Self-Healing Patches</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 15px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 20px; }
        .btn { padding: 6px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-apply { background: #28a745; color: white; }
        .btn-apply:hover { background: #218838; }
        .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 16px; margin-bottom: 20px; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .patch-title { font-weight: 600; font-size: 15px; color: var(--vscode-textLink-foreground); }
        .target-class { margin-left: 12px; font-size: 12px; color: var(--vscode-descriptionForeground); }
        .card-meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
        .diff-view { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; overflow-x: auto; white-space: pre-wrap; line-height: 1.5; border: 1px solid rgba(127, 127, 127, 0.2); }
        .empty-state { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>🩹 AI Self-Healing Remediation Patches</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--vscode-descriptionForeground);">
                Review and apply git diff patches synthesized by <code>AiHealingEngine</code> directly to your test source.
            </p>
        </div>
        <div>
            <button class="btn" onclick="refresh()">🔄 Refresh</button>
        </div>
    </div>
    <div id="content">
        ${patchCards}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function applyPatch(filePath) {
            vscode.postMessage({ command: 'apply', filePath });
        }
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
