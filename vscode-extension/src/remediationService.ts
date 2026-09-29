import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RemediationPatch {
    fileName: string;
    filePath: string;
    content: string;
    targetClass?: string;
    createdAt?: Date;
}

export class RemediationService {
    public static getRemediationsDir(workspaceRoot: string): string {
        return path.join(workspaceRoot, 'target', 'remediations');
    }

    public static listPatches(workspaceRoot: string): RemediationPatch[] {
        const dir = this.getRemediationsDir(workspaceRoot);
        if (!fs.existsSync(dir)) {
            return [];
        }
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.patch'));
            return files.map(file => {
                const fullPath = path.join(dir, file);
                const content = fs.readFileSync(fullPath, 'utf8');
                const stat = fs.statSync(fullPath);
                
                // Extract target class name from diff header if present (e.g. --- a/src/test/java/.../LoginTest.java)
                let targetClass: string | undefined;
                const match = content.match(/---\s+a\/(.+)/);
                if (match) {
                    targetClass = path.basename(match[1]);
                }

                return {
                    fileName: file,
                    filePath: fullPath,
                    content,
                    targetClass,
                    createdAt: stat.mtime
                };
            });
        } catch {
            return [];
        }
    }

    public static async applyPatch(workspaceRoot: string, patchFilePath: string): Promise<{ success: boolean; message: string }> {
        try {
            // First check if git is available and can apply
            const cmd = `git apply "${patchFilePath}"`;
            await execAsync(cmd, { cwd: workspaceRoot });
            return {
                success: true,
                message: `Successfully applied patch ${path.basename(patchFilePath)} to source code.`
            };
        } catch (err: any) {
            return {
                success: false,
                message: `Failed to apply patch: ${err.message}`
            };
        }
    }
}
