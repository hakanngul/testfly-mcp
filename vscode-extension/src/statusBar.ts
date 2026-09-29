import * as vscode from 'vscode';
import { Checker } from './checker';

export class TestFlyStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'testfly.menu';
    }

    public async update(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        const root = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
        const diag = await Checker.getDiagnostics(root);

        if (diag.hasTestFlyYml) {
            this.statusBarItem.text = '$(zap) TestFly Studio';
            this.statusBarItem.tooltip = `TestFly Active (${diag.actionCacheCount} cached goals, ${diag.remediationPatchCount} patches)`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(radio-tower) TestFly Studio';
            this.statusBarItem.tooltip = 'Click to configure TestFly or setup AI MCP assistants.';
            this.statusBarItem.backgroundColor = undefined;
        }
        this.statusBarItem.show();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
