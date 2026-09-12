import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

describe('production packaging', () => {
  it('includes every runtime file required by the Electron main process', () => {
    const productionFiles = new Set(packageJson.build.files);
    const requiredRuntimeFiles = [
      'main.cjs',
      'preload.cjs',
      'gemini.cjs',
      'telegram.cjs',
      'ipc-security.cjs',
      'telegram-account-storage.cjs',
      'telegram-lifecycle.cjs',
      'package.json'
    ];

    for (const file of requiredRuntimeFiles) {
      expect(productionFiles.has(file), `${file} is missing from build.files`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, file))).toBe(true);
    }
  });
});