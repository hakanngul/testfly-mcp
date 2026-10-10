import * as fs from 'fs';
import * as path from 'path';

const FILES = [path.join('bin', 'testfly-mcp.js'), path.join('templates', 'testfly.yml')];

/**
 * Copy the bundled MCP bridge to a version-independent directory and return its script path.
 *
 * The extension directory name contains the version, so registering a script inside it would
 * leave MCP configs pointing at a deleted path after every update. Global storage is stable,
 * and refreshing it on each activation keeps the registered bridge in step with the extension.
 */
export function installBundledBridge(extensionPath: string, storagePath: string): string | undefined {
    const source = path.join(extensionPath, 'resources', 'bridge');
    const target = path.join(storagePath, 'bridge');
    if (!fs.existsSync(path.join(source, FILES[0]))) return undefined;
    for (const file of FILES) {
        const from = path.join(source, file);
        const to = path.join(target, file);
        if (!fs.existsSync(from)) continue;
        const next = fs.readFileSync(from);
        if (fs.existsSync(to) && fs.readFileSync(to).equals(next)) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, next);
    }
    return path.join(target, FILES[0]);
}
