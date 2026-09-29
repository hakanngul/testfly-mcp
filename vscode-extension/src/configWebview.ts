import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_TESTFLY_YML } from './constants';

export class ConfigWebview {
    public static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, workspaceRoot: string): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ConfigWebview.currentPanel) {
            ConfigWebview.currentPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testflyConfigVisual',
            'TestFly: Visual Configuration Editor',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ConfigWebview.currentPanel = panel;

        panel.onDidDispose(() => {
            ConfigWebview.currentPanel = undefined;
        }, null, context.subscriptions);

        const configPath = path.join(workspaceRoot, 'testfly.yml');
        let currentYaml = DEFAULT_TESTFLY_YML;
        if (fs.existsSync(configPath)) {
            currentYaml = fs.readFileSync(configPath, 'utf8');
        }

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'saveConfig') {
                try {
                    fs.writeFileSync(configPath, message.content, 'utf8');
                    vscode.window.showInformationMessage('Successfully saved testfly.yml configuration.');
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to save testfly.yml: ${err.message}`);
                }
            }
        });

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFly Configuration</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 15px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 20px; }
        .btn { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        textarea { width: 100%; height: 500px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 12px; box-sizing: border-box; resize: vertical; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>⚙️ TestFly Configuration Studio (testfly.yml)</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--vscode-descriptionForeground);">
                Configure browser execution, timeouts, parallel threads, ReportPortal, and AI Provider settings.
            </p>
        </div>
        <div>
            <button class="btn" onclick="save()">💾 Save testfly.yml</button>
        </div>
    </div>
    <div>
        <textarea id="yamlInput">${escapeHtml(currentYaml)}</textarea>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function save() {
            const content = document.getElementById('yamlInput').value;
            vscode.postMessage({ command: 'saveConfig', content });
        }
    </script>
</body>
</html>`;
    }
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
