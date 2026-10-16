import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSource, parseCssColor, classifyColor, rgbToHsl } from './antislop-rules.mjs';

const rulesFor = (source, file = 'x.css', options) =>
  analyzeSource(source, file, options).map((finding) => finding.rule);

test('parses hex, rgb, hsl, and named colours', () => {
  assert.deepEqual(parseCssColor('#800080'), { r: 128, g: 0, b: 128 });
  assert.deepEqual(parseCssColor('#0ff'), { r: 0, g: 255, b: 255 });
  assert.deepEqual(parseCssColor('rgb(255, 0, 255)'), { r: 255, g: 0, b: 255 });
  assert.deepEqual(parseCssColor('hsl(300, 100%, 50%)'), { r: 255, g: 0, b: 255 });
  assert.deepEqual(parseCssColor('purple'), { r: 128, g: 0, b: 128 });
  assert.equal(parseCssColor('notacolor'), null);
});

test('classifies hue families and treats extremes as neutral', () => {
  assert.equal(classifyColor({ r: 139, g: 92, b: 246 }), 'purple');
  assert.equal(classifyColor({ r: 0, g: 0, b: 255 }), 'blue');
  assert.equal(classifyColor({ r: 0, g: 255, b: 255 }), 'cyan');
  assert.equal(classifyColor({ r: 0, g: 0, b: 0 }), 'neutral');
  assert.equal(classifyColor({ r: 255, g: 255, b: 255 }), 'neutral');
});

test('rgbToHsl normalises the hue into 0-360', () => {
  const { h } = rgbToHsl(128, 0, 128);
  assert.ok(h >= 0 && h < 360, `hue out of range: ${h}`);
  assert.equal(Math.round(h), 300);
});

test('flags a purple gradient', () => {
  assert.deepEqual(rulesFor('.card{background:linear-gradient(135deg, #8b5cf6, #3b82f6);}'), ['ANTISLOP-01']);
});

test('flags a blue-to-cyan gradient', () => {
  assert.deepEqual(rulesFor('.x{background:linear-gradient(90deg, #1d4ed8, #06b6d4);}'), ['ANTISLOP-01']);
});

test('does not flag a single-family blue gradient or a solid colour', () => {
  assert.deepEqual(rulesFor('.x{background:linear-gradient(90deg, #1d4ed8, #3b82f6);}'), []);
  assert.deepEqual(rulesFor('.x{color:#8b5cf6;}'), []);
});

test('flags Tailwind purple gradient stops but not a purple text colour', () => {
  assert.deepEqual(rulesFor('<div class="bg-gradient-to-r from-purple-500 to-blue-500" />', 'x.jsx'), ['ANTISLOP-01']);
  assert.deepEqual(rulesFor('<span class="text-purple-500" />', 'x.jsx'), []);
});

test('flags an arbitrary-value purple gradient stop', () => {
  assert.deepEqual(rulesFor('<div class="from-[#8b5cf6] to-[#3b82f6]" />', 'x.jsx'), ['ANTISLOP-01']);
});

test('flags glass past the per-file cap', () => {
  const source = '.a{backdrop-filter:blur(8px)}\n.b{backdrop-filter:blur(8px)}\n.c{backdrop-filter:blur(8px)}';
  const findings = analyzeSource(source, 'x.css');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'ANTISLOP-02');
  assert.equal(findings[0].line, 2);
});

test('does not flag glass within the cap', () => {
  assert.deepEqual(rulesFor('.a{backdrop-filter:blur(8px)}\n.b{-webkit-backdrop-filter:blur(4px)}'), []);
});

test('flags glass on a page-wide selector', () => {
  assert.deepEqual(rulesFor('body{backdrop-filter:blur(4px)}'), ['ANTISLOP-02']);
});

test('counts Tailwind backdrop-blur but ignores backdrop-blur-none', () => {
  assert.deepEqual(rulesFor('<div class="backdrop-blur-md" />', 'x.jsx'), []);
  assert.deepEqual(rulesFor('<div class="backdrop-blur-none" />', 'x.jsx'), []);
  const three = '<a class="backdrop-blur-md"/>\n<b class="backdrop-blur-lg"/>\n<c class="backdrop-blur-xl"/>';
  assert.deepEqual(rulesFor(three, 'x.jsx'), ['ANTISLOP-02']);
});

test('flags a button with no handler', () => {
  assert.deepEqual(rulesFor('<button>Save</button>', 'x.tsx'), ['ANTISLOP-03']);
});

test('flags a multi-line button with no handler', () => {
  const source = '<button\n  className="save"\n>\n  Save\n</button>';
  assert.deepEqual(rulesFor(source, 'x.tsx'), ['ANTISLOP-03']);
});

test('does not flag interactive or submit buttons', () => {
  assert.deepEqual(rulesFor('<button onClick={save}>Save</button>', 'x.tsx'), []);
  assert.deepEqual(rulesFor('<button type="submit">Save</button>', 'x.tsx'), []);
  assert.deepEqual(rulesFor('<button disabled>Save</button>', 'x.tsx'), []);
});

test('skips a typeless button when the file has a form', () => {
  const source = '<form onSubmit={save}><button>Save</button></form>';
  assert.deepEqual(rulesFor(source, 'x.tsx'), []);
});

test('still flags an explicit type="button" with no handler inside a form', () => {
  const source = '<form onSubmit={save}><button type="button">Nope</button></form>';
  assert.deepEqual(rulesFor(source, 'x.tsx'), ['ANTISLOP-03']);
});

test('flags dead links', () => {
  assert.deepEqual(rulesFor('<a href="#">Home</a>', 'x.tsx'), ['ANTISLOP-03']);
  assert.deepEqual(rulesFor('<a href="">Home</a>', 'x.tsx'), ['ANTISLOP-03']);
  assert.deepEqual(rulesFor('<a href={""}>Home</a>', 'x.tsx'), ['ANTISLOP-03']);
  assert.deepEqual(rulesFor('<a href="/advisories">Advisories</a>', 'x.tsx'), []);
});

test('flags empty event handlers', () => {
  assert.deepEqual(rulesFor('<button onClick={() => {}}>x</button>', 'x.tsx'), ['ANTISLOP-03']);
  assert.deepEqual(rulesFor('<button onClick={function () {}}>x</button>', 'x.tsx'), ['ANTISLOP-03']);
});

test('applies JSX rules only to JSX files', () => {
  assert.deepEqual(rulesFor('/* <a href="#"> */', 'x.css'), []);
});

test('a documented allow marker suppresses a finding', () => {
  const source = '// antislop-allow: approved brand gradient\n.x{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}';
  assert.deepEqual(rulesFor(source, 'x.css'), []);
});

test('a marker without a reason does not suppress', () => {
  const source = '// antislop-allow\n.x{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}';
  assert.deepEqual(rulesFor(source, 'x.css'), ['ANTISLOP-01']);
});

test('a file-level allow marker suppresses every finding in the file', () => {
  const source = '/* antislop-allow-file: vendored brand sheet */\n.x{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}\n<button>Save</button>';
  assert.deepEqual(rulesFor(source, 'x.tsx'), []);
});

test('reports line, column, snippet, source, and hint', () => {
  const [finding] = analyzeSource('\n.x{background:linear-gradient(90deg, #8b5cf6, #3b82f6);}', 'x.css');
  assert.equal(finding.line, 1);
  assert.equal(finding.source, 'anti-slop R-01');
  assert.match(finding.snippet, /linear-gradient/);
  assert.ok(finding.hint.length > 0);
});

test('a clean file yields nothing', () => {
  const source = '.status{color:#111827;background:#f9fafb;border:1px solid #d1d5db;}';
  assert.deepEqual(rulesFor(source), []);
});
