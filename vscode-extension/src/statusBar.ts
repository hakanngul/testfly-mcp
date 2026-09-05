import * as vscode from 'vscode';
import { isInstalled } from './checker';

export class TestFlyStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'testfly-mcp.menu';
    }

    public async update(): Promise<void> {
        const ready = await isInstalled();
        if (ready) {
            this.statusBarItem.text = '$(radio-tower) TestFly MCP';
            this.statusBarItem.tooltip = 'TestFly MCP is active. Click for options.';
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(warning) TestFly MCP';
            this.statusBarItem.tooltip = 'TestFly MCP requires setup. Click to install.';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }
        this.statusBarItem.show();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
