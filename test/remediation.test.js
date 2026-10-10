const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const nodeMajor = Number(process.versions.node.split('.')[0]);

const PATCH = [
  'diff --git a/src/test/java/LoginTest.java b/src/test/java/LoginTest.java',
  '--- a/src/test/java/LoginTest.java',
  '+++ b/src/test/java/LoginTest.java',
  '@@ -40,4 +40,4 @@ public void login() {',
  '     open("/login");',
  '-    click(By.id("login"));',
  '+    click(By.id("login-button"));',
  '     assertTitle("Products");',
  '',
  '\\ No newline at end of file',
  '--- a/src/test/java/Pages.java',
  '+++ b/src/test/java/Pages.java',
  '@@ -7 +7,2 @@',
  '-old',
  '+new',
  '+extra',
  ''
].join('\n');

test('patch parser reports every file, hunk and changed line range', { skip: nodeMajor < 22 }, () => {
  const { parsePatch } = require('../vscode-extension/src/remediationService.ts');
  const files = parsePatch(PATCH);
  assert.equal(files.length, 2);
  assert.equal(files[0].newPath, 'src/test/java/LoginTest.java');
  assert.deepEqual([files[0].added, files[0].removed], [1, 1]);
  const hunk = files[0].hunks[0];
  assert.deepEqual([hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines, hunk.section], [40, 4, 40, 4, 'public void login() {']);
  assert.deepEqual(hunk.lines.map(l => l.kind).join(''), ' -+  ');
  assert.deepEqual([files[1].hunks[0].oldLines, files[1].hunks[0].newLines, files[1].added], [1, 2, 2]);
});

test('patches are matched to the failure TestFly recorded for their test', { skip: nodeMajor < 22 }, () => {
  const { RemediationService, patchFileNameFor } = require('../vscode-extension/src/remediationService.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-remediation-'));
  try {
    const testId = 'io.example.LoginTest.login[chrome]';
    assert.equal(patchFileNameFor(testId), 'io.example.LoginTest.login_chrome_.patch');
    fs.mkdirSync(path.join(root, 'target'));
    fs.writeFileSync(path.join(root, 'target', 'testfly-metrics.json'), JSON.stringify({ tests: [
      { testId, status: 'FAILED', errorMessage: 'NoSuchElementException: #login', aiAnalysis: 'The id changed to login-button.' },
      { testId: 'other', status: 'PASSED' }
    ] }));
    const context = RemediationService.failureContext(root, 'io.example.LoginTest.login_chrome_.patch');
    assert.equal(context.errorMessage, 'NoSuchElementException: #login');
    assert.equal(context.aiAnalysis, 'The id changed to login-button.');
    assert.equal(context.metricsFile, path.join('target', 'testfly-metrics.json'));
    assert.equal(RemediationService.failureContext(root, 'missing.patch'), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
