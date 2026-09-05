import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCP_SERVER_KEY } from './constants';

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
                // Not valid JSON — leave alone
                return false;
            }
        }
        const mcpServers = (settings['mcpServers'] as Record<string, unknown> | undefined) ?? {};
        
        // Remove legacy seleniumboot key if it exists to avoid duplicate registrations
        if (mcpServers['seleniumboot']) {
            delete mcpServers['seleniumboot'];
        }

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

export async function registerWithClaudeCode(command: string): Promise<boolean> {
    const globalSettings = path.join(os.homedir(), '.claude', 'settings.json');
    const globalOk = writeMcpEntry(globalSettings, command);

    const writeProjectFiles = vscode.workspace
        .getConfiguration('testflyMcp')
        .get<boolean>('registerProjectMcpJson', false);
    if (writeProjectFiles) {
        const folders = vscode.workspace.workspaceFolders ?? [];
        for (const folder of folders) {
            const mcpJson = path.join(folder.uri.fsPath, '.mcp.json');
            writeMcpEntry(mcpJson, command);
        }
    }

    return globalOk;
}

export function isClaudeCodeRegistered(): boolean {
    try {
        const globalSettings = path.join(os.homedir(), '.claude', 'settings.json');
        if (!fs.existsSync(globalSettings)) return false;
        const content = fs.readFileSync(globalSettings, 'utf8');
        return content.includes(`"${MCP_SERVER_KEY}"`);
    } catch {
        return false;
    }
}
