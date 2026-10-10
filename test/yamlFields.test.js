const test = require('node:test');
const assert = require('node:assert/strict');

const nodeMajor = Number(process.versions.node.split('.')[0]);

test('visual config edits keep comments, unknown keys and key spelling',
  { skip: nodeMajor < 22 }, () => {
    const { getValue, setValue } = require('../vscode-extension/src/yamlFields.ts');
    const yaml = [
      '# header',
      'Browser:',
      '  name: chrome   # pick one',
      '  custom: keep',
      'timeouts:',
      '    page-load: 30',
      ''
    ].join('\n');

    assert.equal(getValue(yaml, ['browser', 'name']), 'chrome');
    assert.equal(getValue(yaml, ['timeouts', 'pageLoad']), 30);

    let next = setValue(yaml, ['browser', 'name'], 'firefox');
    assert.match(next, /^  name: firefox   # pick one$/m);
    assert.match(next, /custom: keep/);

    next = setValue(next, ['timeouts', 'explicit'], 15);
    assert.match(next, /^    page-load: 30\n    explicit: 15$/m);

    next = setValue(next, ['reporting', 'allure', 'enabled'], true);
    assert.equal(getValue(next, ['reporting', 'allure', 'enabled']), true);
    assert.match(next, /^# header$/m);
  });

test('visual config quotes ambiguous strings and refuses inline maps',
  { skip: nodeMajor < 22 }, () => {
    const { getValue, setValue } = require('../vscode-extension/src/yamlFields.ts');
    const quoted = setValue('execution:\n  mode: local\n', ['execution', 'baseUrl'], 'https://a.test/x #frag');
    assert.equal(getValue(quoted, ['execution', 'baseUrl']), 'https://a.test/x #frag');
    assert.throws(() => setValue('browser: { name: chrome }\n', ['browser', 'name'], 'edge'), /inline YAML/);
  });
