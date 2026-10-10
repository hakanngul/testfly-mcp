import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface McpRegistrationReport {
    cursorProject: boolean;
    vscodeNative: boolean;
}

export type McpTarget = 'antigravity' | 'vscode' | 'cursor';

export interface McpTargetInfo {
    target: McpTarget;
    label: string;
    /** Absolute path of the configuration file this target reads. */
    file: string;
    /** True when the file lives outside the workspace (user-level settings). */
    global: boolean;
}

export interface McpTargetStatus extends McpTargetInfo {
    /** The testfly entry exists. */
    registered: boolean;
    /** The registered bridge script exists on disk (false for stale paths). */
    bridgeExists: boolean;
    bridgePath?: string;
}

type Server = { command: string; args: string[] };
type ConfigKey = 'mcpServers' | 'servers';

const CONFIG_KEY: Record<McpTarget, ConfigKey> = {
    antigravity: 'mcpServers',
    vscode: 'servers',
    cursor: 'mcpServers'
};

function readConfig(filePath: string, key: ConfigKey): Record<string, any> {
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

function updateJson(filePath: string, key: ConfigKey, servers: Record<string, Server | (Server & { type: string })>): void {
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

function serversFor(target: McpTarget, bridgeScript: string): Record<string, Server | (Server & { type: string })> {
    const testfly: Server = { command: 'node', args: [path.resolve(bridgeScript)] };
    const playwright: Server = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };
    if (target === 'vscode') {
        return { testfly: { type: 'stdio', ...testfly }, playwright: { type: 'stdio', ...playwright } };
    }
    return { testfly, playwright };
}

export class McpRegistrar {
    /** Antigravity reads its MCP servers from a user-level file; there is no per-workspace file. */
    public static antigravityConfigPath(home: string = os.homedir()): string {
        return path.join(home, '.gemini', 'config', 'mcp_config.json');
    }

    /** The IDE this extension runs in, derived from vscode.env.appName. */
    public static hostTarget(appName: string): McpTarget {
        const name = appName.toLowerCase();
        if (name.includes('antigravity')) return 'antigravity';
        if (name.includes('cursor')) return 'cursor';
        return 'vscode';
    }

    public static targetInfo(target: McpTarget, workspaceRoot?: string, home?: string): McpTargetInfo {
        switch (target) {
            case 'antigravity':
                return { target, label: 'Antigravity', file: this.antigravityConfigPath(home), global: true };
            case 'cursor':
                return { target, label: 'Cursor', file: path.join(workspaceRoot || '', '.cursor', 'mcp.json'), global: false };
            case 'vscode':
            default:
                return { target: 'vscode', label: 'VS Code', file: path.join(workspaceRoot || '', '.vscode', 'mcp.json'), global: false };
        }
    }

    public static status(target: McpTarget, workspaceRoot?: string, home?: string): McpTargetStatus {
        const info = this.targetInfo(target, workspaceRoot, home);
        const result: McpTargetStatus = { ...info, registered: false, bridgeExists: false };
        if (!info.global && !workspaceRoot) return result;
        try {
            const config = JSON.parse(fs.readFileSync(info.file, 'utf8'));
            const entry = config?.[CONFIG_KEY[target]]?.testfly;
            if (entry?.command) {
                result.registered = true;
                result.bridgePath = Array.isArray(entry.args) ? entry.args.find((a: unknown) => typeof a === 'string' && a.endsWith('.js')) : undefined;
                result.bridgeExists = Boolean(result.bridgePath && fs.existsSync(result.bridgePath));
            }
        } catch {
            // Missing or unreadable file: not registered.
        }
        return result;
    }

    public static isRegisteredWorkspace(workspaceRoot?: string): boolean {
        return this.status('vscode', workspaceRoot).registered;
    }

    /**
     * Add TestFly and Playwright MCP entries to the selected targets, keeping every other entry.
     * All destination files are validated before any of them is written.
     */
    public static register(targets: McpTarget[], bridgeScript: string, workspaceRoot?: string, home?: string): McpTarget[] {
        if (path.basename(bridgeScript) !== 'testfly-mcp.js' || !fs.statSync(bridgeScript).isFile()) {
            throw new Error('Select the local testfly-mcp.js bridge script.');
        }
        const infos = targets.map(t => this.targetInfo(t, workspaceRoot, home));
        for (const info of infos) {
            if (!info.global && !workspaceRoot) throw new Error(`${info.label} needs an open workspace folder.`);
            readConfig(info.file, CONFIG_KEY[info.target]);
        }
        for (const info of infos) {
            updateJson(info.file, CONFIG_KEY[info.target], serversFor(info.target, bridgeScript));
        }
        return targets;
    }

    /** Register only in the selected workspace; global assistant settings are never touched. */
    public static registerWorkspace(workspaceRoot: string, bridgeScript: string): McpRegistrationReport {
        this.register(['cursor', 'vscode'], bridgeScript, workspaceRoot);
        return { cursorProject: true, vscodeNative: true };
    }
}
