import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadRegistry } from './registry';

describe('loadRegistry', () => {
  test('indexes loaded policies by tool name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-registry-'));
    try {
      writeFileSync(
        join(dir, 'send_email.yaml'),
        `version: 1\nrules:\n  - id: deny-x\n    when:\n      to:\n        in: ['x@x.com']\n`,
      );
      writeFileSync(join(dir, 'broken.yaml'), 'not valid yaml: [');

      const registry = loadRegistry(dir);

      expect(registry.list().sort()).toEqual(['broken', 'send_email']);
      expect(registry.get('send_email')?.status).toBe('ok');
      expect(registry.get('broken')?.status).toBe('quarantined');
      expect(registry.get('nonexistent')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
