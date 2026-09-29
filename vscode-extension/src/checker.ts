import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ActionCacheService } from './actionCacheService';
import { RemediationService } from './remediationService';

const execAsync = promisify(exec);

export interface EnvironmentDiagnostics {
    javaInstalled: boolean;
    javaVersion?: string;
    mavenInstalled: boolean;
    mavenVersion?: string;
    nodeInstalled: boolean;
    nodeVersion?: string;
    hasTestFlyYml: boolean;
    hasPomXml: boolean;
    actionCacheCount: number;
    remediationPatchCount: number;
    details: string;
}

export class Checker {
    public static async getDiagnostics(workspaceRoot?: string): Promise<EnvironmentDiagnostics> {
        let javaInstalled = false;
        let javaVersion: string | undefined;
        try {
            const { stdout, stderr } = await execAsync('java -version');
            const output = stderr || stdout;
            javaInstalled = true;
            const match = output.match(/version\s+"([^"]+)"/);
            javaVersion = match ? match[1] : output.split('\n')[0].trim();
        } catch {}

        let mavenInstalled = false;
        let mavenVersion: string | undefined;
        try {
            const { stdout } = await execAsync('mvn -version');
            mavenInstalled = true;
            mavenVersion = stdout.split('\n')[0].trim();
        } catch {}

        let nodeInstalled = false;
        let nodeVersion: string | undefined;
        try {
            const { stdout } = await execAsync('node -v');
            nodeInstalled = true;
            nodeVersion = stdout.trim();
        } catch {}

        let hasTestFlyYml = false;
        let hasPomXml = false;
        let actionCacheCount = 0;
        let remediationPatchCount = 0;

        if (workspaceRoot) {
            hasTestFlyYml = fs.existsSync(path.join(workspaceRoot, 'testfly.yml')) ||
                            fs.existsSync(path.join(workspaceRoot, 'testfly.yaml'));
            hasPomXml = fs.existsSync(path.join(workspaceRoot, 'pom.xml'));
            actionCacheCount = ActionCacheService.readCache(workspaceRoot).length;
            remediationPatchCount = RemediationService.listPatches(workspaceRoot).length;
        }

        const lines = [
            `Java (JDK): ${javaInstalled ? `Installed (${javaVersion})` : 'Not Found (Java 21 recommended)'}`,
            `Maven: ${mavenInstalled ? `Installed (${mavenVersion})` : 'Not Found in PATH'}`,
            `Node.js: ${nodeInstalled ? `Installed (${nodeVersion})` : 'Not Found in PATH'}`,
            `Workspace testfly.yml: ${hasTestFlyYml ? 'Present (✓)' : 'Missing (Use Init Config)'}`,
            `Workspace pom.xml: ${hasPomXml ? 'Present (✓)' : 'Missing'}`,
            `Cached AI Goals (act): ${actionCacheCount}`,
            `Pending Self-Healing Patches: ${remediationPatchCount}`
        ];

        return {
            javaInstalled,
            javaVersion,
            mavenInstalled,
            mavenVersion,
            nodeInstalled,
            nodeVersion,
            hasTestFlyYml,
            hasPomXml,
            actionCacheCount,
            remediationPatchCount,
            details: lines.join('\n')
        };
    }
}
