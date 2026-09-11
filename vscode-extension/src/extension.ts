import * as vscode from 'vscode';
import {
    INSTALL_CMD,
    UPGRADE_CMD,
    DOCS_URL
} from './constants';
import {
    isInstalled,
    resolveCommand,
    getDiagnosticReport,
    openTerminalAndRun
} from './checker';
import {
    registerWithClaudeCode,
    isClaudeCodeRegistered
} from './registrar';
import { initTestFlyConfig } from './configGenerator';
import { TestFlyStatusBar } from './statusBar';
import {
    QuickActionsTreeProvider,
    StatusTreeProvider,
    ToolsTreeProvider
} from './treeViews';
import { ToolMetadata } from './toolsData';

export async function activate(context: vscode.ExtensionContext) {
    const statusBar = new TestFlyStatusBar();
    context.subscriptions.push(statusBar);
    await statusBar.update();

    // 1. Register Sidebar Tree Views
    const quickActionsProvider = new QuickActionsTreeProvider();
    const statusProvider = new StatusTreeProvider();
    const toolsProvider = new ToolsTreeProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('testfly.quickActions', quickActionsProvider),
        vscode.window.registerTreeDataProvider('testfly.status', statusProvider),
        vscode.window.registerTreeDataProvider('testfly.tools', toolsProvider)
    );

    // 2. Interactive Project Scaffolding Wizard (testfly init)
    const runScaffoldWizard = async () => {
        const projectName = await vscode.window.showInputBox({
            title: 'TestFly: Scaffold New Test Automation Project',
            prompt: 'Enter project name / directory',
            value: 'my-testfly-suite',
            ignoreFocusOut: true,
            validateInput: text => (!text.trim() ? 'Project name cannot be empty' : null)
        });
        if (!projectName) return;

        const framework = await vscode.window.showQuickPick(
            [
                { label: 'testng', description: 'TestNG Runner (extends BaseTest, parallel methods/classes)' },
                { label: 'junit5', description: 'JUnit 5 Jupiter (extends BaseJUnit5Test, display names)' },
                { label: 'cucumber', description: 'Cucumber BDD (extends BaseCucumberSteps + runner)' }
            ],
            {
                title: 'TestFly: Select Test Runner Framework',
                placeHolder: 'Choose test framework',
                ignoreFocusOut: true
            }
        );
        if (!framework) return;

        const testType = await vscode.window.showQuickPick(
            [
                { label: 'web', description: 'UI Browser automation with web-first assertions' },
                { label: 'api', description: 'REST / Backend API testing with ApiClient' },
                { label: 'hybrid', description: 'Combined API seeding + Web UI validation' }
            ],
            {
                title: 'TestFly: Select Test Type',
                placeHolder: 'Choose test type',
                ignoreFocusOut: true
            }
        );
        if (!testType) return;

        const baseUrl = await vscode.window.showInputBox({
            title: 'TestFly: Target Base URL',
            prompt: 'Enter target application base URL',
            value: 'https://example.com',
            ignoreFocusOut: true
        });
        if (!baseUrl) return;

        const cmd = `testfly init ${projectName.trim()} --framework ${framework.label} --type ${testType.label} --base-url ${baseUrl.trim()}`;
        openTerminalAndRun(cmd);
        vscode.window.showInformationMessage(`TestFly: Scaffolding '${projectName}' project in terminal...`);
    };

    // 3. Interactive CI Test Sharding Wizard (testfly shard)
    const runSharderWizard = async () => {
        const total = await vscode.window.showInputBox({
            title: 'TestFly CI Sharder: Total Parallel Nodes',
            prompt: 'Enter total number of parallel shards / nodes in CI',
            value: '4',
            ignoreFocusOut: true,
            validateInput: val => (isNaN(Number(val)) || Number(val) < 1 ? 'Please enter a valid positive integer' : null)
        });
        if (!total) return;

        const index = await vscode.window.showInputBox({
            title: 'TestFly CI Sharder: Current Node Index',
            prompt: 'Enter 0-based index of this node [0 to total - 1]',
            value: '0',
            ignoreFocusOut: true,
            validateInput: val => (isNaN(Number(val)) || Number(val) < 0 || Number(val) >= Number(total) ? `Index must be between 0 and ${Number(total) - 1}` : null)
        });
        if (!index) return;

        const format = await vscode.window.showQuickPick(
            [
                { label: 'dashboard', description: 'Visual ASCII load-balancing dashboard' },
                { label: 'surefire', description: 'Maven Surefire -Dtest=... test filter pattern' },
                { label: 'xml', description: 'Dynamic TestNG suite XML structure' },
                { label: 'json', description: 'JSON structure with makespan and test items' }
            ],
            {
                title: 'TestFly CI Sharder: Select Output Format',
                placeHolder: 'Choose output format',
                ignoreFocusOut: true
            }
        );
        if (!format) return;

        const cmd = `testfly shard --total ${total} --index ${index} --format ${format.label}`;
        openTerminalAndRun(cmd);
    };

    // 4. Register with AI Assistant
    const runRegister = async () => {
        const cmd = await resolveCommand();
        const ok = await registerWithClaudeCode(cmd);
        if (ok) {
            vscode.window.showInformationMessage(`TestFly MCP: Successfully registered "${cmd}" with Claude Code & Copilot.`);
        } else {
            vscode.window.showWarningMessage('TestFly MCP: Could not write Claude Code settings automatically.');
        }
        await statusBar.update();
        statusProvider.refresh();
    };

    // 5. Diagnostics Check
    const runCheckStatus = async () => {
        const diag = await getDiagnosticReport();
        const claudeReg = isClaudeCodeRegistered();
        const fullReport = [
            diag.details,
            `Claude Code Registered: ${claudeReg ? 'Yes (✓)' : 'No (✗)'}`
        ].join('\n');

        if (diag.installed) {
            vscode.window.showInformationMessage(`TestFly MCP Status:\n${fullReport}`, 'OK', 'Open Menu').then(choice => {
                if (choice === 'Open Menu') showMenu();
            });
        } else {
            vscode.window.showWarningMessage(
                `TestFly MCP Status:\n${fullReport}`,
                'Install Now',
                'Docs'
            ).then(choice => {
                if (choice === 'Install Now') openTerminalAndRun(INSTALL_CMD);
                if (choice === 'Docs') vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
            });
        }
        await statusBar.update();
        statusProvider.refresh();
    };

    // Interactive Recorder Wizard
    const runRecorderWizard = async () => {
        const url = await vscode.window.showInputBox({
            title: 'TestFly Studio: Target URL',
            prompt: 'Enter website URL to open in embedded studio (e.g. https://www.saucedemo.com)',
            value: 'https://www.saucedemo.com',
            ignoreFocusOut: true
        });
        if (url === undefined) return;
        const cmd = `testfly record ${url.trim() ? `"${url.trim()}"` : ''}`;
        openTerminalAndRun(cmd);
    };

    // 6. Interactive Command Palette Menu
    const showMenu = async () => {
        const installed = await isInstalled();
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(record) Start TestFly Studio (Embedded Browser & Codegen)',
                description: 'All-in-one studio with embedded browser and live TestFly Java codegen',
                detail: 'launchStudio'
            },
            {
                label: '$(file-code) Scaffold New Project (testfly init)',
                description: 'Generate TestNG / JUnit 5 / Cucumber test suite',
                detail: 'initProject'
            },
            {
                label: '$(split-horizontal) Run CI Test Sharder (testfly shard)',
                description: 'Partition test suite across parallel nodes using LPT Bin-Packing',
                detail: 'shardTests'
            },
            {
                label: '$(pulse) Check Status & Diagnostics',
                description: 'View Python, package, CLI, and registration state',
                detail: 'checkStatus'
            },
            {
                label: '$(gear) Initialize testfly.yml',
                description: 'Generate standard TestFly configuration in workspace root',
                detail: 'initConfig'
            },
            {
                label: '$(hubot) Register with AI Assistants',
                description: 'Configure Claude Code and GitHub Copilot',
                detail: 'register'
            },
            {
                label: installed ? '$(sync) Upgrade testfly-mcp' : '$(cloud-download) Install testfly-mcp',
                description: installed ? UPGRADE_CMD : INSTALL_CMD,
                detail: 'install'
            },
            {
                label: '$(book) Open TestFly Documentation',
                description: 'Browse documentation and guides',
                detail: 'openDocs'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a TestFly MCP action'
        });

        if (!selection) return;

        switch (selection.detail) {
            case 'launchStudio':
                await runRecorderWizard();
                break;
            case 'initProject':
                await runScaffoldWizard();
                break;
            case 'shardTests':
                await runSharderWizard();
                break;
            case 'checkStatus':
                await runCheckStatus();
                break;
            case 'initConfig':
                await initTestFlyConfig();
                statusProvider.refresh();
                break;
            case 'register':
                await runRegister();
                break;
            case 'install':
                openTerminalAndRun(installed ? UPGRADE_CMD : INSTALL_CMD);
                break;
            case 'openDocs':
                vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
                break;
        }
    };

    // 7. Show Tool Details Callback
    const showToolDetails = async (tool: ToolMetadata) => {
        if (!tool) return;
        const msg = `Tool: ${tool.name}\nCategory: ${tool.category} (${tool.paramsCount} params)\n\n${tool.description}`;
        const action = await vscode.window.showInformationMessage(msg, 'Copy Tool Name', 'Close');
        if (action === 'Copy Tool Name') {
            await vscode.env.clipboard.writeText(tool.name);
            vscode.window.showInformationMessage(`Copied "${tool.name}" to clipboard.`);
        }
    };

    // 8. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('testfly-mcp.menu', showMenu),
        vscode.commands.registerCommand('testfly-mcp.install', () => openTerminalAndRun(INSTALL_CMD)),
        vscode.commands.registerCommand('testfly-mcp.upgrade', () => openTerminalAndRun(UPGRADE_CMD)),
        vscode.commands.registerCommand('testfly-mcp.checkStatus', runCheckStatus),
        vscode.commands.registerCommand('testfly-mcp.launchStudio', runRecorderWizard),
        vscode.commands.registerCommand('testfly-mcp.initProject', runScaffoldWizard),
        vscode.commands.registerCommand('testfly-mcp.shardTests', runSharderWizard),
        vscode.commands.registerCommand('testfly-mcp.initConfig', async () => {
            await initTestFlyConfig();
            statusProvider.refresh();
        }),
        vscode.commands.registerCommand('testfly-mcp.register', runRegister),
        vscode.commands.registerCommand('testfly-mcp.refreshStatus', () => {
            statusProvider.refresh();
            statusBar.update();
        }),
        vscode.commands.registerCommand('testfly-mcp.showToolDetails', showToolDetails),
        vscode.commands.registerCommand('testfly-mcp.openDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
        }),
        // Backward-compatible aliases
        vscode.commands.registerCommand('seleniumboot-mcp.install', () => openTerminalAndRun(INSTALL_CMD)),
        vscode.commands.registerCommand('seleniumboot-mcp.upgrade', () => openTerminalAndRun(UPGRADE_CMD)),
        vscode.commands.registerCommand('seleniumboot-mcp.checkStatus', runCheckStatus)
    );

    // Startup check
    const installed = await isInstalled();
    if (!installed) {
        vscode.window.showWarningMessage(
            'TestFly MCP: The `testfly-mcp` Python package is not installed. ' +
            'Install it to enable browser automation for Claude and GitHub Copilot.',
            'Install via pip',
            'Initialize testfly.yml',
            'Show Docs'
        ).then(action => {
            if (action === 'Install via pip') openTerminalAndRun(INSTALL_CMD);
            else if (action === 'Initialize testfly.yml') {
                initTestFlyConfig();
                statusProvider.refresh();
            } else if (action === 'Show Docs') {
                vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
            }
        });
    } else {
        const cmd = await resolveCommand();
        await registerWithClaudeCode(cmd);
    }
}

export function deactivate() {}
