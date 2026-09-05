import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_TESTFLY_YML } from './constants';

export async function initTestFlyConfig(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('TestFly MCP: No workspace folder is open.');
        return;
    }

    const rootPath = folders[0].uri.fsPath;
    const configPath = path.join(rootPath, 'testfly.yml');

    if (fs.existsSync(configPath)) {
        const choice = await vscode.window.showWarningMessage(
            'testfly.yml already exists in this workspace. Overwrite it?',
            'Overwrite',
            'Cancel'
        );
        if (choice !== 'Overwrite') {
            return;
        }
    }

    try {
        fs.writeFileSync(configPath, DEFAULT_TESTFLY_YML, 'utf8');
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('TestFly MCP: testfly.yml created successfully.');
    } catch (err: any) {
        vscode.window.showErrorMessage(`TestFly MCP: Failed to create testfly.yml: ${err.message}`);
    }
}
