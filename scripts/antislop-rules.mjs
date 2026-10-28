/**
 * Dependency-free detectors for three anti-slop Hard-Gate bans, so the
 * guardrails in knowledge.md §2 are enforced by tooling instead of prose:
 *
 *   ANTISLOP-01  default AI purple / blue-cyan gradient   (anti-slop R-01)
 *   ANTISLOP-02  page-wide glassmorphism (backdrop blur)  (anti-slop R-10)
 *   ANTISLOP-03  dead control with no real behaviour      (anti-slop R-26, R-24)
 *
 * A deliberate exception carries a written reason on the same line or the line
 * above (`// antislop-allow: <reason>`); a whole file with
 * (`// antislop-allow-file: <reason>`). anti-slop R-31 requires that reason,
 * which is why a bare marker without one does not suppress a finding.
 */

import { extname } from 'node:path';

export const SCAN_EXTENSIONS = [
  '.css', '.scss', '.sass', '.less',
  '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs',
  '.html', '.vue', '.svelte',
];

// JSX attribute checks only make sense in files that can contain JSX.
export const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);

export const DEFAULT_IGNORE_DIRS = new Set([
  'playwright-report', 'test-results',
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.astro', '.output',
  'dist', 'build', 'out', 'coverage', '.vercel', '.turbo', '.cache',
  '.ai-sources', '.freebuff', 'vendor', '__tests__', '__mocks__', '__snapshots__',
]);

// Test fixtures deliberately contain violating snippets, so the guardrail
// scans shipped source and not its own examples.
export const TEST_OR_SPEC_RE = /\.(?:test|spec)\.[a-z0-9]+$/i;

// raw captures of third-party sites are not our UI; do not lint them.
export const DEFAULT_IGNORE_PATH_RE = /[\\/]__fixtures__[\\/]raw[\\/]/;

export const DEFAULT_GLASS_CAP = 2;

export const RULE_META = {
  'ANTISLOP-01': {
    title: 'Default AI gradient',
    source: 'anti-slop R-01',
    hint: 'Derive the palette from the project identity, or keep the gradient and document it with // antislop-allow: <reason>.',
  },
  'ANTISLOP-02': {
    title: 'Page-wide glassmorphism',
    source: 'anti-slop R-10',
    hint: 'Limit backdrop blur to 1-2 elements. A documented accent is fine: // antislop-allow: <reason>.',
  },
  'ANTISLOP-03': {
    title: 'Dead control',
    source: 'anti-slop R-26 / R-24',
    hint: 'Give the control real behaviour, remove it, or ship a visible "Coming soon" label with // antislop-allow: <reason>.',
  },
};

const FILE_ALLOW_RE = /antislop-allow-file\s*:\s*\S/;
const LINE_ALLOW_RE = /antislop-allow\s*:\s*\S/;

const NAMED_COLORS = {
  purple: [128, 0, 128],
  rebeccapurple: [102, 51, 153],
  violet: [238, 130, 238],
  indigo: [75, 0, 130],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  orchid: [218, 112, 214],
  plum: [221, 160, 221],
  thistle: [216, 191, 216],
  mediumpurple: [147, 112, 219],
  mediumorchid: [186, 85, 211],
  blueviolet: [138, 43, 226],
  darkviolet: [148, 0, 211],
  slateblue: [106, 90, 205],
  blue: [0, 0, 255],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  pink: [255, 192, 203],
};

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function hexToRgb(hex) {
  let body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = body.split('').map((c) => c + c).join('');
  }
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

function parseChannel(part) {
  if (part.endsWith('%')) {
    const value = parseFloat(part);
    return Number.isNaN(value) ? null : Math.round((value / 100) * 255);
  }
  const value = parseFloat(part);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

export function parseCssColor(rawToken) {
  const token = String(rawToken).trim().toLowerCase();
  if (!token) return null;
  if (HEX_RE.test(token)) return hexToRgb(token);

  let match = /^rgba?\(([^)]+)\)$/.exec(token);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map(parseChannel);
    if (channels.some((v) => v === null)) return null;
    return { r: channels[0], g: channels[1], b: channels[2] };
  }

  match = /^hsla?\(([^)]+)\)$/.exec(token);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if ([h, s, l].some((n) => Number.isNaN(n))) return null;
    return hslToRgb(h, s, l);
  }

  if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, token)) {
    const [r, g, b] = NAMED_COLORS[token];
    return { r, g, b };
  }
  return null;
}

export function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// Hue families matched to anti-slop's named AI defaults. Saturation and
// lightness guard against treating near-black and near-white as a colour.
export function classifyColor(rgb) {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.15 || l <= 0.08 || l >= 0.97) return 'neutral';
  if (h >= 250 && h <= 330) return 'purple';
  if (h >= 200 && h < 250) return 'blue';
  if (h >= 160 && h < 200) return 'cyan';
  if (h >= 330 || h < 20) return 'pink';
  return 'other';
}

function lineStartsOf(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineIndexAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low;
}

function balancedEnd(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function colorTokensIn(text) {
  const tokens = [];
  const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-zA-Z]{3,}\b/g;
  let match;
  while ((match = re.exec(text))) tokens.push(match[0]);
  return tokens;
}

function colorFamiliesIn(text) {
  const families = new Set();
  for (const token of colorTokensIn(text)) {
    const rgb = parseCssColor(token);
    if (!rgb) continue;
    const family = classifyColor(rgb);
    if (family !== 'neutral' && family !== 'other') families.add(family);
  }
  return families;
}

function isAiDefaultGradient(families) {
  if (families.has('purple')) return true;
  return families.has('blue') && families.has('cyan');
}

const GRADIENT_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;
const TW_GRADIENT_STOP_RE = /\b(?:from|via|to)-(purple|violet|indigo|fuchsia|magenta)(?:-\d{2,3})?\b/g;
const TW_ARBITRARY_STOP_RE = /\b(?:from|via|to)-\[([^\]]+)\]/g;

function collectGradientFindings(source, push) {
  let match;
  while ((match = GRADIENT_RE.exec(source))) {
    const open = source.indexOf('(', match.index);
    const close = balancedEnd(source, open);
    if (close < 0) continue;
    const families = colorFamiliesIn(source.slice(open + 1, close));
    if (isAiDefaultGradient(families)) {
      push('ANTISLOP-01', match.index, 'gradient uses the default AI colour family (purple, or blue-to-cyan)');
    }
  }

  while ((match = TW_GRADIENT_STOP_RE.exec(source))) {
    push('ANTISLOP-01', match.index, `gradient stop class "${match[0]}" uses a default AI colour`);
  }

  while ((match = TW_ARBITRARY_STOP_RE.exec(source))) {
    if (isAiDefaultGradient(colorFamiliesIn(match[1]))) {
      push('ANTISLOP-01', match.index, `gradient stop "${match[0]}" uses a default AI colour`);
    }
  }
}

const CSS_GLASS_RE = /(-webkit-)?backdrop-filter\s*:\s*([^;{}]*)/gi;
const TW_GLASS_RE = /\bbackdrop-blur(?:-(?:sm|md|lg|xl|2xl|3xl))?\b(?!-)/g;
const GLOBAL_SELECTOR_RE = /(^|[\s,>+~])(\*|html|body|:root|main)(?=[\s,{:>+~]|$)/;

function cssSelectorBefore(source, declIndex) {
  const before = source.slice(0, declIndex);
  const lastOpen = before.lastIndexOf('{');
  const lastClose = before.lastIndexOf('}');
  if (lastOpen <= lastClose) return '';
  const start = before.lastIndexOf('}', lastOpen) + 1;
  return source.slice(start, lastOpen).trim();
}

function collectGlassFindings(source, glassCap, push) {
  const hits = [];

  let match;
  while ((match = CSS_GLASS_RE.exec(source))) {
    if (!/blur\s*\(/i.test(match[2])) continue;
    hits.push({ index: match.index, global: GLOBAL_SELECTOR_RE.test(cssSelectorBefore(source, match.index)) });
  }

  while ((match = TW_GLASS_RE.exec(source))) {
    hits.push({ index: match.index, global: false });
  }

  hits.sort((a, b) => a.index - b.index);
  hits.forEach((hit, i) => {
    if (hit.global) {
      push('ANTISLOP-02', hit.index, 'backdrop blur applied to a page-wide selector (*, html, body, :root, main)');
    } else if (i + 1 > glassCap) {
      push('ANTISLOP-02', hit.index, `backdrop blur used on more than ${glassCap} elements in this file`);
    }
  });
}

function openingTagEnd(source, start) {
  let inString = null;
  let braces = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') braces++;
    else if (ch === '}') braces = Math.max(0, braces - 1);
    else if (braces === 0 && ch === '>') return i;
  }
  return -1;
}

function openingTags(source, name) {
  const tags = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  let match;
  while ((match = re.exec(source))) {
    const end = openingTagEnd(source, match.index);
    if (end < 0) continue;
    tags.push({ index: match.index, text: source.slice(match.index, end + 1) });
    re.lastIndex = end + 1;
  }
  return tags;
}

function deadHref(tagText) {
  const match = /\bhref\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*')/.exec(tagText);
  if (!match) return false;
  let value = match[1];
  if (value.startsWith('{')) value = value.slice(1, -1);
  value = value.trim().replace(/^["']|["']$/g, '').trim();
  if (value === '' || value === '#') return true;
  return /^javascript\s*:\s*void\s*\(?\s*0?\s*\)?$/i.test(value);
}

const INTERACTION_ATTR_RE = /\bon[A-Z][A-Za-z]*\s*=/;
const SUBMIT_TYPE_RE = /\btype\s*=\s*["']?(submit|reset)["']?/i;
const BUTTON_TYPE_RE = /\btype\s*=\s*["']?button["']?/i;
const DISABLED_RE = /\bdisabled\b/;
const OTHER_INTERACTION_RE = /\bformAction\s*=|\bform\s*=|href\s*=|\bas\s*=/;
const EMPTY_HANDLER_RE = /\bon[A-Z][A-Za-z]*=\{\s*\([^)]*\)\s*=>\s*(?:\{\s*\}|null|undefined)\s*\}/g;
const EMPTY_FUNCTION_HANDLER_RE = /\bon[A-Z][A-Za-z]*=\{\s*function\s*\([^)]*\)\s*\{\s*\}\s*\}/g;

function collectDeadControlFindings(source, push) {
  const fileHasForm = /<form\b/.test(source);

  for (const tag of openingTags(source, 'button')) {
    const hasBehaviour =
      INTERACTION_ATTR_RE.test(tag.text) ||
      SUBMIT_TYPE_RE.test(tag.text) ||
      DISABLED_RE.test(tag.text) ||
      OTHER_INTERACTION_RE.test(tag.text);
    if (hasBehaviour) continue;
    if (BUTTON_TYPE_RE.test(tag.text)) {
      push('ANTISLOP-03', tag.index, 'type="button" has no handler, so it cannot do anything');
      continue;
    }
    if (fileHasForm) continue;
    push('ANTISLOP-03', tag.index, 'button has no handler, link, or submit type');
  }

  for (const tag of openingTags(source, 'a')) {
    if (deadHref(tag.text)) {
      push('ANTISLOP-03', tag.index, 'link points to an empty or placeholder href');
    }
  }

  let match;
  while ((match = EMPTY_HANDLER_RE.exec(source))) {
    push('ANTISLOP-03', match.index, 'event handler is empty, so the control does nothing');
  }
  while ((match = EMPTY_FUNCTION_HANDLER_RE.exec(source))) {
    push('ANTISLOP-03', match.index, 'event handler is empty, so the control does nothing');
  }
}

function applyAllowMarkers(source, starts, findings) {
  if (FILE_ALLOW_RE.test(source)) return [];
  return findings.filter((finding) => {
    const line = finding.line;
    const current = source.slice(starts[line], starts[line + 1] ?? source.length);
    const previous = line > 0 ? source.slice(starts[line - 1], starts[line]) : '';
    return !LINE_ALLOW_RE.test(current) && !LINE_ALLOW_RE.test(previous);
  });
}

export function analyzeSource(source, filePath = '<anonymous>', options = {}) {
  const glassCap = options.glassCap ?? DEFAULT_GLASS_CAP;
  const extension = extname(filePath).toLowerCase();
  const starts = lineStartsOf(source);
  const raw = [];

  const push = (rule, index, message) => {
    raw.push({
      rule,
      line: lineIndexAt(starts, index),
      column: index - starts[lineIndexAt(starts, index)] + 1,
      message,
    });
  };

  collectGradientFindings(source, push);
  collectGlassFindings(source, glassCap, push);
  if (JSX_EXTENSIONS.has(extension)) collectDeadControlFindings(source, push);

  const deduped = [];
  const seen = new Set();
  for (const finding of raw) {
    const key = `${finding.rule}:${finding.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return applyAllowMarkers(source, starts, deduped)
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map((finding) => ({
      ...finding,
      source: RULE_META[finding.rule].source,
      hint: RULE_META[finding.rule].hint,
      snippet: source.slice(starts[finding.line], starts[finding.line + 1] ?? source.length).trim().slice(0, 200),
    }));
}
