import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DOCS_URL, DEFAULT_POM_XML, DEFAULT_TESTFLY_YML, DEFAULT_SMOKE_TEST } from './constants';
import { Checker } from './checker';
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
import { McpSetupWebview } from './mcpSetupWebview';
import { decideReportActions, discoverReports } from './reportService';
import { installBundledBridge } from './bridgeInstaller';

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

    // Keep the sidebar and open panels in step with files the test run writes.
    const watchRoot = getWorkspaceRoot();
    if (watchRoot) {
        let timer: NodeJS.Timeout | undefined;
        const onDiskChange = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { refreshAll(); PatchReviewerWebview.refresh(); ActionCacheWebview.refresh(); }, 300);
        };
        for (const glob of ['target/remediations/*.patch', '.testfly/action-cache.json', 'testfly.{yml,yaml}', '.vscode/mcp.json', '.cursor/mcp.json']) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchRoot, glob));
            watcher.onDidCreate(onDiskChange);
            watcher.onDidChange(onDiskChange);
            watcher.onDidDelete(onDiskChange);
            context.subscriptions.push(watcher);
        }
    }

    // The bundled bridge lives in global storage so registered paths survive extension updates.
    let bundledBridge: string | undefined;
    try {
        bundledBridge = installBundledBridge(context.extensionPath, context.globalStorageUri.fsPath);
    } catch (error: any) {
        console.error(`TestFly: could not install bundled MCP bridge: ${error.message}`);
    }

    // 2. Command: MCP setup for the current IDE (and optionally others)
    const runMultiMcpSetup = () => {
        McpSetupWebview.show(context, bundledBridge, getWorkspaceRoot, refreshAll);
    };

    // 3. Command: Open Action Cache Explorer
    const runOpenActionCache = (focusKey?: unknown) => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        ActionCacheWebview.show(context, root, typeof focusKey === 'string' ? focusKey : undefined);
    };

    // 4. Command: Open AI Self-Healing Patch Reviewer
    const runOpenPatchReviewer = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        PatchReviewerWebview.show(context, root, refreshAll);
    };

    // 5. Command: Open Visual testfly.yml Editor
    const runOpenVisualConfig = () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        ConfigWebview.show(context, root, refreshAll);
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

    // 8b. Command: Initialize testfly.yml (refresh sidebar so stale
    // "testfly.yml: Not Found" status disappears after creation)
    const runInitConfig = async () => {
        await initTestFlyConfig();
        refreshAll();
    };

    // 9. Command: Open Test Report (HTML -> Allure -> ReportPortal)
    const runOpenReport = async () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('TestFly: Open a workspace folder first.');
            return;
        }
        const discovered = discoverReports(root);
        const actions = decideReportActions(discovered);
        if (actions.length === 0) {
            vscode.window.showInformationMessage(
                'TestFly: No report found yet (checked target/testfly-report.html, build/testfly-report.html, target/allure-results). Run your suite first.'
            );
            return;
        }

        const openAction = async (kind: string, target?: string) => {
            if (!target) return;
            if (kind === 'portal') {
                await vscode.env.openExternal(vscode.Uri.parse(target));
            } else if (kind === 'allure-serve') {
                const terminal = vscode.window.createTerminal('TestFly Allure');
                terminal.sendText(`allure serve "${target}"`);
                terminal.show();
                vscode.window.showInformationMessage(`TestFly: Serving Allure results from ${target}`);
            } else {
                // html + allure-html: open the generated file in the editor
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(target));
            }
        };

        if (actions.length === 1) {
            await openAction(actions[0].kind, actions[0].target);
            return;
        }

        const labelFor = (kind: string, target?: string) => {
            if (kind === 'portal') return `$(cloud) Open ReportPortal — ${target}`;
            if (kind === 'allure-serve') return `$(graph) Serve Allure results — ${target}`;
            if (kind === 'allure-html') return `$(graph) Open Allure HTML — ${target}`;
            return `$(file-code) Open HTML report — ${target}`;
        };
        const picked = await vscode.window.showQuickPick(
            actions.map((a) => ({ label: labelFor(a.kind, a.target), actionKind: a.kind, target: a.target })),
            { placeHolder: 'Multiple TestFly reports found — pick one to open' }
        );
        if (!picked) return;
        await openAction(picked.actionKind, picked.target);
    };

    // 10. Command: Actions Menu
    const showMenu = async () => {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(hubot) Set Up MCP',
                description: 'Register TestFly + Playwright MCP for Antigravity, VS Code, or Cursor',
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
                label: '$(file-code) Open Test Report',
                description: 'Open testfly-report.html, Allure, or ReportPortal link',
                detail: 'openReport'
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
            case 'multiMcpSetup': runMultiMcpSetup(); break;
            case 'openActionCache': runOpenActionCache(); break;
            case 'openPatchReviewer': runOpenPatchReviewer(); break;
            case 'openVisualConfig': runOpenVisualConfig(); break;
            case 'initProject': await runScaffoldProject(); break;
            case 'checkStatus': await runCheckStatus(); break;
            case 'openReport': await runOpenReport(); break;
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
        vscode.commands.registerCommand('testfly.openReport', runOpenReport),
        vscode.commands.registerCommand('testfly-mcp.openReport', runOpenReport),
        vscode.commands.registerCommand('testfly.initConfig', runInitConfig),
        vscode.commands.registerCommand('testfly-mcp.initConfig', runInitConfig),
        vscode.commands.registerCommand('testfly.refreshStatus', refreshAll),
        vscode.commands.registerCommand('testfly-mcp.refreshStatus', refreshAll),
        vscode.commands.registerCommand('testfly.openDocs', () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL))),
        vscode.commands.registerCommand('testfly-mcp.openDocs', () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL)))
    );
}

export function deactivate() {}
