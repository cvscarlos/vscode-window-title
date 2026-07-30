import * as vscode from 'vscode';

/**
 * Output channel created on first use — an extension that never has anything to
 * say should not pay for a channel.
 */
export class Logger {
	private channel: vscode.OutputChannel | undefined;

	private ensure(): vscode.OutputChannel {
		this.channel ??= vscode.window.createOutputChannel('Window Title nt');
		return this.channel;
	}

	log(message: string): void {
		this.ensure().appendLine(`[${new Date().toISOString()}] ${message}`);
	}

	show(): void {
		this.ensure().show(true);
	}

	dispose(): void {
		this.channel?.dispose();
		this.channel = undefined;
	}
}
