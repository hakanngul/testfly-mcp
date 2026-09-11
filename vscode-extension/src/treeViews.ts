import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TOOLS_DATA, ToolMetadata } from './toolsData';
import { isInstalled, resolveCommand } from './checker';
import { isClaudeCodeRegistered } from './registrar';

export class QuickActionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandId: string,
        public readonly icon: string,
        public readonly tooltipText?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.tooltip = tooltipText || label;
        this.command = {
            command: commandId,
            title: label
        };
    }
}

export class QuickActionsTreeProvider implements vscode.TreeDataProvider<QuickActionItem> {
    getTreeItem(element: QuickActionItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<QuickActionItem[]> {
        return Promise.resolve([
            new QuickActionItem(
                'Start TestFly Studio (Embedded Browser & Codegen)',
                'testfly-mcp.launchStudio',
                'record',
                'Open all-in-one studio with embedded interactive browser & live TestFly Java codegen'
            ),
            new QuickActionItem(
                'Scaffold New Project (testfly init)',
                'testfly-mcp.initProject',
                'file-code',
                'Interactive wizard to generate a new TestFly automation project'
            ),
            new QuickActionItem(
                'Run CI Test Sharder (testfly shard)',
                'testfly-mcp.shardTests',
                'split-horizontal',
                'Calculate optimal parallel CI test partitions using LPT Bin-Packing'
            ),
            new QuickActionItem(
                'Run Environment Doctor',
                'testfly-mcp.checkStatus',
                'pulse',
                'Diagnose Python, Selenium, Chrome, and AI Assistant setups'
            ),
            new QuickActionItem(
                'Initialize testfly.yml',
                'testfly-mcp.initConfig',
                'gear',
                'Create standard testfly.yml in the current workspace'
            ),
            new QuickActionItem(
                'Register with AI Assistants',
                'testfly-mcp.register',
                'hubot',
                'Configure Claude Code (~/.claude/settings.json) and GitHub Copilot'
            ),
            new QuickActionItem(
                'Open Documentation',
                'testfly-mcp.openDocs',
                'book',
                'Browse TestFly and MCP guides'
            )
        ]);
    }
}

export class StatusItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly descriptionText: string,
        public readonly iconName: string,
        public readonly tooltipText?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = descriptionText;
        this.iconPath = new vscode.ThemeIcon(iconName);
        this.tooltip = tooltipText || `${label}: ${descriptionText}`;
    }
}

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatusItem | undefined | void> = new vscode.EventEmitter<StatusItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<StatusItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<StatusItem[]> {
        const items: StatusItem[] = [];

        // 1. CLI / Server Installation
        const installed = await isInstalled();
        const cmd = await resolveCommand();
        if (installed) {
            items.push(new StatusItem('TestFly CLI', `${cmd} (Ready)`, 'pass-filled'));
        } else {
            items.push(new StatusItem('TestFly CLI', 'Not Installed (Click to install)', 'error'));
        }

        // 2. Claude Code Registration
        const claudeReg = isClaudeCodeRegistered();
        if (claudeReg) {
            items.push(new StatusItem('Claude Code', 'Registered (~/.claude/settings.json)', 'pass-filled'));
        } else {
            items.push(new StatusItem('Claude Code', 'Not Registered (Click Quick Actions)', 'warning'));
        }

        // 3. Workspace TestFly Config
        let hasTestFlyConfig = false;
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            for (const folder of folders) {
                const ymlPath = path.join(folder.uri.fsPath, 'testfly.yml');
                const yamlPath = path.join(folder.uri.fsPath, 'testfly.yaml');
                if (fs.existsSync(ymlPath) || fs.existsSync(yamlPath)) {
                    hasTestFlyConfig = true;
                    break;
                }
            }
        }

        if (hasTestFlyConfig) {
            items.push(new StatusItem('testfly.yml', 'Active in Workspace', 'pass-filled'));
        } else {
            items.push(new StatusItem('testfly.yml', 'Not Found (Click Init Config)', 'info'));
        }

        return items;
    }
}

export class ToolTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly isCategory: boolean,
        public readonly toolData?: ToolMetadata,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        if (isCategory) {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (toolData) {
            this.iconPath = new vscode.ThemeIcon('symbol-method');
            this.description = `(${toolData.paramsCount} params)`;
            this.tooltip = `${toolData.name}\n\n${toolData.description}`;
            this.command = {
                command: 'testfly-mcp.showToolDetails',
                title: 'Show Tool Details',
                arguments: [toolData]
            };
        }
    }
}

export class ToolsTreeProvider implements vscode.TreeDataProvider<ToolTreeItem> {
    getTreeItem(element: ToolTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ToolTreeItem): Thenable<ToolTreeItem[]> {
        if (!element) {
            // Root: Categories
            const categories = Array.from(new Set(TOOLS_DATA.map(t => t.category)));
            const categoryItems = categories.map(cat => {
                const count = TOOLS_DATA.filter(t => t.category === cat).length;
                return new ToolTreeItem(`${cat} (${count})`, true, undefined, vscode.TreeItemCollapsibleState.Collapsed);
            });
            return Promise.resolve(categoryItems);
        } else if (element.isCategory) {
            // Category children
            const catName = element.label.split(' (')[0];
            const tools = TOOLS_DATA.filter(t => t.category === catName);
            const items = tools.map(t => new ToolTreeItem(t.name, false, t));
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }
}
