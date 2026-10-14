// Produce isolated website exports and adversarial fixtures for the actual game importer.
// No providers, credentials, Unity Editor mutations, or player-resource writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const A = require('../assets.js');
const output = process.argv[2];
if (!output || !/^website-style-fixtures(?:-[a-z0-9]+)?$/.test(path.basename(path.resolve(output))))
  throw new Error('Pass an isolated website-style-fixtures directory.');
if (fs.existsSync(output)) throw new Error('Fixture directory already exists; preserve it until reviewed.');
fs.mkdirSync(output, { recursive: true });

const base = A.worldAIStyleTemplate({ name: '田园诸邦', worldBackground: '河谷市镇、农田与商旅的共同文化。实际状态以游戏为准。', styleInstructions: '自然、简短；尊重角色身份、已知记忆和真实事实。' });
const raw = JSON.stringify(base);
const cases = [];
function add(label, source, expected, asAI = false, gameAccepted = expected) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8');
  let parsed, accepted = false, detail = '';
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    parsed = asAI ? A.validateAIStyle(A.parseAI(text, 'AIStyles')) : A.parseWorldAIStyle(text);
    accepted = true;
  } catch (error) { detail = error.message; }
  assert.equal(accepted, expected, label + ': ' + detail);
  // AI may surround JSON with a fence. Only its validated downloadable JSON reaches the game.
  const gameBytes = asAI && accepted ? Buffer.from(A.serializeWorldAIStyle(parsed), 'utf8') : bytes;
  const file = String(cases.length + 1).padStart(3, '0') + '.json';
  fs.writeFileSync(path.join(output, file), gameBytes);
  const record = { Label: label, File: file, Accepted: expected };
  if (gameAccepted !== expected) record.GameAccepted = gameAccepted;
  if (accepted) record.Expected = { Name: parsed.Name, WorldBackground: parsed.WorldBackground, StyleInstructions: parsed.StyleInstructions };
  cases.push(record);
}
function changed(key, value) { return JSON.stringify({ ...base, [key]: value }); }

add('manual website template -> canonical download', A.serializeWorldAIStyle(base), true);
add('mock AI fenced response -> canonical download', '```json\n' + raw + '\n```', true, true);
add('whitespace and multilingual text preserved', changed('WorldBackground', '  换行\n\tEnglish / 中文 😀 "引号" \\斜杠\u0000\u001f <script>\u2028\u2029  '), true);
add('both guidance fields may be empty', JSON.stringify({ ...base, WorldBackground: '', StyleInstructions: '' }), true);
add('80 UTF16 unit name', changed('Name', '名'.repeat(80)), true);
add('40 emoji use 80 UTF16 units', changed('Name', '😀'.repeat(40)), true);
add('41 emoji exceed 80 UTF16 units', changed('Name', '😀'.repeat(41)), false);
add('raw name checked before whitespace trim', changed('Name', ' ' + '名'.repeat(79) + ' '), false);
add('ordinary name trim matches .NET', changed('Name', '  田园诸邦 \t\n'), true);
add('.NET U0085 name trim', changed('Name', '\u0085田园诸邦\u0085'), true);
add('.NET U0085 blank name', changed('Name', '\u0085'), false);
add('UFEFF inside Name is retained by .NET', changed('Name', '\uFEFF'), true);
add('U200B inside Name is retained', changed('Name', '\u200B'), true);
add('blank name rejected', changed('Name', ' \r\n\t'), false);
add('8000 background plus 4000 instructions accepted', JSON.stringify({ ...base, WorldBackground: 'B'.repeat(8000), StyleInstructions: 'I'.repeat(4000) }), true);
add('8001 background rejected', changed('WorldBackground', 'B'.repeat(8001)), false);
add('8001 instructions rejected', changed('StyleInstructions', 'I'.repeat(8001)), false);
add('12001 combined units rejected', JSON.stringify({ ...base, WorldBackground: 'B'.repeat(8000), StyleInstructions: 'I'.repeat(4001) }), false);
add('Unicode emoji combined boundary accepted', JSON.stringify({ ...base, WorldBackground: '😀'.repeat(4000), StyleInstructions: '😀'.repeat(2000) }), true);
add('escaped control text at combined boundary accepted', JSON.stringify({ ...base, WorldBackground: '\u0001'.repeat(8000), StyleInstructions: '\u0002'.repeat(4000) }), true);
add('isolated high surrogate escape rejected', changed('WorldBackground', '\ud800'), false);
add('isolated low surrogate escape rejected', changed('StyleInstructions', '\udfff'), false);
add('ordinary D000 and D7FF Unicode escape accepted', raw.replace(JSON.stringify(base.WorldBackground), '"\\uD000\\uD7FF\\uE000"'), true);
add('null background rejected', changed('WorldBackground', null), false);
add('array background rejected', changed('WorldBackground', []), false);
add('nested instructions rejected', changed('StyleInstructions', { text: 'X' }), false);
add('Enabled is not exported in reusable files', changed('Enabled', true), false);
add('API key field rejected', changed('ApiKey', 'synthetic-not-a-key'), false);
add('model field rejected', changed('Model', 'test-model'), false);
add('unknown field rejected', changed('Extra', 'X'), false);
const missing = { ...base }; delete missing.StyleInstructions;
add('missing required field rejected', JSON.stringify(missing), false);
add('wrong profile rejected', changed('ProfileId', 'crownfall1-v2'), false);
add('profile whitespace cannot be trimmed', changed('ProfileId', ' crownfall1-v1 '), false);
add('schema 2 rejected', changed('SchemaVersion', 2), false);
add('schema string 1 rejected', changed('SchemaVersion', '1'), false);
add('schema floating lexical token rejected', raw.replace('"SchemaVersion":1', '"SchemaVersion":1.0'), false);
add('schema exponential lexical token rejected', raw.replace('"SchemaVersion":1', '"SchemaVersion":1e0'), false);
add('schema leading zero rejected', raw.replace('"SchemaVersion":1', '"SchemaVersion":01'), false);
add('duplicate exact field rejected', raw.replace('"Name":', '"Name":"重复","Name":'), false);
add('duplicate escaped field rejected', raw.replace('"Name":', '"\\u004eame":"重复","Name":'), false);
add('different case field rejected', raw.replace('"Name":', '"name":'), false);
add('extra different case field rejected', changed('name', 'wrong-case'), false);
add('single BOM at first byte accepted', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(raw)]), true);
add('BOM after whitespace rejected', ' \uFEFF' + raw, false);
// LoadFile removes one BOM and Parse removes another; website intentionally accepts only one.
// This narrower website policy cannot produce a file rejected by the game.
add('two BOMs rejected by stricter website; game strips twice', '\uFEFF\uFEFF' + raw, false, false, true);
add('JSON standard whitespace accepted', '\r\n\t ' + raw + ' \t\r\n', true);
add('leading NBSP rejected', '\u00A0' + raw, false);
add('trailing NBSP rejected', raw + '\u00A0', false);
add('JSON comments rejected', '/* comment */' + raw, false);
add('single quotes rejected', raw.replace('"Name"', "'Name'"), false);
add('trailing comma rejected', raw.slice(0, -1) + ',}', false);
add('multiple JSON roots rejected', raw + '{}', false);
add('128KiB raw input accepted', raw + ' '.repeat(A.AI_STYLE_LIMITS.maxBytes - Buffer.byteLength(raw)), true);
add('128KiB plus one byte rejected', raw + ' '.repeat(A.AI_STYLE_LIMITS.maxBytes + 1 - Buffer.byteLength(raw)), false);
add('BOM counts toward raw file byte budget', '\uFEFF' + raw + ' '.repeat(A.AI_STYLE_LIMITS.maxBytes - 2 - Buffer.byteLength(raw)), false);
// Insert bad bytes inside a quoted text field: a permissive decoder would replace them
// and leave otherwise valid JSON. Rejection therefore tests strict decoding, not syntax.
const prefix = Buffer.from('{"SchemaVersion":1,"ProfileId":"crownfall1-v1","Name":"UTF8","WorldBackground":"');
const suffix = Buffer.from('","StyleInstructions":""}');
const badUtf8 = bytes => Buffer.concat([prefix, Buffer.from(bytes), suffix]);
add('bad UTF8 continuation byte rejected', badUtf8([0x80]), false);
add('overlong UTF8 rejected', badUtf8([0xc0, 0xaf]), false);
add('UTF8 encoded surrogate rejected', badUtf8([0xed, 0xa0, 0x80]), false);
add('truncated UTF8 rejected', badUtf8([0xe4, 0xb8]), false);

fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(cases, null, 2), 'utf8');
process.stdout.write('Website validation agreed with ' + cases.length + ' fixture expectations. Load manifest.json with the real-game .NET runner.\n');
