import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveHandoffCliEntry } from '../src/handoff/herdr';

describe('Herdr handoff', () => {
    test('Gateway entry resolves to the sibling CLI entry used by handoff attach', () => {
        const root = mkdtempSync(join(tmpdir(), 'supertask-handoff-entry-'));
        mkdirSync(join(root, 'gateway'), { recursive: true });
        mkdirSync(join(root, 'cli'), { recursive: true });
        const gateway = join(root, 'gateway', 'index.js');
        const cli = join(root, 'cli', 'index.js');
        writeFileSync(gateway, '');
        writeFileSync(cli, '');

        expect(resolveHandoffCliEntry(gateway)).toBe(cli);
        expect(resolveHandoffCliEntry(cli)).toBe(cli);
    });
});
