import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let home: string;
const helper = path.resolve('examples/deed-page/save-token.mjs');
const token = 'deed_tok_synthetic_example_only';

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcporter-deed-page-'));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function run(input: unknown) {
  return spawnSync(process.execPath, [helper], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

describe('deed.page example token helper', () => {
  it('saves an owner token privately without printing it', () => {
    const result = run({ ok: true, token, slug: 'synthetic-page' });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(token);
    const file = path.join(home, '.config/deed-page/token');
    expect(fs.readFileSync(file, 'utf8')).toBe(token);
    expect(JSON.parse(result.stdout)).toMatchObject({ slug: 'synthetic-page', token_saved_to: file });
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    }
  });

  it('keeps an existing token when a rotated token arrives', () => {
    expect(run({ ok: true, token }).status).toBe(0);
    const next = `${token}_rotated`;
    const result = run({ ok: true, token: next });
    expect(result.status).toBe(0);
    const dir = path.join(home, '.config/deed-page');
    expect(fs.readFileSync(path.join(dir, 'token'), 'utf8')).toBe(token);
    const saved = JSON.parse(result.stdout).token_saved_to;
    expect(saved).not.toBe(path.join(dir, 'token'));
    expect(fs.readFileSync(saved, 'utf8')).toBe(next);
    expect(result.stdout + result.stderr).not.toContain(next);
  });

  it('redacts nested tokens and propagates an MCP error as failure', () => {
    const result = run({ error: { token, message: `Rejected ${token}` }, code: -32000 });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(token);
    expect(result.stderr).toContain('<redacted>');
    expect(result.stderr).toContain('-32000');
  });

  it('retains malformed output privately and reports failure without printing it', () => {
    const result = run(`invalid JSON with ${token}`);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(token);
    const dir = path.join(home, '.config/deed-page');
    const [file] = fs.readdirSync(dir);
    expect(file).toMatch(/^publish-.*\.json$/);
    expect(fs.readFileSync(path.join(dir, file!), 'utf8')).toContain(token);
  });

  it('fails when the publishing command supplies no output', () => {
    const result = run('');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No publish output');
  });
});
