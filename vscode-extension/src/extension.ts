import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DOCS_URL, DEFAULT_POM_XML, DEFAULT_TESTFLY_YML, DEFAULT_SMOKE_TEST } from './constants';
import { Checker } from './checker';
import { McpRegistrar } from './registrar';
import { initTestFlyConfig } from './configGenerator';
import { TestFlyStatusBar } from './statusBar';
import {
    QuickActionsTreeProvider,
    StatusTreeProvider,
    ActionCacheTreeProvider,
    RemediationTreeProvider
} from './treeViews';
import { ActionCacheWebview } from './actionCacheWebview';
import { PatchReviewerWebview } from './patchReviewerWebview';
import { ConfigWebview } from './configWebview';
import { SharderService, TestDurationItem } from './sharderService';
import { CodegenService, RecordedAction } from './codegenService';

export async function activate(context: vscode.ExtensionContext) {
    const statusBar = new TestFlyStatusBar();
    context.subscriptions.push(statusBar);
    await statusBar.update();

    // 1. Register Sidebar Tree Views
    const quickActionsProvider = new QuickActionsTreeProvider();
    const statusProvider = new StatusTreeProvider();
    const actionCacheProvider = new ActionCacheTreeProvider();
    const remediationProvider = new RemediationTreeProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('testfly.quickActions', quickActionsProvider),
        vscode.window.registerTreeDataProvider('testfly.status', statusProvider),
        vscode.window.registerTreeDataProvider('testfly.actionCache', actionCacheProvider),
        vscode.window.registerTreeDataProvider('testfly.remediations', remediationProvider)
    );

    const getWorkspaceRoot = (): string | undefined => {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
    };

    const refreshAll = () => {
        statusProvider.refresh();
        actionCacheProvider.refresh();
        remediationProvider.refresh();
        statusBar.update();
    };

    // 2. Command: 1-Click Multi-Assistant MCP Setup
    const runMultiMcpSetup = async () => {
        const root = getWorkspaceRoot();
        const report = await McpRegistrar.registerAll(root);

        const summary = [
            'TestFly & Playwright MCP Setup Results:',
            `• Cursor Global (~/.cursor/mcp.json): ${report.cursorGlobal ? '✓ Configured' : 'Skipped/Failed'}`,
            root ? `• Cursor Workspace (.cursor/mcp.json): ${report.cursorProject ? '✓ Configured' : 'Skipped/Failed'}` : '',
            `• Claude Desktop: ${report.claudeDesktop ? '✓ Configured' : 'Skipped/Failed'}`,
            root ? `• VS Code Native (.vscode/mcp.json): ${report.vscodeNative ? '✓ Configured' : 'Skipped/Failed'}` : '',
            `• Claude Code CLI (~/.claude/settings.json): ${report.claudeCode ? '✓ Configured' : 'Skipped/Failed'}`
        ].filter(Boolean).join('\n');

        vscode.window.showInformationMessage(summary, 'OK');
        refreshAll();
    };

    // 3. Command: Open Action Cache Explorer
    const runOpenActionCache = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        ActionCacheWebview.show(context, root);
    };

    // 4. Command: Open AI Self-Healing Patch Reviewer
    const runOpenPatchReviewer = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        PatchReviewerWebview.show(context, root);
    };

    // 5. Command: Open Visual testfly.yml Editor
    const runOpenVisualConfig = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        ConfigWebview.show(context, root);
    };

    // 6. Command: Scaffold Java 21 Project
    const runScaffoldProject = async () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }

        const choice = await vscode.window.showQuickPick(
            [
                { label: 'Current Workspace', description: 'Scaffold directly in the open folder' },
                { label: 'Subdirectory', description: 'Create a new project folder inside workspace' }
            ],
            { title: 'TestFly: Choose Scaffolding Location' }
        );
        if (!choice) return;

        let targetDir = root;
        if (choice.label === 'Subdirectory') {
            const dirName = await vscode.window.showInputBox({
                prompt: 'Enter folder name for the new suite',
                value: 'testfly-suite'
            });
            if (!dirName) return;
            targetDir = path.join(root, dirName.trim());
        }

        try {
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(path.join(targetDir, 'pom.xml'), DEFAULT_POM_XML, 'utf8');
            fs.writeFileSync(path.join(targetDir, 'testfly.yml'), DEFAULT_TESTFLY_YML, 'utf8');

            const testDir = path.join(targetDir, 'src', 'test', 'java', 'io', 'testfly', 'examples', 'testng');
            fs.mkdirSync(testDir, { recursive: true });
            fs.writeFileSync(path.join(testDir, 'SmokeTest.java'), DEFAULT_SMOKE_TEST, 'utf8');

            vscode.window.showInformationMessage(`TestFly 1.0.6 Java 21 project scaffolded successfully in ${targetDir}`);
            refreshAll();
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to scaffold: ${err.message}`);
        }
    };

    // 7. Command: Interactive CI Test Sharder Wizard
    const runShardTests = async () => {
        const total = await vscode.window.showInputBox({
            title: 'TestFly CI Sharder: Total Nodes',
            prompt: 'Enter number of parallel CI nodes',
            value: '4'
        });
        if (!total) return;

        const index = await vscode.window.showInputBox({
            title: 'TestFly CI Sharder: Current Node Index',
            prompt: `Enter index of current node [0 to ${Number(total) - 1}]`,
            value: '0'
        });
        if (!index) return;

        // Mock test suite items or read from surefire-reports if exists
        const sampleItems: TestDurationItem[] = [
            { className: 'io.testfly.tests.LoginTest', durationMs: 12000 },
            { className: 'io.testfly.tests.CheckoutTest', durationMs: 25000 },
            { className: 'io.testfly.tests.SearchTest', durationMs: 8000 },
            { className: 'io.testfly.tests.ProfileTest', durationMs: 15000 },
            { className: 'io.testfly.tests.PaymentTest', durationMs: 22000 },
            { className: 'io.testfly.tests.ApiTest', durationMs: 5000 }
        ];

        const res = SharderService.shard(sampleItems, Number(total), Number(index));
        vscode.window.showInformationMessage(
            `Node ${res.nodeIndex + 1}/${res.totalNodes} Assigned Tests:\n${res.tests.join(', ')}\nTotal Duration: ${res.totalDurationMs}ms`,
            'OK'
        );
    };

    // 8. Command: Diagnostics Check
    const runCheckStatus = async () => {
        const root = getWorkspaceRoot();
        const diag = await Checker.getDiagnostics(root);
        vscode.window.showInformationMessage(`TestFly Environment:\n\n${diag.details}`, 'OK');
        refreshAll();
    };

    // 9. Command: Actions Menu
    const showMenu = async () => {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(hubot) 1-Click Multi-Assistant MCP Setup',
                description: 'Configure Playwright MCP + TestFly across Cursor, Claude, Copilot',
                detail: 'multiMcpSetup'
            },
            {
                label: '$(zap) Open Action Cache Explorer',
                description: 'Inspect and manage autonomous act() goals',
                detail: 'openActionCache'
            },
            {
                label: '$(tools) Open AI Self-Healing Patch Reviewer',
                description: 'Review and apply git diff patches from target/remediations/',
                detail: 'openPatchReviewer'
            },
            {
                label: '$(gear) Visual testfly.yml Editor',
                description: 'Configure timeouts, retries, and AI providers',
                detail: 'openVisualConfig'
            },
            {
                label: '$(file-code) Scaffold Java 21 Project',
                description: 'Create modern TestFly 1.0.6 project files',
                detail: 'initProject'
            },
            {
                label: '$(split-horizontal) Run CI Test Sharder',
                description: 'Calculate parallel test distribution via LPT algorithm',
                detail: 'shardTests'
            },
            {
                label: '$(pulse) Check Environment Diagnostics',
                description: 'Verify JDK 21, Maven, Node, and project files',
                detail: 'checkStatus'
            },
            {
                label: '$(book) Open Documentation',
                description: 'Browse documentation and guides',
                detail: 'openDocs'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, { placeHolder: 'Select a TestFly action' });
        if (!selection) return;

        switch (selection.detail) {
            case 'multiMcpSetup': await runMultiMcpSetup(); break;
            case 'openActionCache': runOpenActionCache(); break;
            case 'openPatchReviewer': runOpenPatchReviewer(); break;
            case 'openVisualConfig': runOpenVisualConfig(); break;
            case 'initProject': await runScaffoldProject(); break;
            case 'shardTests': await runShardTests(); break;
            case 'checkStatus': await runCheckStatus(); break;
            case 'openDocs': vscode.env.openExternal(vscode.Uri.parse(DOCS_URL)); break;
        }
    };

    // Register all commands with 'testfly.*' and backwards-compatible 'testfly-mcp.*' IDs
    context.subscriptions.push(
        vscode.commands.registerCommand('testfly.menu', showMenu),
        vscode.commands.registerCommand('testfly-mcp.menu', showMenu),
        vscode.commands.registerCommand('testfly.multiMcpSetup', runMultiMcpSetup),
        vscode.commands.registerCommand('testfly.openActionCache', runOpenActionCache),
        vscode.commands.registerCommand('testfly.openPatchReviewer', runOpenPatchReviewer),
        vscode.commands.registerCommand('testfly.openVisualConfig', runOpenVisualConfig),
        vscode.commands.registerCommand('testfly.initProject', runScaffoldProject),
        vscode.commands.registerCommand('testfly-mcp.initProject', runScaffoldProject),
        vscode.commands.registerCommand('testfly.shardTests', runShardTests),
        vscode.commands.registerCommand('testfly-mcp.shardTests', runShardTests),
        vscode.commands.registerCommand('testfly.checkStatus', runCheckStatus),
        vscode.commands.registerCommand('testfly-mcp.checkStatus', runCheckStatus),
        vscode.commands.registerCommand('testfly.initConfig', initTestFlyConfig),
        vscode.commands.registerCommand('testfly-mcp.initConfig', initTestFlyConfig),
        vscode.commands.registerCommand('testfly.refreshStatus', refreshAll),
        vscode.commands.registerCommand('testfly-mcp.refreshStatus', refreshAll),
        vscode.commands.registerCommand('testfly.openDocs', () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL))),
        vscode.commands.registerCommand('testfly-mcp.openDocs', () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL)))
    );
}

export function deactivate() {}
