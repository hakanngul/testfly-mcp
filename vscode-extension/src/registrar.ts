import * as fs from 'fs';
import * as path from 'path';

export interface McpRegistrationReport {
    cursorProject: boolean;
    vscodeNative: boolean;
}

type Server = { command: string; args: string[] };

function readConfig(filePath: string, key: 'mcpServers' | 'servers'): Record<string, any> {
    // Invalid JSON must never be replaced with an empty configuration.
    const current = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`Invalid MCP configuration: ${filePath}`);
    }
    const previous = current[key];
    if (previous !== undefined && (!previous || typeof previous !== 'object' || Array.isArray(previous))) {
        throw new Error(`Invalid ${key} entry in ${filePath}`);
    }
    return current;
}

function updateJson(filePath: string, key: 'mcpServers' | 'servers', servers: Record<string, Server | (Server & { type: string })>): void {
    const current = readConfig(filePath, key);
    const previous = current[key];
    current[key] = { ...previous, ...servers };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write a sibling file first so an interrupted write cannot truncate the user's config.
    const temporary = `${filePath}.testfly-${process.pid}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(current, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporary, filePath);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

export class McpRegistrar {
    public static isRegisteredWorkspace(workspaceRoot?: string): boolean {
        if (!workspaceRoot) return false;
        try {
            const file = path.join(workspaceRoot, '.vscode', 'mcp.json');
            const config = JSON.parse(fs.readFileSync(file, 'utf8'));
            return Boolean(config.servers?.testfly?.command);
        } catch {
            return false;
        }
    }

    /** Register only in the selected workspace; global assistant settings are never touched. */
    public static registerWorkspace(workspaceRoot: string, bridgeScript: string): McpRegistrationReport {
        if (path.basename(bridgeScript) !== 'testfly-mcp.js' || !fs.statSync(bridgeScript).isFile()) {
            throw new Error('Select the local testfly-mcp.js bridge script.');
        }

        const testfly: Server = { command: 'node', args: [path.resolve(bridgeScript)] };
        const playwright: Server = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };
        const report = { cursorProject: false, vscodeNative: false };
        const cursorPath = path.join(workspaceRoot, '.cursor', 'mcp.json');
        const vscodePath = path.join(workspaceRoot, '.vscode', 'mcp.json');
        // Check both destinations before changing either one.
        readConfig(cursorPath, 'mcpServers');
        readConfig(vscodePath, 'servers');
        updateJson(cursorPath, 'mcpServers', { testfly, playwright });
        report.cursorProject = true;
        updateJson(vscodePath, 'servers', {
            testfly: { type: 'stdio', ...testfly },
            playwright: { type: 'stdio', ...playwright }
        });
        report.vscodeNative = true;
        return report;
    }
}
