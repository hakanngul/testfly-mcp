const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'vscode-extension', 'resources', 'testfly.yml');
fs.copyFileSync(path.join(root, 'templates', 'testfly.yml'), target);
