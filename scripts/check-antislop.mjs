#!/usr/bin/env node
/**
 * Runs the anti-slop guardrail over the tree and exits non-zero on any
 * violation, so it can fail a build or a CI job.
 *
 *   node scripts/check-antislop.mjs [paths...] [--glass-cap=N] [--json] [--quiet]
 *
 * With no paths it scans the current directory, skipping build output and
 * vendored copies. See scripts/antislop-rules.mjs for the rules themselves.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSource,
  SCAN_EXTENSIONS,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_GLASS_CAP,
  TEST_OR_SPEC_RE,
} from './antislop-rules.mjs';

const USAGE = `Usage: node scripts/check-antislop.mjs [paths...] [options]

Options:
  --glass-cap=N   Max backdrop-blur elements per file (default ${DEFAULT_GLASS_CAP}).
  --json          Print findings as JSON.
  --quiet         Only print the summary line.
  --help          Show this help.`;

function parseArgs(argv) {
  const options = { roots: [], glassCap: DEFAULT_GLASS_CAP, json: false, quiet: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg.startsWith('--glass-cap=')) {
      const value = Number.parseInt(arg.slice('--glass-cap='.length), 10);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid --glass-cap value: ${arg}`);
      }
      options.glassCap = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.roots.push(arg);
    }
  }
  return options;
}

function walk(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), files);
    } else if (
      entry.isFile() &&
      SCAN_EXTENSIONS.includes(extname(entry.name).toLowerCase()) &&
      !TEST_OR_SPEC_RE.test(entry.name)
    ) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

function bold(text) {
  return process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[1m${text}\u001b[0m` : text;
}

function red(text) {
  return process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[31m${text}\u001b[0m` : text;
}

function report(findingsByFile, fileCount, options) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ fileCount, findings: findingsByFile }, null, 2)}\n`);
    return;
  }
  let total = 0;
  for (const [file, findings] of Object.entries(findingsByFile)) {
    total += findings.length;
    if (options.quiet) continue;
    for (const finding of findings) {
      process.stdout.write(`${red(`${file}:${finding.line}:${finding.column}`)}: [${finding.rule}] ${finding.message} (${finding.source})\n`);
      process.stdout.write(`    ${finding.snippet}\n`);
      process.stdout.write(`    fix: ${finding.hint}\n`);
    }
  }
  process.stdout.write(
    total === 0
      ? `${bold('antislop')}: no violations in ${fileCount} file(s).\n`
      : `${bold('antislop')}: ${total} violation(s) in ${Object.keys(findingsByFile).length} file(s). Failing build.\n`,
  );
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  const roots = (options.roots.length > 0 ? options.roots : ['.']).map((p) => resolve(p));
  const files = [];
  for (const root of roots) walk(root, files);

  const findingsByFile = {};
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const findings = analyzeSource(source, file, { glassCap: options.glassCap });
    if (findings.length > 0) {
      findingsByFile[relative(process.cwd(), file).split(sep).join('/')] = findings;
    }
  }

  report(findingsByFile, files.length, options);
  process.exit(Object.keys(findingsByFile).length > 0 ? 1 : 0);
}

export { parseArgs, walk };

// Run only when invoked directly, so importing this module is side-effect free.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
