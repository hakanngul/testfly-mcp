import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DiagnosticResult {
    installed: boolean;
    command: string;
    version?: string;
    pythonPath?: string;
    details: string;
}

export async function isInstalled(): Promise<boolean> {
    const checks = [
        'python3 -c "import testfly_mcp"',
        'python -c "import testfly_mcp"',
        'pip show testfly-mcp',
        'pip3 show testfly-mcp',
        'uv pip show testfly-mcp',
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

export async function resolveCommand(): Promise<string> {
    const candidates = ['testfly-mcp', 'testfly-mcp3', 'seleniumboot-mcp', 'seleniumboot-mcp3'];
    for (const cmd of candidates) {
        try {
            const { stdout } = await execAsync(
                process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
            );
            const resolved = stdout.trim().split('\n')[0].trim();
            if (resolved) return resolved;
        } catch {
            // try next
        }
    }
    return 'testfly-mcp'; // fallback — rely on PATH
}

export async function getDiagnosticReport(): Promise<DiagnosticResult> {
    const installed = await isInstalled();
    const command = await resolveCommand();

    let version: string | undefined;
    try {
        const { stdout } = await execAsync('python3 -c "import testfly_mcp; from importlib.metadata import version; print(version(\'testfly-mcp\'))"');
        version = stdout.trim();
    } catch {
        try {
            const { stdout } = await execAsync('python3 -c "import selenium_mcp; from importlib.metadata import version; print(version(\'seleniumboot-mcp\'))"');
            version = stdout.trim();
        } catch {
            // version unavailable
        }
    }

    let pythonPath: string | undefined;
    try {
        const { stdout } = await execAsync(process.platform === 'win32' ? 'where python' : 'which python3 || which python');
        pythonPath = stdout.trim().split('\n')[0].trim();
    } catch {
        // python unavailable
    }

    const lines = [
        `Installed: ${installed ? 'Yes (✓)' : 'No (✗)'}`,
        `CLI Command: ${command}`,
        `Package Version: ${version || 'Unknown / Not detected'}`,
        `Python Interpreter: ${pythonPath || 'Not found'}`,
    ];

    return {
        installed,
        command,
        version,
        pythonPath,
        details: lines.join('\n')
    };
}

export function openTerminalAndRun(command: string, name: string = 'TestFly MCP'): void {
    let terminal = vscode.window.terminals.find(t => t.name === name);
    if (!terminal) {
        terminal = vscode.window.createTerminal(name);
    }
    terminal.show();
    terminal.sendText(command);
}
