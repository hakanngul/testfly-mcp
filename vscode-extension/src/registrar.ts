import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface McpRegistrationReport {
    cursorGlobal: boolean;
    cursorProject: boolean;
    claudeDesktop: boolean;
    vscodeNative: boolean;
    claudeCode: boolean;
}

function writeMcpJsonFile(filePath: string, serverKey: string, command: string, args: string[]): boolean {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        let settings: Record<string, any> = {};
        if (fs.existsSync(filePath)) {
            try {
                settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch {
                settings = {};
            }
        }
        const mcpServers = settings.mcpServers || {};
        
        // Remove old seleniumboot legacy key if present
        if (mcpServers.seleniumboot) {
            delete mcpServers.seleniumboot;
        }

        mcpServers[serverKey] = {
            command,
            args
        };

        settings.mcpServers = mcpServers;
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch {
        return false;
    }
}

export class McpRegistrar {
    /**
     * 1-Click Multi-Assistant Setup:
     * Registers both Playwright MCP (for live browser) and TestFly Bridge (for Java codegen & agentic tools)
     */
    public static async registerAll(workspaceRoot?: string): Promise<McpRegistrationReport> {
        const report: McpRegistrationReport = {
            cursorGlobal: false,
            cursorProject: false,
            claudeDesktop: false,
            vscodeNative: false,
            claudeCode: false
        };

        // 1. Playwright MCP configuration
        const pwKey = 'playwright';
        const pwCmd = 'npx';
        const pwArgs = ['-y', '@modelcontextprotocol/server-playwright'];

        // 2. TestFly Bridge configuration
        const tfKey = 'testfly';
        const tfCmd = 'npx';
        const tfArgs = ['-y', '@testfly/mcp'];

        // A. Cursor Global (~/.cursor/mcp.json)
        const cursorGlobalPath = path.join(os.homedir(), '.cursor', 'mcp.json');
        const c1 = writeMcpJsonFile(cursorGlobalPath, pwKey, pwCmd, pwArgs);
        const c2 = writeMcpJsonFile(cursorGlobalPath, tfKey, tfCmd, tfArgs);
        report.cursorGlobal = c1 && c2;

        // B. Cursor Project (.cursor/mcp.json)
        if (workspaceRoot) {
            const cursorProjectPath = path.join(workspaceRoot, '.cursor', 'mcp.json');
            const cp1 = writeMcpJsonFile(cursorProjectPath, pwKey, pwCmd, pwArgs);
            const cp2 = writeMcpJsonFile(cursorProjectPath, tfKey, tfCmd, tfArgs);
            report.cursorProject = cp1 && cp2;
        }

        // C. Claude Desktop
        let claudeDesktopPath = '';
        if (process.platform === 'darwin') {
            claudeDesktopPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        } else if (process.platform === 'win32') {
            claudeDesktopPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
        } else {
            claudeDesktopPath = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
        }
        const cd1 = writeMcpJsonFile(claudeDesktopPath, pwKey, pwCmd, pwArgs);
        const cd2 = writeMcpJsonFile(claudeDesktopPath, tfKey, tfCmd, tfArgs);
        report.claudeDesktop = cd1 && cd2;

        // D. VS Code Native Copilot (.vscode/mcp.json)
        if (workspaceRoot) {
            const vsMcpPath = path.join(workspaceRoot, '.vscode', 'mcp.json');
            const v1 = writeMcpJsonFile(vsMcpPath, pwKey, pwCmd, pwArgs);
            const v2 = writeMcpJsonFile(vsMcpPath, tfKey, tfCmd, tfArgs);
            report.vscodeNative = v1 && v2;
        }

        // E. Claude Code CLI (~/.claude/settings.json)
        const claudeCodePath = path.join(os.homedir(), '.claude', 'settings.json');
        const cc1 = writeMcpJsonFile(claudeCodePath, pwKey, pwCmd, pwArgs);
        const cc2 = writeMcpJsonFile(claudeCodePath, tfKey, tfCmd, tfArgs);
        report.claudeCode = cc1 && cc2;

        return report;
    }

    public static isRegisteredAnywhere(): boolean {
        const cursorGlobal = path.join(os.homedir(), '.cursor', 'mcp.json');
        const claudeCode = path.join(os.homedir(), '.claude', 'settings.json');
        if (fs.existsSync(cursorGlobal) || fs.existsSync(claudeCode)) return true;
        return false;
    }
}
