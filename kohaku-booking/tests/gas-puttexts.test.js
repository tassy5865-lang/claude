const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function loadGas() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ console });
  vm.runInContext(src, ctx);
  return ctx;
}
const j = o => JSON.parse(JSON.stringify(o));

// リッチテキスト対応の範囲(実機のSheets相当)。setValues に '=' 始まりが渡ると式扱いになる、という実機の挙動を模す
function richRange(log) {
  return {
    setNumberFormat(f) { log.push(['fmt', f]); return this; },
    setValues(v) { log.push(['values', j(v)]); return this; },
    setRichTextValues(v) { log.push(['rich', v.map(r => r.map(x => x.text))]); return this; }
  };
}

test('putTexts_: リッチテキストが使えるときは文字列として書く(= 始まりも式にしない)', () => {
  const g = loadGas();
  g.SpreadsheetApp = { newRichTextValue: () => { const o = {}; o.setText = t => { o.text = t; return o; }; o.build = () => o; return o; } };
  const log = [];
  g.putTexts_(richRange(log), [['=1+1 式にならない確認', null, 5]]);
  assert.deepStrictEqual(log, [['fmt', '@'], ['rich', [['=1+1 式にならない確認', '', '5']]]]);
});

test('putTexts_: リッチテキスト非対応なら setValues(文字列化)にフォールバックする', () => {
  const g = loadGas();
  g.SpreadsheetApp = {};
  const log = [];
  const rng = { setNumberFormat(f) { log.push(['fmt', f]); return rng; }, setValues(v) { log.push(['values', j(v)]); return rng; } };
  g.putTexts_(rng, [['a', undefined, 0]]);
  assert.deepStrictEqual(log, [['fmt', '@'], ['values', [['a', '', '0']]]]);
});
