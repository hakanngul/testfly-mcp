import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface DiffLine {
    kind: ' ' | '+' | '-';
    text: string;
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    /** Text after the closing @@, usually the enclosing method. */
    section: string;
    lines: DiffLine[];
}

export interface DiffFile {
    oldPath?: string;
    newPath?: string;
    hunks: DiffHunk[];
    added: number;
    removed: number;
}

/** Failure details TestFly recorded for the test a patch belongs to (target/testfly-metrics.json). */
export interface FailureContext {
    testId: string;
    testClassName?: string;
    status?: string;
    errorMessage?: string;
    aiAnalysis?: string;
    browser?: string;
    screenshotPath?: string;
    metricsFile: string;
}

export interface AppliedPatch {
    fileName: string;
    appliedAt: Date;
}

/** Same rule as RemediationPatchGenerator.sanitizeFileName, which names patches "<testId>.patch". */
export function patchFileNameFor(testId: string): string {
    return testId.replace(/[^a-zA-Z0-9._-]/g, '_') + '.patch';
}

function stripPrefix(header: string): string | undefined {
    const file = header.trim().split('\t')[0];
    if (file === '/dev/null') return undefined;
    return file.replace(/^[ab]\//, '');
}

/** Parse a unified diff into files and hunks. Lines outside hunks (git headers, prose) are skipped. */
export function parsePatch(content: string): DiffFile[] {
    const files: DiffFile[] = [];
    let file: DiffFile | undefined;
    let hunk: DiffHunk | undefined;
    const lines = content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
            file = { oldPath: stripPrefix(line.slice(4)), newPath: stripPrefix(lines[i + 1].slice(4)), hunks: [], added: 0, removed: 0 };
            files.push(file);
            hunk = undefined;
            i++;
            continue;
        }
        const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(line);
        if (header) {
            if (!file) {
                file = { hunks: [], added: 0, removed: 0 };
                files.push(file);
            }
            hunk = {
                oldStart: Number(header[1]), oldLines: header[2] === undefined ? 1 : Number(header[2]),
                newStart: Number(header[3]), newLines: header[4] === undefined ? 1 : Number(header[4]),
                section: header[5].trim(), lines: []
            };
            file.hunks.push(hunk);
            continue;
        }
        if (!hunk || !file) continue;
        const kind = line[0];
        if (kind === '+' || kind === '-' || kind === ' ' || line === '') {
            const k = (line === '' ? ' ' : kind) as DiffLine['kind'];
            hunk.lines.push({ kind: k, text: line.slice(1) });
            if (k === '+') file.added++;
            else if (k === '-') file.removed++;
        } else if (!line.startsWith('\\')) {
            hunk = undefined;
        }
    }
    return files;
}

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

    public static getAppliedDir(workspaceRoot: string): string {
        return path.join(this.getRemediationsDir(workspaceRoot), 'applied');
    }

    /** Patches already applied from the reviewer, newest first. */
    public static listApplied(workspaceRoot: string): AppliedPatch[] {
        const dir = this.getAppliedDir(workspaceRoot);
        try {
            return fs.readdirSync(dir)
                .filter(f => f.endsWith('.patch'))
                .map(f => ({ fileName: f, appliedAt: fs.statSync(path.join(dir, f)).mtime }))
                .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
        } catch {
            return [];
        }
    }

    /** Resolve an applied patch by file name, accepting only files directly inside applied/. */
    public static resolveApplied(workspaceRoot: string, fileName: string): string | undefined {
        if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !fileName.endsWith('.patch')) return undefined;
        const fullPath = path.join(this.getAppliedDir(workspaceRoot), fileName);
        return fs.existsSync(fullPath) ? fullPath : undefined;
    }

    /**
     * Failure details for the test that produced a patch, read from the metrics TestFly writes
     * next to its report. Undefined when no run recorded that test.
     */
    public static failureContext(workspaceRoot: string, patchFileName: string): FailureContext | undefined {
        for (const dir of ['target', 'build']) {
            const metricsFile = path.join(workspaceRoot, dir, 'testfly-metrics.json');
            let tests: any[];
            try {
                tests = JSON.parse(fs.readFileSync(metricsFile, 'utf8'))?.tests;
            } catch {
                continue;
            }
            if (!Array.isArray(tests)) continue;
            const test = [...tests].reverse().find(t => typeof t?.testId === 'string' && patchFileNameFor(t.testId) === patchFileName);
            if (!test) continue;
            const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
            return {
                testId: test.testId,
                testClassName: text(test.testClassName),
                status: text(test.status),
                errorMessage: text(test.errorMessage),
                aiAnalysis: text(test.aiAnalysis),
                browser: text(test.browser),
                screenshotPath: text(test.screenshotPath),
                metricsFile: path.relative(workspaceRoot, metricsFile)
            };
        }
        return undefined;
    }

    /** Dry run of "git apply" against the current working tree. */
    public static async checkPatch(workspaceRoot: string, patchFilePath: string): Promise<{ ok: boolean; message: string }> {
        try {
            await execFileAsync('git', ['apply', '--check', this.verifiedPatchPath(workspaceRoot, patchFilePath)], { cwd: workspaceRoot });
            return { ok: true, message: 'Applies cleanly to the current code.' };
        } catch (err: any) {
            return { ok: false, message: gitMessage(err) };
        }
    }

    private static verifiedPatchPath(workspaceRoot: string, patchFilePath: string): string {
        const root = fs.realpathSync(this.getRemediationsDir(workspaceRoot));
        const patch = fs.realpathSync(patchFilePath);
        if (path.dirname(patch) !== root || !patch.endsWith('.patch')) {
            throw new Error('Patch must be a .patch file directly inside target/remediations.');
        }
        return patch;
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

    /** Resolve a patch by file name, accepting only files directly inside target/remediations. */
    public static resolvePatch(workspaceRoot: string, fileName: string): string | undefined {
        if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !fileName.endsWith('.patch')) {
            return undefined;
        }
        const fullPath = path.join(this.getRemediationsDir(workspaceRoot), fileName);
        return fs.existsSync(fullPath) ? fullPath : undefined;
    }

    /** Move an applied patch to target/remediations/applied/ so it is not offered again. */
    public static archiveApplied(workspaceRoot: string, patchFilePath: string): string {
        const appliedDir = path.join(this.getRemediationsDir(workspaceRoot), 'applied');
        fs.mkdirSync(appliedDir, { recursive: true });
        const parsed = path.parse(patchFilePath);
        let destination = path.join(appliedDir, parsed.base);
        for (let i = 1; fs.existsSync(destination); i++) {
            destination = path.join(appliedDir, `${parsed.name}-${i}${parsed.ext}`);
        }
        fs.renameSync(patchFilePath, destination);
        return destination;
    }

    public static async applyPatch(workspaceRoot: string, patchFilePath: string): Promise<{ success: boolean; message: string }> {
        try {
            const patch = this.verifiedPatchPath(workspaceRoot, patchFilePath);
            await execFileAsync('git', ['apply', '--check', patch], { cwd: workspaceRoot });
            await execFileAsync('git', ['apply', patch], { cwd: workspaceRoot });
            return {
                success: true,
                message: `Successfully applied patch ${path.basename(patchFilePath)} to source code.`
            };
        } catch (err: any) {
            return {
                success: false,
                message: `Failed to apply patch: ${gitMessage(err)}`
            };
        }
    }
}

/** git's own explanation (stderr) is more useful than the "Command failed: git apply …" wrapper. */
function gitMessage(err: any): string {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
    if (stderr) return stderr;
    if (err?.code === 'ENOENT') return 'git was not found in PATH.';
    return String(err?.message ?? err);
}
