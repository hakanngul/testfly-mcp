import * as vscode from 'vscode';
import { ActionCacheService, ActionPlanModel } from './actionCacheService';

export class ActionCacheWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, workspaceRoot: string): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ActionCacheWebview.currentPanel) {
            ActionCacheWebview.currentPanel.reveal(column);
            ActionCacheWebview.render(workspaceRoot);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyActionCache',
            'TestFly: Action Cache Explorer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ActionCacheWebview.currentPanel = panel;

        panel.onDidDispose(() => {
            ActionCacheWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'invalidate') {
                const ok = ActionCacheService.invalidateGoal(workspaceRoot, message.goal);
                if (ok) {
                    vscode.window.showInformationMessage(`Invalidated cached plan for: "${message.goal}"`);
                }
                ActionCacheWebview.render(workspaceRoot);
            } else if (message.command === 'clearAll') {
                const choice = await vscode.window.showWarningMessage('Are you sure you want to clear all cached action plans?', 'Clear All', 'Cancel');
                if (choice === 'Clear All') {
                    ActionCacheService.clearAll(workspaceRoot);
                    vscode.window.showInformationMessage('All action plans cleared.');
                    ActionCacheWebview.render(workspaceRoot);
                }
            } else if (message.command === 'refresh') {
                ActionCacheWebview.render(workspaceRoot);
            }
        });

        ActionCacheWebview.render(workspaceRoot);
    }

    private static render(workspaceRoot: string): void {
        if (!ActionCacheWebview.currentPanel) return;

        const plans = ActionCacheService.readCache(workspaceRoot);
        const webview = ActionCacheWebview.currentPanel.webview;

        const planCards = plans.length === 0
            ? `<div class="empty-state">No compiled action plans found in <code>.testfly/action-cache.json</code>.<br>Run tests with <code>act("Goal")</code> to compile and cache deterministic plans.</div>`
            : plans.map(p => `
                <div class="card">
                    <div class="card-header">
                        <span class="goal-title">🎯 ${escapeHtml(p.goal)}</span>
                        <button class="btn btn-danger" onclick="invalidate('${escapeHtml(p.goal)}')">Invalidate (Re-compile)</button>
                    </div>
                    <div class="card-meta">
                        ${p.urlPattern ? `<span>🌐 Pattern: <code>${escapeHtml(p.urlPattern)}</code></span> • ` : ''}
                        <span>🕒 Compiled: ${new Date(p.createdAt).toLocaleString()}</span> • 
                        <span>⚡ Steps: <b>${p.steps ? p.steps.length : 0}</b></span>
                    </div>
                    <div class="steps-table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Action</th>
                                    <th>Locator</th>
                                    <th>Value</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(p.steps || []).map((s, idx) => `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td><span class="badge badge-action">${escapeHtml(s.action)}</span></td>
                                        <td><code>${escapeHtml(s.locator || '-')}</code></td>
                                        <td>${escapeHtml(s.value || '-')}</td>
                                        <td>${escapeHtml(s.description || '-')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `).join('');

        webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFly Action Cache</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 15px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 20px; }
        .btn { padding: 6px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-danger { background: #d73a49; color: white; }
        .btn-danger:hover { background: #cb2431; }
        .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 16px; margin-bottom: 16px; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .goal-title { font-weight: 600; font-size: 15px; color: var(--vscode-textLink-foreground); }
        .card-meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--vscode-widget-border); }
        th { background: rgba(127, 127, 127, 0.1); font-weight: 600; }
        .badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .badge-action { background: #0366d6; color: white; }
        code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; background: rgba(127, 127, 127, 0.15); padding: 2px 4px; border-radius: 3px; }
        .empty-state { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>⚡ TestFly Autonomous Action Cache</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--vscode-descriptionForeground);">
                Freeze <code>act("Goal")</code> compilation for 0ms replay and deterministic execution.
            </p>
        </div>
        <div>
            <button class="btn" onclick="refresh()">🔄 Refresh</button>
            <button class="btn btn-danger" onclick="clearAll()">🗑️ Clear All Plans</button>
        </div>
    </div>
    <div id="content">
        ${planCards}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function invalidate(goal) {
            vscode.postMessage({ command: 'invalidate', goal });
        }
        function clearAll() {
            vscode.postMessage({ command: 'clearAll' });
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
