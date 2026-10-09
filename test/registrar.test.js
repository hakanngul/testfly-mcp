const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Node 22+ can execute this dependency-free TypeScript module directly.
test('workspace registration preserves existing settings and refuses malformed JSON',
  { skip: Number(process.versions.node.split('.')[0]) < 22 }, () => {
    const { McpRegistrar } = require('../vscode-extension/src/registrar.ts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-mcp-settings-'));
    try {
      const cursor = path.join(root, '.cursor/mcp.json');
      const vscode = path.join(root, '.vscode/mcp.json');
      fs.mkdirSync(path.dirname(cursor), { recursive: true });
      fs.mkdirSync(path.dirname(vscode), { recursive: true });
      fs.writeFileSync(cursor, JSON.stringify({ preference: 'keep', mcpServers: { custom: { command: 'custom' } } }));
      fs.writeFileSync(vscode, JSON.stringify({ inputs: ['keep'], servers: { custom: { command: 'custom' } } }));
      McpRegistrar.registerWorkspace(root, path.join(__dirname, '../bin/testfly-mcp.js'));
      const cursorConfig = JSON.parse(fs.readFileSync(cursor, 'utf8'));
      const vscodeConfig = JSON.parse(fs.readFileSync(vscode, 'utf8'));
      assert.equal(cursorConfig.preference, 'keep');
      assert.equal(cursorConfig.mcpServers.custom.command, 'custom');
      assert.equal(cursorConfig.mcpServers.testfly.command, 'node');
      assert.equal(vscodeConfig.servers.custom.command, 'custom');
      assert.equal(vscodeConfig.servers.testfly.type, 'stdio');
      assert.deepEqual(vscodeConfig.inputs, ['keep']);

      fs.writeFileSync(vscode, '{ malformed');
      const cursorBefore = fs.readFileSync(cursor, 'utf8');
      assert.throws(() => McpRegistrar.registerWorkspace(root, path.join(__dirname, '../bin/testfly-mcp.js')));
      assert.equal(fs.readFileSync(cursor, 'utf8'), cursorBefore);
      assert.equal(fs.readFileSync(vscode, 'utf8'), '{ malformed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
