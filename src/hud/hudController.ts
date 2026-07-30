import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	MIN_INTERVAL_MILLISECONDS,
	needsInjection,
	readableTextOn,
	setFeatureEnabled,
	type Settings,
} from '../configuration/settings';
import type { Logger } from '../log';
import { buildHudAssets, type HudAssets } from './assets';
import {
	applyPatch,
	PatchError,
	readPatchState,
	removePatch,
	resolveTarget,
	restoreFromBackup,
	type PatchTarget,
} from './workbenchPatcher';

/**
 * Remembers whether we have modified this installation. Consulted before any
 * filesystem work, so the default configuration — HUD off, never enabled —
 * performs no I/O at all.
 */
const PATCHED_KEY = 'hud.patched';

const ENABLE_DETAIL = [
	'This adds two files next to VS Code’s workbench.html and references them from it.',
	'',
	'Consequences:',
	'• VS Code will warn that its installation “appears to be corrupt”. That is expected — it is VS Code noticing this change — and you can dismiss it permanently.',
	'• A VS Code update replaces these files; the extension re-applies the change automatically.',
	'• “Window Title nt: Remove In-Window Display” reverts everything, whichever features are on.',
].join('\n');

const FAILURE_HINTS: Record<string, string> = {
	notWritable:
		'Your user cannot write to the VS Code installation directory, so nothing could be shown inside the window. The status-bar project name still works.',
	unsupported:
		'This VS Code build keeps its workbench page somewhere unexpected, so nothing could be shown inside the window. The status-bar project name still works.',
	unexpectedLayout:
		'The workbench page has an unfamiliar structure — most likely another extension has modified it too. Nothing was changed. Try “Window Title nt: Restore Workbench From Backup”.',
	ioFailure:
		'The in-window display could not be installed. The status-bar project name still works.',
};

export class HudController {
	private target: PatchTarget | undefined;
	private targetResolved = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly log: Logger
	) {}

	private ensureTarget(): PatchTarget {
		if (!this.targetResolved) {
			this.targetResolved = true;
			this.target = resolveTarget(vscode.env.appRoot);
		}
		if (this.target === undefined) {
			throw new PatchError(
				'unsupported',
				`No workbench page found under ${vscode.env.appRoot}. This VS Code layout is not supported.`
			);
		}
		return this.target;
	}

	private assetsFor(settings: Settings): HudAssets {
		return buildHudAssets({
			hudEnabled: settings.hud.enabled,
			displayMilliseconds: settings.hud.displayMilliseconds,
			minIntervalMilliseconds: MIN_INTERVAL_MILLISECONDS,
			position: settings.hud.position,
			fontSizePixels: settings.hud.fontSizePixels,
			uppercase: settings.hud.uppercase,
			color: settings.hud.color,
			fontFamily: settings.hud.fontFamily,
			showOnWindowOpen: settings.hud.showOnWindowOpen,
			pill: {
				enabled: settings.titleBarPill.enabled,
				position: settings.titleBarPill.position,
				color: settings.titleBarPill.color,
				textColor:
					settings.titleBarPill.color === '' ? '' : readableTextOn(settings.titleBarPill.color),
				uppercase: settings.titleBarPill.uppercase,
				fontFamily: settings.titleBarPill.fontFamily,
				bordered: settings.titleBarPill.bordered,
			},
		});
	}

	/** Backups are per VS Code build, since each build ships its own workbench. */
	private backupPath(): string {
		return path.join(
			this.context.globalStorageUri.fsPath,
			'backup',
			`workbench-${vscode.version}.html`
		);
	}

	private isPatchRecorded(): boolean {
		return this.context.globalState.get<boolean>(PATCHED_KEY, false);
	}

	private async recordPatch(patched: boolean): Promise<void> {
		await this.context.globalState.update(PATCHED_KEY, patched);
	}

	private async install(settings: Settings): Promise<void> {
		const target = this.ensureTarget();
		const assets = this.assetsFor(settings);

		const before = readPatchState(target, assets.hash);
		if (before === 'current') {
			await this.recordPatch(true);
			return;
		}

		applyPatch(target, assets, this.backupPath());
		await this.recordPatch(true);

		const refreshed = before === 'stale';
		this.log.log(
			`${refreshed ? 'Refreshed' : 'Installed'} the in-window display in ${target.htmlPath} (assets ${assets.hash}).`
		);
		await this.promptReload(
			refreshed
				? 'In-window display settings changed. Reload the window to apply them.'
				: 'In-window display enabled. Reload the window to apply it.'
		);
	}

	private async uninstallIfRecorded(): Promise<void> {
		// Nothing was ever installed, so there is nothing to read or undo.
		if (!this.isPatchRecorded()) {
			return;
		}

		const target = this.ensureTarget();
		const changed = removePatch(target);
		await this.recordPatch(false);

		if (changed) {
			this.log.log(`Removed the in-window display from ${target.htmlPath}.`);
			await this.promptReload(
				'In-window display disabled. Reload the window to finish removing it.'
			);
		}
	}

	private async promptReload(message: string): Promise<void> {
		const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
		if (choice === 'Reload Window') {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}

	private report(error: unknown): void {
		const failure = error instanceof PatchError ? error.failure : 'ioFailure';
		const detail = error instanceof Error ? error.message : String(error);
		this.log.log(`In-window display failed (${failure}): ${detail}`);

		void vscode.window
			.showErrorMessage(FAILURE_HINTS[failure] ?? FAILURE_HINTS.ioFailure, 'Show Log')
			.then((choice) => {
				if (choice === 'Show Log') {
					this.log.show();
				}
			});
	}

	/** Brings the installation in line with the settings. */
	async sync(settings: Settings): Promise<void> {
		const wanted = needsInjection(settings);
		try {
			await (wanted ? this.install(settings) : this.uninstallIfRecorded());
		} catch (error) {
			// Deliberately keep the flag on a failed removal. Clearing it would make
			// the extension forget it ever modified the installation, orphaning the
			// patch — and the "corrupt installation" warning — permanently. A stuck
			// flag only costs one file read per activation, and the next attempt or
			// the restore command can still clean up. Only an installation that is
			// gone entirely is safe to forget.
			if (!wanted && error instanceof PatchError && error.failure === 'unsupported') {
				await this.recordPatch(false);
			}
			this.report(error);
		}
	}

	/** Rewrites the patch unconditionally — the escape hatch when it is broken. */
	async reapply(settings: Settings): Promise<void> {
		if (!needsInjection(settings)) {
			void vscode.window.showInformationMessage(
				'Nothing is shown inside the window yet. Enable the centered HUD or the title-bar pill first.'
			);
			return;
		}

		try {
			const target = this.ensureTarget();
			removePatch(target);
			applyPatch(target, this.assetsFor(settings), this.backupPath());
			await this.recordPatch(true);
			this.log.log(`Re-applied the in-window display in ${target.htmlPath}.`);
			await this.promptReload('In-window display re-applied. Reload the window to pick it up.');
		} catch (error) {
			this.report(error);
		}
	}

	/**
	 * Turns a feature on, asking first when this would be the first change to the
	 * installation. Writing the setting drives the configuration listener, which
	 * performs the patch.
	 */
	async enable(feature: 'hud' | 'titleBarPill', settings: Settings): Promise<void> {
		if (!needsInjection(settings)) {
			const choice = await vscode.window.showWarningMessage(
				'Show the project name inside the window by modifying your VS Code installation?',
				{ modal: true, detail: ENABLE_DETAIL },
				'Enable'
			);
			if (choice !== 'Enable') {
				return;
			}
		}
		await setFeatureEnabled(feature, true);
	}

	async disable(feature: 'hud' | 'titleBarPill'): Promise<void> {
		await setFeatureEnabled(feature, false);
	}

	/** Turns both in-window features off, so one action reverts the installation. */
	async removeAll(): Promise<void> {
		await setFeatureEnabled('hud', false);
		await setFeatureEnabled('titleBarPill', false);
	}

	/**
	 * Puts back the page saved before the first patch. For when the page has been
	 * damaged badly enough that stripping our own blocks is not safe.
	 */
	async restore(): Promise<void> {
		try {
			restoreFromBackup(this.ensureTarget(), this.backupPath());
			await this.recordPatch(false);
			this.log.log('Restored the workbench page from backup.');
			await this.promptReload('Workbench page restored. Reload the window to pick it up.');
		} catch (error) {
			this.report(error);
		}
	}
}
