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

    // 2. Command: explicit workspace-only MCP setup
    const runMultiMcpSetup = async () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        const selected = await vscode.window.showOpenDialog({
            title: 'Select your local testfly-mcp.js bridge script',
            canSelectFiles: true,
            canSelectMany: false,
            filters: { JavaScript: ['js'] }
        });
        if (!selected?.length) return;
        const bridgeScript = selected[0].fsPath;
        const confirm = await vscode.window.showWarningMessage(
            `Add TestFly (${bridgeScript}) and Playwright MCP to ${path.join(root, '.cursor', 'mcp.json')} and ${path.join(root, '.vscode', 'mcp.json')}? Existing server entries will be retained.`,
            { modal: true }, 'Configure workspace'
        );
        if (confirm !== 'Configure workspace') return;
        try {
            const report = McpRegistrar.registerWorkspace(root, bridgeScript);
            vscode.window.showInformationMessage(`TestFly MCP: Cursor ${report.cursorProject ? 'configured' : 'not configured'}, VS Code ${report.vscodeNative ? 'configured' : 'not configured'}.`);
            refreshAll();
        } catch (error: any) {
            vscode.window.showErrorMessage(`TestFly MCP setup stopped: ${error.message}`);
        }
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
            if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
                vscode.window.showErrorMessage(`Refusing to overwrite files in ${targetDir}. Select an empty directory.`);
                return;
            }
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(path.join(targetDir, 'pom.xml'), DEFAULT_POM_XML, 'utf8');
            fs.writeFileSync(path.join(targetDir, 'testfly.yml'), DEFAULT_TESTFLY_YML, 'utf8');

            const testDir = path.join(targetDir, 'src', 'test', 'java', 'io', 'testfly', 'examples', 'testng');
            fs.mkdirSync(testDir, { recursive: true });
            fs.writeFileSync(path.join(testDir, 'SmokeTest.java'), DEFAULT_SMOKE_TEST, 'utf8');

            vscode.window.showInformationMessage(`TestFly Java 21 project scaffolded successfully in ${targetDir}`);
            refreshAll();
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to scaffold: ${err.message}`);
        }
    };

    // Keep old command IDs, but do not present hard-coded sample tests as real sharding.
    const runShardTests = async () => {
        vscode.window.showWarningMessage('TestFly: IDE sharding needs real suite metrics; the sample-only wizard is unavailable. Configure execution.sharding in testfly.yml.');
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
                label: '$(hubot) Configure Workspace MCP',
                description: 'Select local TestFly bridge and configure Cursor/VS Code',
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
                description: 'Create TestFly 1.0.7 project files',
                detail: 'initProject'
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
