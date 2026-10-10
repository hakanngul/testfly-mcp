const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'vscode-extension', 'resources');
fs.copyFileSync(path.join(root, 'templates', 'testfly.yml'), path.join(resources, 'testfly.yml'));

// Bundle the MCP bridge so the extension can register it without asking for a path.
// The bridge resolves ../templates/testfly.yml, so keep the bin/ + templates/ layout.
const bridge = path.join(resources, 'bridge');
fs.mkdirSync(path.join(bridge, 'bin'), { recursive: true });
fs.mkdirSync(path.join(bridge, 'templates'), { recursive: true });
fs.copyFileSync(path.join(root, 'bin', 'testfly-mcp.js'), path.join(bridge, 'bin', 'testfly-mcp.js'));
fs.copyFileSync(path.join(root, 'templates', 'testfly.yml'), path.join(bridge, 'templates', 'testfly.yml'));
