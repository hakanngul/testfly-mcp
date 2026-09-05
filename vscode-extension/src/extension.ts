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

export async function activate(context: vscode.ExtensionContext) {
    const statusBar = new TestFlyStatusBar();
    context.subscriptions.push(statusBar);
    await statusBar.update();

    // Command: QuickPick Action Menu
    const showMenu = async () => {
        const installed = await isInstalled();
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(pulse) Check Status & Diagnostics',
                description: 'View Python, package, CLI, and registration state',
                detail: 'checkStatus'
            },
            {
                label: installed ? '$(sync) Upgrade testfly-mcp' : '$(cloud-download) Install testfly-mcp',
                description: installed ? UPGRADE_CMD : INSTALL_CMD,
                detail: 'install'
            },
            {
                label: '$(settings) Register with AI Assistants',
                description: 'Configure Claude Code and GitHub Copilot',
                detail: 'register'
            },
            {
                label: '$(browser) Launch Interactive Web Studio',
                description: 'Open TestFly Studio web dashboard in browser (testfly-mcp ui)',
                detail: 'launchStudio'
            },
            {
                label: '$(file-code) Initialize testfly.yml',
                description: 'Generate standard TestFly configuration in workspace root',
                detail: 'initConfig'
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
            case 'checkStatus':
                await runCheckStatus();
                break;
            case 'install':
                openTerminalAndRun(installed ? UPGRADE_CMD : INSTALL_CMD);
                break;
            case 'register':
                await runRegister();
                break;
            case 'launchStudio':
                openTerminalAndRun('testfly-mcp ui');
                break;
            case 'initConfig':
                await initTestFlyConfig();
                break;
            case 'openDocs':
                vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
                break;
        }
    };

    const runRegister = async () => {
        const cmd = await resolveCommand();
        const ok = await registerWithClaudeCode(cmd);
        if (ok) {
            vscode.window.showInformationMessage(`TestFly MCP: Successfully registered "${cmd}" with Claude Code & Copilot.`);
        } else {
            vscode.window.showWarningMessage('TestFly MCP: Could not write Claude Code settings automatically.');
        }
        await statusBar.update();
    };

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
    };

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('testfly-mcp.menu', showMenu),
        vscode.commands.registerCommand('testfly-mcp.install', () => {
            openTerminalAndRun(INSTALL_CMD);
        }),
        vscode.commands.registerCommand('testfly-mcp.upgrade', () => {
            openTerminalAndRun(UPGRADE_CMD);
        }),
        vscode.commands.registerCommand('testfly-mcp.checkStatus', runCheckStatus),
        vscode.commands.registerCommand('testfly-mcp.launchStudio', () => {
            openTerminalAndRun('testfly-mcp ui');
        }),
        vscode.commands.registerCommand('testfly-mcp.initConfig', initTestFlyConfig),
        vscode.commands.registerCommand('testfly-mcp.openDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
        }),
        // Backward-compatible aliases
        vscode.commands.registerCommand('seleniumboot-mcp.install', () => {
            openTerminalAndRun(INSTALL_CMD);
        }),
        vscode.commands.registerCommand('seleniumboot-mcp.upgrade', () => {
            openTerminalAndRun(UPGRADE_CMD);
        }),
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
            else if (action === 'Initialize testfly.yml') initTestFlyConfig();
            else if (action === 'Show Docs') vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
        });
    } else {
        const cmd = await resolveCommand();
        await registerWithClaudeCode(cmd);
    }
}

export function deactivate() {}
