import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import SuperTaskPlugin, { shouldAttemptGatewayReplacement, SuperTaskTools } from '../plugin/supertask';
import { setupTestDb } from './helpers/mock-db';
import { TaskService } from '../src/core/services/task.service';
import { MANAGED_RUN_ENV, MANAGED_RUN_ENV_VALUE } from '../src/core/launch-protocol';

const originalPm2Bin = process.env.SUPERTASK_PM2_BIN;

interface RuntimeSchema {
    description?: string;
    safeParse(value: unknown): { success: boolean };
}

interface RegisteredTool {
    name: string;
    description: string;
    input: Record<string, unknown>;
    execute(args: unknown, context: { sessionID: string }): Promise<{ content?: string }>;
}

async function setupPlugin(directory = process.cwd()) {
    const registered = new Map<string, RegisteredTool>();
    const hooks: {
        system?: (session: { system: Array<{ type: string; text: string }> }) => void;
    } = {};
    const context = {
        session: {
            async hook(name: string, hook: unknown) {
                if (name === 'context') {
                    hooks.system = hook as typeof hooks.system;
                }
            },
            async get() {
                return { location: { directory } };
            },
        },
        tool: {
            async transform(callback: unknown) {
                const transform = callback as (draft: { add(tool: RegisteredTool): void }) => void;
                transform({ add: (tool) => registered.set(tool.name, tool) });
            },
        },
    } as unknown as Parameters<typeof SuperTaskPlugin.setup>[0];

    await SuperTaskPlugin.setup(context);
    return { registered, hooks };
}

describe('OpenCode 插件注册', () => {
    beforeEach(() => {
        setupTestDb();
        process.env.SUPERTASK_PM2_BIN = '/definitely/missing/supertask-test-pm2';
    });

    afterAll(() => {
        if (originalPm2Bin === undefined) delete process.env.SUPERTASK_PM2_BIN;
        else process.env.SUPERTASK_PM2_BIN = originalPm2Bin;
    });

    test('只注册不会绕过 Gateway 执行所有权的 8 个工具并注入系统说明', async () => {
        const { registered, hooks } = await setupPlugin();
        expect([...registered.keys()].sort()).toEqual([
            'supertask_add',
            'supertask_get',
            'supertask_list',
            'supertask_next',
            'supertask_retry',
            'supertask_schedule',
            'supertask_status',
            'supertask_upgrade',
        ]);

        const output = { system: [] as Array<{ type: string; text: string }> };
        if (!hooks.system) throw new Error('系统提示 hook 未注册');
        hooks.system(output);
        expect(output.system).toHaveLength(1);
        expect(output.system[0].text).toContain('supertask_schedule');
        expect(output.system[0].text).toContain('所有具有相同非空 `batchId` 的任务也不会同时执行');
        expect(output.system[0].text).toContain('即使任务属于不同项目目录');
        expect(output.system[0].text).toContain('`globalBatch.activeRunning`');
        expect(output.system[0].text).toContain('若任务 B 必须等待任务 A 完成');

        const add = SuperTaskTools.supertask_add;
        const schedule = SuperTaskTools.supertask_schedule;
        if (!add || !schedule) throw new Error('任务创建工具未注册');
        const addArgs = add.args as unknown as { batchId: RuntimeSchema; variant: RuntimeSchema };
        const scheduleArgs = schedule.args as unknown as {
            batchId: RuntimeSchema;
            variant: RuntimeSchema;
            max_instances: RuntimeSchema;
        };
        expect(add.description).toContain('跨项目的相同非空 batchId 任务全局严格串行');
        expect(scheduleArgs.batchId.description).toContain('不会同时执行');
        expect(scheduleArgs.max_instances.description).toContain('自动调度');
        expect(scheduleArgs.max_instances.description).toContain('排队');
        expect(scheduleArgs.max_instances.description).toContain('手动立即运行不受此限制');
        expect(addArgs.batchId.safeParse(undefined).success).toBe(true);
        expect(addArgs.batchId.safeParse('').success).toBe(false);
        expect(addArgs.variant.safeParse('xhigh').success).toBe(true);
        expect(addArgs.variant.safeParse('   ').success).toBe(false);
        expect(scheduleArgs.variant.safeParse('high').success).toBe(true);
        expect(scheduleArgs.batchId.safeParse('   ').success).toBe(false);
    });

    test('按 batchId 查询时同时返回当前项目和跨项目占用状态', async () => {
        const otherProjectTask = await TaskService.add({
            name: '其他项目批次任务',
            agent: 'build',
            prompt: '占用全局批次',
            cwd: '/tmp',
            batchId: 'shared-batch',
        });
        await TaskService.start(otherProjectTask.id);

        const status = SuperTaskTools.supertask_status;
        if (!status) throw new Error('supertask_status 未注册');
        const result = JSON.parse(await status.execute(
            { batchId: 'shared-batch' },
            { directory: process.cwd() } as Parameters<typeof status.execute>[1],
        )) as {
            total: number;
            activeRunning: number;
            blockedByOtherProject: boolean;
            globalBatch: { total: number; activeRunning: number };
        };

        expect(result.total).toBe(0);
        expect(result.activeRunning).toBe(0);
        expect(result.globalBatch).toMatchObject({ total: 1, activeRunning: 1 });
        expect(result.blockedByOtherProject).toBe(true);
    });

    test('新插件可自动替换旧 Gateway，旧 OpenCode 进程不会反向降级新 Gateway', () => {
        expect(shouldAttemptGatewayReplacement('0.1.28', '0.1.27')).toBe(true);
        expect(shouldAttemptGatewayReplacement('0.1.27', '0.1.28')).toBe(false);
        expect(shouldAttemptGatewayReplacement('0.2.0-beta.1', '0.2.0')).toBe(false);
        expect(shouldAttemptGatewayReplacement('0.2.0', '0.2.0-beta.2')).toBe(true);
        expect(shouldAttemptGatewayReplacement('0.2.0-beta.2', '0.2.0-beta.1')).toBe(true);
        expect(shouldAttemptGatewayReplacement('0.2.0-beta.1', '0.2.0-beta.2')).toBe(false);
        expect(shouldAttemptGatewayReplacement('0.1.28', null)).toBe(true);
        expect(shouldAttemptGatewayReplacement('invalid', '0.1.27')).toBe(false);
    });

    test('任务作用域使用 OpenCode 工具上下文目录，忽略调用者伪造的 cwd', async () => {
        const add = SuperTaskTools.supertask_add;
        if (!add) throw new Error('supertask_add 未注册');
        const context = {
            directory: process.cwd(),
        } as Parameters<typeof add.execute>[1];

        const output = JSON.parse(await add.execute({
            name: '上下文隔离',
            agent: 'build',
            prompt: '验证 cwd',
            model: 'openai/gpt-5.6-sol',
            variant: 'xhigh',
            cwd: `${process.cwd()}/package.json`,
        }, context)) as { id: number };

        expect(await TaskService.getById(output.id)).toMatchObject({
            cwd: process.cwd(),
            model: 'openai/gpt-5.6-sol',
            variant: 'xhigh',
        });
    });

    test('Gateway 管理的队列任务拒绝在自身受管执行上下文内升级', async () => {
        const originalManagedRun = process.env[MANAGED_RUN_ENV];
        process.env[MANAGED_RUN_ENV] = MANAGED_RUN_ENV_VALUE;
        try {
            const upgrade = SuperTaskTools.supertask_upgrade;
            if (!upgrade) throw new Error('supertask_upgrade 未注册');

            const output = JSON.parse(await upgrade.execute(
                {},
                {} as Parameters<typeof upgrade.execute>[1],
            )) as { success: boolean; error: string; hint: string };

            expect(output.success).toBe(false);
            expect(output.error).toContain('不能升级');
            expect(output.hint).toContain('supertask upgrade');
        } finally {
            if (originalManagedRun === undefined) delete process.env[MANAGED_RUN_ENV];
            else process.env[MANAGED_RUN_ENV] = originalManagedRun;
        }
    });
});
