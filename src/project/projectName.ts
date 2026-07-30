/**
 * The bits of `vscode.workspace` this resolution needs, so the rules can be
 * exercised without a live workspace.
 */
export interface WorkspaceShape {
	name: string | undefined;
	folders: readonly { readonly name: string }[] | undefined;
}

/** VS Code appends this to `workspace.name` for multi-root workspaces. */
const WORKSPACE_SUFFIX = / \(Workspace\)$/;

/**
 * The name to announce, or undefined when there is nothing to announce (an empty
 * window). An explicit label always wins, so a project whose folder is called
 * `api` can announce itself as `Payments API`.
 */
export function resolveProjectName(workspace: WorkspaceShape, label: string): string | undefined {
	const explicit = label.trim();
	if (explicit !== '') {
		return explicit;
	}

	const folders = workspace.folders ?? [];

	if (folders.length === 1) {
		return folders[0].name;
	}

	if (folders.length > 1) {
		// Multi-root: prefer the workspace's own name over an arbitrary folder.
		const workspaceName = workspace.name?.replace(WORKSPACE_SUFFIX, '').trim();
		return workspaceName === undefined || workspaceName === '' ? folders[0].name : workspaceName;
	}

	const bare = workspace.name?.trim();
	return bare === undefined || bare === '' ? undefined : bare;
}
