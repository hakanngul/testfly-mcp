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

test('Antigravity registration writes the user-level file and status detects stale bridges',
  { skip: Number(process.versions.node.split('.')[0]) < 22 }, () => {
    const { McpRegistrar } = require('../vscode-extension/src/registrar.ts');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-mcp-home-'));
    try {
      const file = McpRegistrar.antigravityConfigPath(home);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { serverUrl: 'https://x.test' } } }));
      assert.equal(McpRegistrar.status('antigravity', undefined, home).registered, false);

      const bridge = path.join(home, 'bridge', 'bin', 'testfly-mcp.js');
      fs.mkdirSync(path.dirname(bridge), { recursive: true });
      fs.writeFileSync(bridge, '');
      McpRegistrar.register(['antigravity'], bridge, undefined, home);

      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(config.mcpServers.other.serverUrl, 'https://x.test');
      assert.deepEqual(config.mcpServers.testfly, { command: 'node', args: [bridge] });
      assert.equal(config.mcpServers.testfly.type, undefined);
      assert.equal(McpRegistrar.status('antigravity', undefined, home).bridgeExists, true);

      fs.rmSync(bridge);
      const stale = McpRegistrar.status('antigravity', undefined, home);
      assert.equal(stale.registered, true);
      assert.equal(stale.bridgeExists, false);

      assert.equal(McpRegistrar.hostTarget('Antigravity IDE'), 'antigravity');
      assert.equal(McpRegistrar.hostTarget('Visual Studio Code'), 'vscode');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

test('MCP preview shows exactly what registration writes, without writing',
  { skip: Number(process.versions.node.split('.')[0]) < 22 }, () => {
    const { McpRegistrar } = require('../vscode-extension/src/registrar.ts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-mcp-preview-'));
    const bridge = path.join(__dirname, '../bin/testfly-mcp.js');
    try {
      const file = path.join(root, '.vscode/mcp.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ servers: { custom: { command: 'custom' } } }));
      const before = fs.readFileSync(file, 'utf8');

      const preview = McpRegistrar.preview('vscode', bridge, root, root);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assert.deepEqual(preview.keptServers, ['custom']);
      assert.equal(preview.upToDate, false);
      assert.match(preview.snippet, /"type": "stdio"/);

      McpRegistrar.register(['vscode'], bridge, root, root);
      assert.equal(fs.readFileSync(file, 'utf8'), preview.after);
      assert.equal(McpRegistrar.preview('vscode', bridge, root, root).upToDate, true);

      fs.writeFileSync(file, '{ // comment\n}');
      assert.match(McpRegistrar.preview('vscode', bridge, root, root).error, /not valid JSON/);
      assert.match(McpRegistrar.preview('cursor', bridge, undefined, root).error, /workspace folder/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
