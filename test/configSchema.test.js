const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const nodeMajor = Number(process.versions.node.split('.')[0]);

test('editor validation mirrors TestFly startup rules and flags silent no-ops', { skip: nodeMajor < 22 }, () => {
  const { validate } = require('../vscode-extension/src/configSchema.ts');
  const byKey = (problems) => Object.fromEntries(problems.map(p => [p.key, p.level]));

  assert.deepEqual(byKey(validate({})), {
    'execution.mode': 'error', 'browser.name': 'error', 'timeouts.explicit': 'error', 'timeouts.pageLoad': 'error'
  });

  const base = { 'execution.mode': 'local', 'browser.name': 'chrome', 'timeouts.explicit': 10, 'timeouts.pageLoad': 30 };
  assert.deepEqual(validate(base), []);

  const problems = byKey(validate({ ...base,
    'execution.mode': 'saucelabs', 'execution.saucelabs.username': '${SAUCE_USERNAME}',
    'execution.threadCount': 4, 'ai.generatePatch': true, 'reporting.reportPortal.enabled': true }));
  assert.equal(problems['execution.saucelabs.accessKey'], 'error');
  assert.equal(problems['execution.saucelabs.username'], undefined);
  assert.equal(problems['execution.threadCount'], 'warning');
  assert.equal(problems['ai.apiKey'], 'warning');
  assert.equal(problems['reporting.reportPortal.endpoint'], 'error');

  assert.equal(byKey(validate({ ...base, 'ai.apiKey': 'sk-ant-literal' }))['ai.apiKey'], 'warning');
  assert.deepEqual(validate({ ...base, 'ai.apiKey': '${ANTHROPIC_API_KEY}', 'ai.generatePatch': true }), []);
  assert.equal(byKey(validate({ ...base, 'ai.enabled': false, 'locators.aiHealing': true }))['ai.enabled'], 'warning');
});

test('every editor field exists in the starter template or is optional in TestFly', { skip: nodeMajor < 22 }, () => {
  const { FIELDS } = require('../vscode-extension/src/configSchema.ts');
  const { getValue } = require('../vscode-extension/src/yamlFields.ts');
  const starter = fs.readFileSync(path.join(__dirname, '../templates/testfly.yml'), 'utf8');
  // Starter keys must surface in the form, so the form never hides what the template sets.
  for (const key of ['execution.mode', 'execution.baseUrl', 'api.baseUrl', 'api.timeoutSeconds', 'api.logBody', 'browser.lifecycle', 'timeouts.explicit', 'ai.generatePatch', 'locators.aiHealing']) {
    assert.ok(FIELDS.some(f => f.path.join('.') === key), key);
    assert.notEqual(getValue(starter, key.split('.')), undefined, key);
  }
  assert.equal(new Set(FIELDS.map(f => f.path.join('.'))).size, FIELDS.length);
});
