const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const nodeMajor = Number(process.versions.node.split('.')[0]);

// The on-disk format io.testfly.agent.ActionCache reads and writes: Map<"/path::goal", ActionPlan>.
const javaCache = () => ({
  '/login::log in as standard user': { goal: 'Log in as standard user', urlPattern: 'https://shop.test/login', steps: [{ action: 'CLICK', locator: '#login' }], createdAt: 1 },
  '/cart::log in as standard user': { goal: 'Log in as standard user', urlPattern: 'https://shop.test/cart', steps: [], createdAt: 2 },
  "/::it's a goal": { goal: "It's a goal", urlPattern: '', steps: [], createdAt: 3 }
});

function withCache(content, fn) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-cache-'));
  const file = path.join(workspace, '.testfly', 'action-cache.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  try {
    fn(workspace, () => JSON.parse(fs.readFileSync(file, 'utf8')), file);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test('extension reads and writes the action cache in the map format TestFly loads',
  { skip: nodeMajor < 22 }, () => {
    const { ActionCacheService, buildCacheKey } = require('../vscode-extension/src/actionCacheService.ts');

    assert.equal(buildCacheKey('https://shop.test/login?x=1', '  Log In '), '/login::log in');
    assert.equal(buildCacheKey('/cart#top', 'Goal'), '/cart::goal');

    withCache(javaCache(), (workspace, read) => {
      const snapshot = ActionCacheService.read(workspace);
      assert.equal(snapshot.plans.length, 3);
      assert.deepEqual(snapshot.plans.map(p => p.key), Object.keys(javaCache()));

      // Invalidating one entry keeps the same goal on other pages and the object shape.
      assert.equal(ActionCacheService.invalidate(workspace, '/login::log in as standard user'), true);
      assert.deepEqual(Object.keys(read()), ['/cart::log in as standard user', "/::it's a goal"]);
      assert.equal(ActionCacheService.invalidate(workspace, 'missing'), false);

      assert.equal(ActionCacheService.invalidateGoal(workspace, "IT'S A GOAL"), true);
      assert.deepEqual(Object.keys(read()), ['/cart::log in as standard user']);

      assert.equal(ActionCacheService.clearAll(workspace), true);
      assert.deepEqual(read(), {});
    });
  });

test('extension migrates legacy array caches and reports unreadable files instead of hiding them',
  { skip: nodeMajor < 22 }, () => {
    const { ActionCacheService } = require('../vscode-extension/src/actionCacheService.ts');

    withCache(Object.values(javaCache()), (workspace, read) => {
      assert.equal(ActionCacheService.read(workspace).plans[0].key, '/login::log in as standard user');
      ActionCacheService.invalidate(workspace, '/cart::log in as standard user');
      assert.equal(Array.isArray(read()), false);
      assert.equal(Object.keys(read()).length, 2);
    });

    withCache('{ not json', (workspace, _read, file) => {
      const snapshot = ActionCacheService.read(workspace);
      assert.equal(snapshot.exists, true);
      assert.ok(snapshot.error);
      // A broken file is never overwritten by an invalidate.
      assert.equal(ActionCacheService.invalidateGoal(workspace, 'x'), false);
      assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
    });
  });

test('MCP manage_action_cache keeps the TestFly map format', () => {
  const call = (workspace, args) => {
    const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'manage_action_cache', arguments: { workspaceRoot: workspace, ...args } } };
    const result = spawnSync(process.execPath, [path.join(root, 'bin/testfly-mcp.js')], { input: JSON.stringify(request) + '\n', encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim()).result.content[0].text;
  };

  withCache(javaCache(), (workspace, read) => {
    assert.match(call(workspace, { action: 'invalidate', key: '/cart::log in as standard user' }), /Invalidated 1/);
    assert.deepEqual(Object.keys(read()), ['/login::log in as standard user', "/::it's a goal"]);

    assert.match(call(workspace, { action: 'invalidate', goal: 'nope' }), /No cached plan/);
    assert.match(call(workspace, { action: 'invalidate', goal: 'log in as standard USER' }), /Invalidated 1/);
    assert.deepEqual(Object.keys(read()), ["/::it's a goal"]);

    call(workspace, { action: 'clear_all' });
    assert.deepEqual(read(), {});
  });
});
