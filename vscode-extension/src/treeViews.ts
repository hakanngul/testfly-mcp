import * as vscode from 'vscode';
import { Checker } from './checker';
import { ActionCacheService, ActionPlanModel } from './actionCacheService';
import { RemediationService, RemediationPatch } from './remediationService';
import { McpRegistrar } from './registrar';

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
                '⚡ 1-Click MCP Setup (Cursor, Claude, Copilot)',
                'testfly.multiMcpSetup',
                'hubot',
                'Configure Playwright MCP and TestFly Bridge across all AI assistants'
            ),
            new QuickActionItem(
                '🎯 Open Action Cache Explorer',
                'testfly.openActionCache',
                'zap',
                'View and manage compiled act("Goal") plans in .testfly/action-cache.json'
            ),
            new QuickActionItem(
                '🩹 AI Self-Healing Patch Reviewer',
                'testfly.openPatchReviewer',
                'tools',
                'Review and apply git diff patches from target/remediations/'
            ),
            new QuickActionItem(
                '⚙️ Visual testfly.yml Editor',
                'testfly.openVisualConfig',
                'gear',
                'Open interactive configuration editor for testfly.yml'
            ),
            new QuickActionItem(
                '🚀 Scaffold Java 21 Project',
                'testfly.initProject',
                'file-code',
                'Generate modern pom.xml, testfly.yml, and smoke test'
            ),
            new QuickActionItem(
                '📊 Run CI Test Sharder',
                'testfly.shardTests',
                'split-horizontal',
                'Partition test suites across parallel CI nodes with LPT algorithm'
            ),
            new QuickActionItem(
                '🩺 Check Environment Diagnostics',
                'testfly.checkStatus',
                'pulse',
                'Check JDK, Maven, Node, and workspace configuration'
            ),
            new QuickActionItem(
                '📖 Open Documentation',
                'testfly.openDocs',
                'book',
                'Browse TestFly guides and API docs'
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
    private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<StatusItem[]> {
        const folders = vscode.workspace.workspaceFolders;
        const root = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
        const diag = await Checker.getDiagnostics(root);
        const registered = McpRegistrar.isRegisteredAnywhere();

        return [
            new StatusItem('JDK 21+', diag.javaInstalled ? (diag.javaVersion || 'Ready') : 'Missing', diag.javaInstalled ? 'pass-filled' : 'error'),
            new StatusItem('Maven', diag.mavenInstalled ? 'Ready' : 'Not in PATH', diag.mavenInstalled ? 'pass-filled' : 'warning'),
            new StatusItem('Node.js', diag.nodeInstalled ? (diag.nodeVersion || 'Ready') : 'Not in PATH', diag.nodeInstalled ? 'pass-filled' : 'info'),
            new StatusItem('testfly.yml', diag.hasTestFlyYml ? 'Present (✓)' : 'Not Found', diag.hasTestFlyYml ? 'pass-filled' : 'info'),
            new StatusItem('Action Cache', `${diag.actionCacheCount} goals`, 'zap'),
            new StatusItem('Self-Healing Patches', `${diag.remediationPatchCount} patches`, diag.remediationPatchCount > 0 ? 'tools' : 'pass'),
            new StatusItem('AI MCP Assistants', registered ? 'Configured (✓)' : 'Setup Needed', registered ? 'pass-filled' : 'warning')
        ];
    }
}

export class ActionCacheTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<vscode.TreeItem[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return Promise.resolve([]);
        const root = folders[0].uri.fsPath;
        const plans = ActionCacheService.readCache(root);
        if (plans.length === 0) {
            const item = new vscode.TreeItem('No cached goals (.testfly/action-cache.json)', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('info');
            return Promise.resolve([item]);
        }
        return Promise.resolve(plans.map(p => {
            const item = new vscode.TreeItem(p.goal, vscode.TreeItemCollapsibleState.None);
            item.description = `${p.steps ? p.steps.length : 0} steps`;
            item.iconPath = new vscode.ThemeIcon('zap');
            item.tooltip = `Goal: ${p.goal}\nCompiled: ${new Date(p.createdAt).toLocaleString()}`;
            item.command = {
                command: 'testfly.openActionCache',
                title: 'Open Action Cache'
            };
            return item;
        }));
    }
}

export class RemediationTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<vscode.TreeItem[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return Promise.resolve([]);
        const root = folders[0].uri.fsPath;
        const patches = RemediationService.listPatches(root);
        if (patches.length === 0) {
            const item = new vscode.TreeItem('No pending patches (target/remediations)', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('check');
            return Promise.resolve([item]);
        }
        return Promise.resolve(patches.map(p => {
            const item = new vscode.TreeItem(p.fileName, vscode.TreeItemCollapsibleState.None);
            item.description = p.targetClass ? `Target: ${p.targetClass}` : undefined;
            item.iconPath = new vscode.ThemeIcon('tools');
            item.tooltip = `Self-Healing Patch: ${p.fileName}\nClick to review and apply.`;
            item.command = {
                command: 'testfly.openPatchReviewer',
                title: 'Open Patch Reviewer'
            };
            return item;
        }));
    }
}
