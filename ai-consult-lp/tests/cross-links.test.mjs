// 自己紹介HP・ポートフォリオから LP へのリンク表記が Nexsist に揃っていることを確認するテスト。
// 実行: node --test ai-consult-lp/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const files = ['../../自己紹介HP/v2/index.html', '../../自己紹介HP/index.html', '../../portfolio/index.html'];

test('cross-site labels use Nexsist', () => {
  for (const f of files) {
    const src = read(f);
    const links = [...src.matchAll(/href="https:\/\/tassy5865-lang\.github\.io\/claude\/ai-consult-lp\/"[^>]*>([^<]*)/g)].map((m) => m[1]);
    const labels = [...src.matchAll(/"label":\s*"([^"]*)",\s*"href":\s*"https:\/\/tassy5865-lang\.github\.io\/claude\/ai-consult-lp\/"/g)].map((m) => m[1]);
    assert.ok(links.length + labels.length > 0, `${f}: no links found`);
    for (const l of [...links, ...labels]) {
      if (l.includes('案内ページを公開しました')) continue; // 2026.09 のお知らせは過去記録として残す
      assert.ok(l.includes('Nexsist'), `${f}: ${l}`);
    }
  }
});

test('portfolio LP card is renamed', () => {
  const p = read('../../portfolio/index.html');
  assert.doesNotMatch(p, /AI導入・伴走支援LP/);
  assert.match(p, /"title":\s*"Nexsist[^"]*"/);
});

test('v2 news has the renewal entry', () => {
  const v2 = read('../../自己紹介HP/v2/index.html');
  assert.match(v2, /<time>2026\.11<\/time>[\s\S]{0,200}Nexsist/);
});
