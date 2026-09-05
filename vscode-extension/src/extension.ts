import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const INSTALL_CMD = 'pip install testfly-mcp';
const UPGRADE_CMD = 'pip install --upgrade testfly-mcp';
const MCP_SERVER_KEY = 'testfly';

async function isInstalled(): Promise<boolean> {
    const checks = [
        'python3 -c "import testfly_mcp"',
        'python -c "import testfly_mcp"',
        'pip show testfly-mcp',
        'pip3 show testfly-mcp',
        'python3 -c "import selenium_mcp"',
        'python -c "import selenium_mcp"',
        'pip show seleniumboot-mcp',
        'pip3 show seleniumboot-mcp',
    ];
    for (const cmd of checks) {
        try {
            await execAsync(cmd);
            return true;
        } catch {
            // try next
        }
    }
    return false;
}

async function resolveCommand(): Promise<string> {
    // Prefer full path so Claude Code / AI tools can find it even when PATH differs
    for (const cmd of ['testfly-mcp', 'testfly-mcp3', 'seleniumboot-mcp', 'seleniumboot-mcp3']) {
        try {
            const { stdout } = await execAsync(
                process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
            );
            const resolved = stdout.trim().split('\n')[0].trim();
            if (resolved) return resolved;
        } catch { /* try next */ }
    }
    return 'testfly-mcp'; // fallback — rely on PATH
}

function writeMcpEntry(filePath: string, command: string): boolean {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        let settings: Record<string, unknown> = {};
        if (fs.existsSync(filePath)) {
            try {
                settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch {
                // The file exists but isn't valid JSON — it may be hand-edited or
                // commented out on purpose. Leave it alone rather than overwriting.
                return false;
            }
        }
        const mcpServers = (settings['mcpServers'] as Record<string, unknown> | undefined) ?? {};
        const existing = mcpServers[MCP_SERVER_KEY] as { command?: string } | undefined;
        if (existing?.command === command) return true; // already up to date
        mcpServers[MCP_SERVER_KEY] = { command, args: [] };
        settings['mcpServers'] = mcpServers;
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 4), 'utf8');
        return true;
    } catch {
        return false;
    }
}

/**
 * Register with Claude Code.
 *
 * ~/.claude/settings.json — global (CLI + VS Code extension user scope) — is
 * enough on its own: Claude Code reads it for every project. A project-level
 * <workspace>/.mcp.json is also supported, but it drops an untracked file into
 * every workspace that's opened, so it's opt-in via
 * `testflyMcp.registerProjectMcpJson`.
 */
async function registerWithClaudeCode(command: string): Promise<void> {
    // Global user settings
    const globalSettings = path.join(os.homedir(), '.claude', 'settings.json');
    writeMcpEntry(globalSettings, command);

    const writeProjectFiles = vscode.workspace
        .getConfiguration('testflyMcp')
        .get<boolean>('registerProjectMcpJson', false);
    if (!writeProjectFiles) return;

    // Project-level .mcp.json for each open workspace folder
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        const mcpJson = path.join(folder.uri.fsPath, '.mcp.json');
        writeMcpEntry(mcpJson, command);
    }
}

function openTerminalAndRun(command: string) {
    const terminal = vscode.window.createTerminal('TestFly MCP Setup');
    terminal.show();
    terminal.sendText(command);
}

export async function activate(context: vscode.ExtensionContext) {
    const installed = await isInstalled();

    if (!installed) {
        const action = await vscode.window.showWarningMessage(
            'TestFly MCP: The `testfly-mcp` Python package is not installed. ' +
            'Install it to enable TestFly browser automation for Copilot and Claude.',
            'Install via pip',
            'Show instructions'
        );

        if (action === 'Install via pip') {
            openTerminalAndRun(INSTALL_CMD);
        } else if (action === 'Show instructions') {
            vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/seleniumboot/selenium-mcp#installation')
            );
        }
        return; // don't register until package is actually installed
    }

    // Auto-register with Claude Code (global settings; project .mcp.json only if opted in)
    const command = await resolveCommand();
    await registerWithClaudeCode(command);
    console.log(`TestFly MCP: registered "${command}"`);

    // Commands
    const installHandler = () => openTerminalAndRun(INSTALL_CMD);
    const upgradeHandler = () => openTerminalAndRun(UPGRADE_CMD);
    const checkStatusHandler = async () => {
        const ok = await isInstalled();
        if (ok) {
            vscode.window.showInformationMessage(
                'TestFly MCP: testfly-mcp is installed and ready. ' +
                'MCP server is registered in ~/.claude/settings.json.'
            );
        } else {
            const install = await vscode.window.showWarningMessage(
                'TestFly MCP: testfly-mcp is not installed.',
                'Install now'
            );
            if (install) openTerminalAndRun(INSTALL_CMD);
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('testfly-mcp.install', installHandler),
        vscode.commands.registerCommand('testfly-mcp.upgrade', upgradeHandler),
        vscode.commands.registerCommand('testfly-mcp.checkStatus', checkStatusHandler),
        // backward compatibility aliases
        vscode.commands.registerCommand('seleniumboot-mcp.install', installHandler),
        vscode.commands.registerCommand('seleniumboot-mcp.upgrade', upgradeHandler),
        vscode.commands.registerCommand('seleniumboot-mcp.checkStatus', checkStatusHandler)
    );
}

export function deactivate() {}
