import { execFile } from 'child_process';
import { promisify } from 'util';
import { DB_FILE_PATH } from '@core/db';
import { getConfigPath, type GatewayConfig } from '@gateway/config';
import type { Task, TaskRun } from '@core/db/schema';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

const execFileAsync = promisify(execFile);

interface HerdrWorkspace {
    workspace_id: string;
    label: string;
}

interface HerdrCreateResult {
    result?: {
        workspace?: { workspace_id: string };
        tab?: { tab_id: string };
        root_pane?: { pane_id: string };
    };
}

export interface HerdrHandoffLocation {
    workspaceId: string;
    tabId: string;
    paneId: string;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseJson<T>(value: string, context: string): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        throw new Error(`${context} returned invalid JSON`);
    }
}

function handoffLabel(task: Task): string {
    const compact = task.name.replace(/\s+/g, ' ').trim();
    return `ST #${task.id} ${compact}`.slice(0, 64);
}

export function resolveHandoffCliEntry(currentEntry = process.argv[1]): string {
    if (!currentEntry) throw new Error('Unable to resolve SuperTask CLI entrypoint');
    const gatewayDirectory = dirname(currentEntry);
    if (gatewayDirectory.endsWith('/gateway')) {
        const candidate = join(dirname(gatewayDirectory), 'cli', `index${currentEntry.endsWith('.ts') ? '.ts' : '.js'}`);
        if (existsSync(candidate)) return candidate;
    }
    return currentEntry;
}

async function herdr(
    binary: string,
    args: string[],
    timeout = 30_000,
): Promise<string> {
    const result = await execFileAsync(binary, args, {
        timeout,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
    });
    return result.stdout;
}

async function getOrCreatePane(
    cfg: GatewayConfig['handoff'],
    task: Task,
): Promise<HerdrHandoffLocation> {
    const list = parseJson<{
        result?: { workspaces?: HerdrWorkspace[] };
    }>(await herdr(cfg.herdrBin, ['workspace', 'list']), 'herdr workspace list');
    const workspace = list.result?.workspaces?.find(
        (candidate) => candidate.label === cfg.workspaceLabel,
    );

    let created: HerdrCreateResult;
    if (workspace) {
        created = parseJson<HerdrCreateResult>(await herdr(cfg.herdrBin, [
            'tab', 'create',
            '--workspace', workspace.workspace_id,
            '--cwd', task.cwd!,
            '--label', handoffLabel(task),
            '--focus',
        ]), 'herdr tab create');
    } else {
        created = parseJson<HerdrCreateResult>(await herdr(cfg.herdrBin, [
            'workspace', 'create',
            '--cwd', task.cwd!,
            '--label', cfg.workspaceLabel,
            '--focus',
        ]), 'herdr workspace create');
    }

    const workspaceId = created.result?.workspace?.workspace_id ?? workspace?.workspace_id;
    const tabId = created.result?.tab?.tab_id;
    const paneId = created.result?.root_pane?.pane_id;
    if (!workspaceId || !tabId || !paneId) {
        throw new Error('Herdr did not return workspace, tab, and pane IDs');
    }

    await herdr(cfg.herdrBin, [
        'pane', 'wait-output', paneId,
        '--regex', '[%$#>] *$',
        '--source', 'visible',
        '--timeout', '15000',
    ], 20_000);
    return { workspaceId, tabId, paneId };
}

export async function openHerdrHandoff(
    cfg: GatewayConfig['handoff'],
    task: Task,
    run: TaskRun,
    options: { cliEntry?: string; bunBin?: string } = {},
): Promise<HerdrHandoffLocation> {
    if (!cfg.enabled) throw new Error('Herdr handoff is disabled');
    if (!task.cwd?.trim()) throw new Error('Task has no working directory');
    if (!run.sessionId) throw new Error('OpenCode session ID was not captured');

    const location = await getOrCreatePane(cfg, task);
    const cliEntry = options.cliEntry ?? resolveHandoffCliEntry();
    const bunBin = options.bunBin ?? process.execPath;

    const command = [
        `HERDR_AGENT=${shellQuote('opencode')}`,
        `SUPERTASK_DB_PATH=${shellQuote(DB_FILE_PATH)}`,
        `SUPERTASK_CONFIG_PATH=${shellQuote(getConfigPath())}`,
        shellQuote(bunBin),
        shellQuote(cliEntry),
        'handoff',
        'attach',
        String(run.id),
    ].join(' ');
    await herdr(cfg.herdrBin, ['pane', 'run', location.paneId, command]);
    await herdr(cfg.herdrBin, ['tab', 'focus', location.tabId]);

    try {
        await herdr(cfg.herdrBin, [
            'notification', 'show',
            `SuperTask needs you: ${task.name}`,
            '--body', run.handoffMessage ?? 'Open the Scheduled Handoffs workspace.',
            '--sound', 'request',
        ]);
    } catch {
        // The persistent Herdr tab is the handoff. Notification delivery is best-effort.
    }
    return location;
}
