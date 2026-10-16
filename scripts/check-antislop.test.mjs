import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './check-antislop.mjs';

const CLI = fileURLToPath(new URL('./check-antislop.mjs', import.meta.url));

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'antislop-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('parseArgs reads roots and flags', () => {
  assert.deepEqual(parseArgs(['src', '--glass-cap=5', '--json']), {
    roots: ['src'],
    glassCap: 5,
    json: true,
    quiet: false,
  });
});

test('parseArgs rejects an unknown option', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});

test('parseArgs rejects a bad glass cap', () => {
  assert.throws(() => parseArgs(['--glass-cap=abc']), /Invalid --glass-cap/);
});

test('exits 0 on a clean tree', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'ok.css'), '.status{color:#111827;}\n');
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).findings, {});
  });
});

test('exits 1 and reports findings on a violating tree', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'components'));
    writeFileSync(join(dir, 'components', 'Card.tsx'), '<button>Save</button>\n');
    writeFileSync(join(dir, 'app.css'), '.hero{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}\n');
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    const entries = Object.entries(payload.findings);
    assert.equal(entries.length, 2);
    const card = entries.find(([file]) => file.endsWith('components/Card.tsx'));
    const css = entries.find(([file]) => file.endsWith('app.css'));
    assert.ok(card, 'Card.tsx should be reported');
    assert.ok(css, 'app.css should be reported');
    assert.equal(card[1][0].rule, 'ANTISLOP-03');
    assert.equal(css[1][0].rule, 'ANTISLOP-01');
  });
});

test('ignores build output and vendored directories', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'dep', 'x.css'), '.x{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}\n');
    mkdirSync(join(dir, '.next'));
    writeFileSync(join(dir, '.next', 'y.css'), '.y{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}\n');
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 0);
  });
});

test('skips test, spec, and test-directory files by default', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'widget.test.tsx'), '<button>Save</button>\n');
    writeFileSync(join(dir, 'widget.spec.css'), '.x{background:linear-gradient(90deg,#8b5cf6,#3b82f6);}\n');
    mkdirSync(join(dir, '__tests__'));
    writeFileSync(join(dir, '__tests__', 'a.tsx'), '<button>Save</button>\n');
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 0);
  });
});

test('honours --glass-cap', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'a.css'), '.a{backdrop-filter:blur(1px)}\n.b{backdrop-filter:blur(1px)}\n');
    assert.equal(runCli([dir, '--json']).status, 0);
    assert.equal(runCli([dir, '--glass-cap=1', '--json']).status, 1);
  });
});
