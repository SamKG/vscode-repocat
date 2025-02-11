import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export function activate(context: vscode.ExtensionContext) {
	let outputChannel = vscode.window.createOutputChannel("repocat");
	/**
	 * Command to explicitly install repocat
	 */
	const installCmd = vscode.commands.registerCommand('repocat.install', async () => {
		try {
			const workspaceRoot = getWorkspaceRoot();
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('No workspace folder found. Open a folder and try again.');
				return;
			}

			await installRepocat();
			vscode.window.showInformationMessage('Repocat has been successfully installed/updated.');
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to install repocat: ${error.message || error}`);
		}
	});

	/**
	 * Command to run repocat:
	 * 1) Checks if repocat is installed.
	 * 2) Installs if missing.
	 * 3) Runs repocat with user settings, copying output to clipboard.
	 */
	const runCmd = vscode.commands.registerCommand('repocat.run', async () => {
		try {
			const config = vscode.workspace.getConfiguration('repocat');

			// Check if repocat is installed, if not, install it
			const isInstalled = await isRepocatInstalled();
			if (!isInstalled) {
				await installRepocat();
			}

			const includeGlobs: string[] = config.get('include') || [];
			const excludeGlobs: string[] = config.get('exclude') || [];

			const workspaceRoot = getWorkspaceRoot();
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('No workspace folder found. Open a folder and try again.');
				return;
			}


			// Build the repocat command with globs
			const outputFilePath = await makeTempFile();
			const outputArgs = ['--output', outputFilePath];
			const includeArgs = includeGlobs.length == 0 ? [] : includeGlobs.flatMap(g => ['--include', g]);
			const excludeArgs = excludeGlobs.length == 0 ? [] : excludeGlobs.flatMap(g => ['--exclude', g]);
			const repocatCmd = `repocat ${[...includeArgs, ...excludeArgs, ...outputArgs].join(' ')}`;

			// Run repocat
			const repocatOutput = await runCommand(repocatCmd, workspaceRoot);
			// print the output to the console
			outputChannel.append(repocatOutput);

			// read the output file
			const outputData = await fs.readFile(outputFilePath, 'utf-8');

			if (outputData.length == 0) {
				vscode.window.showInformationMessage('repocat did not output any data! Please double-check your globs.');
				return;
			}

			// Copy output to clipboard
			await vscode.env.clipboard.writeText(outputData);

			vscode.window.showInformationMessage('Repocat output has been copied to your clipboard!');
		} catch (err: any) {
			vscode.window.showErrorMessage(`Failed to run repocat: ${err.message || err}`);
		}
	});

	context.subscriptions.push(installCmd, runCmd);
}

/**
 * Clean up if needed
 */
export function deactivate() { }

/**
 * Returns the first workspace root path or undefined if none.
 */
function getWorkspaceRoot(): string | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return undefined;
	}
	return workspaceFolders[0].uri.fsPath;
}

/**
 * Check if repocat is installed by looking it up in the system PATH.
 */
async function isRepocatInstalled(): Promise<boolean> {
	try {
		// On Windows, 'where repocat'; on macOS/Linux, 'which repocat'
		const cmd = process.platform === 'win32' ? 'where repocat' : 'which repocat';
		await runCommand(cmd, process.cwd());
		return true;
	} catch {
		return false;
	}
}

/**
 * Installs repocat using Cargo. If user wants pinned version or other flags,
 * adjust the command. For example: 'cargo install repocat --force'
 */
async function installRepocat(): Promise<void> {
	await runCommand('cargo install repocat');
}

/**
 * Runs a shell command in the given working directory and returns stdout.
 */
function runCommand(command: string, cwd?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(error);
				return;
			}
			// Some tools (or warnings) use stderr, so handle carefully
			if (stderr.trim().length > 0) {
				// If your tool writes normal data to stderr, you might want to combine them
				// For example, resolve(stdout + stderr) or handle differently
				// For now, we’ll just combine them:
				resolve(stdout + '\n' + stderr);
				return;
			}
			resolve(stdout);
		});
	});
}


async function makeTempFile(): Promise<string> {
	const tmpDir = path.join(process.env.TEMP || process.env.TMPDIR || process.env.TMP || '/tmp', 'vscode-repocat');
	await fs.mkdir(tmpDir, { recursive: true });
	const filePath = path.join(tmpDir, `repocat-${Date.now()}.txt`);
	await fs.writeFile(filePath, '');
	return filePath;
}