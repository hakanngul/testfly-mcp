const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('VS Code bundled template matches the canonical starter template', () => {
  assert.equal(fs.readFileSync(path.join(root, 'vscode-extension/resources/testfly.yml'), 'utf8'),
    fs.readFileSync(path.join(root, 'templates/testfly.yml'), 'utf8'));
});

test('CLI scaffolding uses the shared, SDK-compatible starter configuration', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-mcp-'));
  try {
    const project = path.join(temp, 'suite');
    const result = spawnSync(process.execPath, [path.join(root, 'bin/testfly-mcp.js'), 'init', project], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(project, 'testfly.yml'), 'utf8'),
      fs.readFileSync(path.join(root, 'templates/testfly.yml'), 'utf8'));
    assert.match(fs.readFileSync(path.join(project, 'pom.xml'), 'utf8'), /<testfly.version>1\.0\.7<\/testfly.version>/);

    // A second init must not discard the user's changes.
    fs.appendFileSync(path.join(project, 'testfly.yml'), '# user edit\n');
    const retry = spawnSync(process.execPath, [path.join(root, 'bin/testfly-mcp.js'), 'init', project], { encoding: 'utf8' });
    assert.notEqual(retry.status, 0);
    assert.match(fs.readFileSync(path.join(project, 'testfly.yml'), 'utf8'), /# user edit/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('MCP patch application requires explicit approval before touching files', () => {
  const request = {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'apply_remediation_patch', arguments: { patchFilePath: '/outside.patch' } }
  };
  const result = spawnSync(process.execPath, [path.join(root, 'bin/testfly-mcp.js')], {
    input: JSON.stringify(request) + '\n', encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout.trim());
  assert.match(response.result.content[0].text, /confirm: true/);
});
