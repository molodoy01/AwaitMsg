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

  it('does not include the project root .env in production files', () => {
    const rootEnvPath = path.join(projectRoot, '.env');
    const productionFiles = packageJson.build.files;
    const includesRootEnv = productionFiles.some((pattern) =>
      pattern === '.env' || pattern === './.env' || pattern.endsWith('/.env')
    );

    expect(fs.existsSync(rootEnvPath)).toBe(true);
    expect(includesRootEnv).toBe(false);
  });

  it('keeps .env excluded from the generated effective config', () => {
    const effectiveConfigPath = path.join(
      projectRoot,
      'release',
      'builder-effective-config.yaml'
    );
    const effectiveConfig = fs.readFileSync(effectiveConfigPath, 'utf8');

    expect(effectiveConfig).not.toMatch(/^\s*-\s+\.?\/?\.env\s*$/m);
  });
});