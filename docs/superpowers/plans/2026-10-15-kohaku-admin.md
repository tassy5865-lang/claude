# 琥珀サイト 管理画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 店主が GitHub を触らずに、ブラウザの管理画面から琥珀サイトの文章・料金メニュー・写真・お知らせを編集して公開できるようにする。

**Architecture:** 琥珀サイトを専用リポジトリ `kohaku-site` に分離し、`admin/` を同居させる。`index.html` の編集範囲に HTML コメントの目印(`<!--edit:KEY-->…<!--/edit:KEY-->`)と `data-photo` を付け、管理画面は文字列置換だけでその範囲を書き換える(DOM 再シリアライズをしないので、他の部分は 1 バイトも変わらない)。保存は GitHub Git Data API で `index.html` と画像を 1 コミットにまとめる。トークンはパスワードで暗号化して `admin/config.json` に置く。

**Tech Stack:** 素の HTML / ES modules(ビルドなし)、WebCrypto(PBKDF2 + AES-GCM)、GitHub REST API、テストは Node 組み込みの `node:test`(Node 20+、依存パッケージなし)、既存の Python 検査 `tools/check_site.py`。

**Spec:** `docs/superpowers/specs/2026-10-15-kohaku-admin-design.md`(計画段階で下の「仕様からの補正」を反映する)

## 仕様からの補正(Task 1 でスペックに反映する)
- 目印は `data-edit` 属性ではなく **HTML コメント**にする(`data-photo` は画像のみ属性)。DOM 経由の書き出しだと `index.html` 全体が整形し直されて JSON-LD・GA4 が変わる恐れがあるため。
- `index.html` には**すでに** canonical / og:url / og:image / JSON-LD の url がある(旧URL)。「追加」ではなく「新URLに置換」。
- 保存は `PUT contents` を画像ごとに呼ぶのではなく、**Git Data API で 1 コミット**にする(途中で失敗しても中途半端な状態にならない)。
- 検査ルールは Python と JS で重複させず `tools/rules.json` に集約する。**固定の料金リスト(`PRICES`/`ROWS`)は廃止**し、形式検査に置き換える(そのままだと店主が料金を直した時点で検査が落ちるため)。

## Global Constraints
- ビルド不要の静的サイト。管理画面も 1 ディレクトリ(`admin/`)のみ、外部ライブラリなし(CDN 読み込みなし)。
- 屋号の表記は「琥珀(こはく)」。電話番号・口コミ・効能の断定は載せない(`tools/rules.json` で機械的に拒否)。
- 料金は税込・半角 `¥10,000` 形式。
- 公開サイトは JS なしでも全文が読める(`index.html` は静的 HTML のまま)。
- 管理画面は `<meta name="robots" content="noindex">`。ユーザー入力は必ず `textContent`/`value`/エスケープ経由で扱い、`innerHTML` に生で入れない。
- トークンは `kohaku-site` のみ・Contents: Read and write のみ・有効 90 日。トークンはメモリのみに保持し、localStorage 等に保存しない。
- 元画像・動画の未追跡素材は新リポジトリに入れない。旧フォルダの削除は git で行い、生の `rm`/`mv` を使わない(OneDrive 同期事故の回避)。`git add -A` を使わない。
- 新リポジトリは OneDrive の**外**(`C:\Users\oryou\kohaku-site`)に作る。

## Review Focus
1. 店主が料金欄に `10000` / `１０，０００` / `¥10,000円` / `1万` / 空欄 / `-500` を入れた場合 → 前 3 つは `¥10,000` に整形、後 3 つは公開前に「料金の形式が正しくありません」で止まる(Task 4・7)。
2. 文章に `<script>`、`&`、`<`、`"` を入れた場合 → 画面にそのまま文字として出て、HTML として解釈されない(Task 2・4・9)。
3. 写真に HEIC・巨大ファイル・画像でないファイルを選んだ場合 → 平易な日本語で拒否し、既存の写真は変わらない。スマホの縦写真が横倒しにならない(Task 6・9)。
4. 店主が編集している間に別の変更が入っていた(田代さんが push した)/公開中に通信が切れた場合 → 上書きせず「最新を読み込み直してください」を表示、サイトは前の状態のまま(Task 8)。
5. パスワード違い・トークン期限切れの場合 → クラッシュせず、前者は「パスワードが違います」、後者は「期限が切れています。田代さんに連絡してください」(Task 8・9)。
6. 目印コメントが消えた/重複した `index.html` → 書き込まずに「編集範囲の目印がありません: KEY」で止まる(Task 2)。
7. 「効果」「改善」など載せない方針の語、電話番号らしき数字を入れた場合 → 公開前に語を示して止まる(Task 3・5)。

---

## File Structure(新リポジトリ `kohaku-site` のルート)

| パス | 役割 |
|---|---|
| `index.html` `styles.css` `main.js` `images/` | 既存サイト(移設)。`index.html` に目印と `.announce` 帯を追加 |
| `tools/check_site.py` | 既存検査。ルールを `rules.json` から読む形に変更 |
| `tools/rules.json` | 必須語・禁止語・必須リンク等の共有ルール(Python / JS 共通) |
| `tools/add-markers.mjs` | 一度だけ実行する目印挿入スクリプト |
| `tools/make-config.mjs` | トークンを暗号化して `admin/config.json` を作る(田代さん用) |
| `package.json` | `"type":"module"`、`npm test` |
| `admin/index.html` `admin/admin.css` | 管理画面の入れ物 |
| `admin/js/text.js` | エスケープ・インライン(`<br>`)変換 |
| `admin/js/b64.js` | Base64 ⇄ Uint8Array |
| `admin/js/regions.js` | 目印範囲の取得/置換、`data-photo` の取得/置換 |
| `admin/js/blocks.js` `list.js` `faq.js` `price.js` | 領域ごとの parse / render |
| `admin/js/site-model.js` | `readModels` / `applyModels` / `summarizeChanges` |
| `admin/js/validate.js` | 公開前検査(Python 検査の JS 版) |
| `admin/js/crypto.js` | トークン暗号化・復号 |
| `admin/js/github.js` | 読み込みと 1 コミットでの公開 |
| `admin/js/images.js` `preview.js` | 画像の縮小、プレビュー用 HTML |
| `admin/js/app.js` | 画面(ログイン・4 タブ・プレビュー・公開) |
| `admin/tests/*.test.js` | `node:test` のテスト |
| `.github/workflows/check.yml` | push 時に Python 検査と `npm test` |

---

### Task 1: 専用リポジトリへ分離して公開する

**Files:**
- Create: `C:\Users\oryou\kohaku-site\`(新リポジトリ)
- Create: `.gitattributes`, `.github/workflows/check.yml`, `package.json`
- Create: `docs/superpowers/specs/` `docs/superpowers/plans/`(旧リポジトリからのコピー)

**Interfaces:**
- Produces: 公開URL `https://tassy5865-lang.github.io/kohaku-site/`、以降の全タスクの作業ディレクトリ。

- [ ] **Step 1: ユーザーに確認する(外部に公開リポジトリを作るため)**

「`tassy5865-lang/kohaku-site` を **公開** リポジトリとして作成します。サイトの全ファイルが誰でも見られます。進めてよいですか」と聞き、yes を得てから次へ。

- [ ] **Step 2: コミット済みファイルだけを OneDrive の外に書き出す**

```bash
SRC="C:/Users/oryou/OneDrive/Desktop/裕貴/OneDrive/ドキュメント/claude"
mkdir -p /c/Users/oryou/kohaku-site && cd /c/Users/oryou/kohaku-site
git init -b main
git -C "$SRC" archive HEAD:自己紹介HP/アロマサロン琥珀 | tar -x
git ls-files --others | head -50
ls
```

Expected: `index.html styles.css main.js images tools CLAUDE.md …` があり、`*.mp4`(ルート直下の元動画)・スクリーンショットは**ない**。`images/opening.mp4` `images/opening-wide.mp4` は含まれる。

- [ ] **Step 3: 改行コードを LF に固定する**

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.mp4 binary
```

```bash
git add --renormalize . 2>/dev/null; git add .gitattributes
git ls-files --eol index.html
```

Expected: `i/lf` を含む(`i/crlf` なら `git add --renormalize index.html` を実行)。

- [ ] **Step 4: `package.json` と CI を追加する**

`package.json`:

```json
{
  "name": "kohaku-site",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"admin/tests/*.test.js\""
  }
}
```

`.github/workflows/check.yml`:

```yaml
name: check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: python3 tools/check_site.py
      - run: npm test --if-present
```

- [ ] **Step 5: 既存検査が通ることを確認してコミット**

```bash
python tools/check_site.py
git add .
git commit -m "琥珀サイトを専用リポジトリに分離"
```

Expected: `OK: すべての検査に合格`。

- [ ] **Step 6: GitHub に作成して Pages を有効化**

```bash
gh repo create tassy5865-lang/kohaku-site --public --source . --push
gh api -X POST repos/tassy5865-lang/kohaku-site/pages -f "source[branch]=main" -f "source[path]=/"
```

Expected: 約 1〜2 分後に `https://tassy5865-lang.github.io/kohaku-site/` が表示される。

- [ ] **Step 7: 表示を確認する**

claude-in-chrome で新URLを開き、①トップが表示される ②オープニング動画が再生されスキップできる ③画像が欠けていない を確認する(`read_page` でも確認)。GA4 リアルタイムに新ホスト名のアクセスが出ることも確認する。

- [ ] **Step 8: 設計書・計画を新リポジトリにも写す**

`docs/superpowers/specs/2026-10-15-kohaku-admin-design.md` と `docs/superpowers/plans/2026-10-15-kohaku-admin.md` を新リポジトリの同じパスにコピーしてコミットする(設計の経緯が新リポジトリ単体で読めるようにするため)。旧リポジトリ側の原本は、計画作成時に補正済み。

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
OLD="C:/Users/oryou/OneDrive/Desktop/裕貴/OneDrive/ドキュメント/claude"
cp "$OLD/docs/superpowers/specs/2026-10-15-kohaku-admin-design.md" docs/superpowers/specs/
cp "$OLD/docs/superpowers/plans/2026-10-15-kohaku-admin.md" docs/superpowers/plans/
git add docs && git commit -m "docs: 管理画面の設計書と実装計画を追加" && git push
```

---

### Task 2: URL を新URLに更新し、旧URLをリダイレクトにする

**Files:**
- Modify: `kohaku-site/index.html`(canonical / og:url / og:image / twitter:image / JSON-LD の url)
- Modify(旧リポジトリ): `自己紹介HP/アロマサロン琥珀/` 配下(`index.html` をリダイレクトに、他の追跡ファイルを `git rm`)
- Modify(旧リポジトリ): 旧URLを参照しているリンク元

**Interfaces:**
- Consumes: Task 1 の公開URL。
- Produces: 旧URLのアクセスが新URLへ移る状態。

- [ ] **Step 1: 新リポジトリで旧URLの出現箇所を洗い出す**

```bash
cd /c/Users/oryou/kohaku-site
grep -n "tassy5865-lang.github.io/claude" index.html
```

Expected: canonical・og:url・og:image・twitter:image・JSON-LD の `url`/`image` など。

- [ ] **Step 2: 置換する**

旧: `https://tassy5865-lang.github.io/claude/%E8%87%AA%E5%B7%B1%E7%B4%B9%E4%BB%8BHP/%E3%82%A2%E3%83%AD%E3%83%9E%E3%82%B5%E3%83%AD%E3%83%B3%E7%90%A5%E7%8F%80/`
新: `https://tassy5865-lang.github.io/kohaku-site/`

```bash
node -e '
const fs=require("fs");
const old="https://tassy5865-lang.github.io/claude/%E8%87%AA%E5%B7%B1%E7%B4%B9%E4%BB%8BHP/%E3%82%A2%E3%83%AD%E3%83%9E%E3%82%B5%E3%83%AD%E3%83%B3%E7%90%A5%E7%8F%80/";
const nu="https://tassy5865-lang.github.io/kohaku-site/";
let s=fs.readFileSync("index.html","utf8");
const n=s.split(old).length-1;
fs.writeFileSync("index.html", s.split(old).join(nu));
console.log("replaced",n);
'
grep -c "github.io/claude" index.html
python tools/check_site.py --publish
```

Expected: `replaced N`(N≥4)、`grep -c` が `0`、検査 `OK`。

- [ ] **Step 3: CLAUDE.md の記述を更新してコミット・push**

`CLAUDE.md` の「公開URLが決まったら…」の項目を「公開URL: `https://tassy5865-lang.github.io/kohaku-site/`(2026-10-15 にリポジトリ分離)」に置き換える。

```bash
git add index.html CLAUDE.md
git commit -m "canonical / OGP / JSON-LD を新URLに更新"
git push
```

- [ ] **Step 4: 旧リポジトリにリンク元を探す**

```bash
cd "C:/Users/oryou/OneDrive/Desktop/裕貴/OneDrive/ドキュメント/claude"
grep -rIl --exclude-dir=.git --exclude-dir=node_modules -e "%E3%82%A2%E3%83%AD%E3%83%9E%E3%82%B5%E3%83%AD%E3%83%B3%E7%90%A5%E7%8F%80" -e "アロマサロン琥珀/" . | head -30
```

Expected: portfolio・自己紹介HP などのファイル一覧。各ファイルを開き、**旧URL → 新URL**にだけ置換する(相対リンク `./アロマサロン琥珀/` で同一リポジトリ内を指す箇所があれば、新URLの絶対リンクにする)。

- [ ] **Step 5: 旧フォルダをリダイレクトページ 1 枚にする(git で)**

`自己紹介HP/アロマサロン琥珀/index.html` を次の内容に**置き換える**:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>琥珀(こはく)</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="https://tassy5865-lang.github.io/kohaku-site/">
  <meta http-equiv="refresh" content="0; url=https://tassy5865-lang.github.io/kohaku-site/">
</head>
<body>
  <p><a href="https://tassy5865-lang.github.io/kohaku-site/">琥珀(こはく)のサイトはこちら</a></p>
</body>
</html>
```

```bash
cd "自己紹介HP/アロマサロン琥珀"
git ls-files | grep -v '^index.html$' | while read -r f; do git rm -q -- "$f"; done
cd ../..
git add "自己紹介HP/アロマサロン琥珀/index.html"
git status --short "自己紹介HP/アロマサロン琥珀" | head
```

Expected: `index.html` が `M`、他は `D`。未追跡の元素材(`.mp4` `.png` など)は残る。

- [ ] **Step 6: コミットして push(狭いパスだけ)**

```bash
git commit -m "琥珀サイトを kohaku-site に移設し、旧URLをリダイレクトにする" -- "自己紹介HP/アロマサロン琥珀"
```

リンク元を直したファイルも、パスを指定して個別にコミットする(`git add -A` と `git commit -a` は使わない。この作業ツリーには無関係の変更が多数ある)。push 後、Pages のビルドが成功することを確認する(`gh run list --limit 3`、旧URLを開いて新URLに飛ぶこと)。

---

### Task 3: 検査ルールを `rules.json` に集約し、料金の固定リストを廃止する

**Files:**
- Create: `tools/rules.json`
- Modify: `tools/check_site.py`
- Test: `admin/tests/rules.test.js`

**Interfaces:**
- Produces: `tools/rules.json` のキー `mustContain: string[]`, `mustNotContain: string[]`, `mustLink: string[]`, `forbiddenRe: {pattern:string,label:string}[]`, `sectionIds: string[]`。JS の Task 5(`validateDocument`)と Python が共有する。

- [ ] **Step 1: 失敗するテストを書く(JS 側がルールを読めて、現行 index.html の語を含むこと)**

`admin/tests/rules.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../../tools/rules.json', import.meta.url), 'utf8'));

test('rules.json has the expected keys', () => {
  for (const k of ['mustContain', 'mustNotContain', 'mustLink', 'forbiddenRe', 'sectionIds']) {
    assert.ok(Array.isArray(rules[k]) && rules[k].length > 0, k);
  }
});

test('店主が編集する料金欄の値を必須語にしていない', () => {
  for (const s of ['¥10,000', '¥12,000', '100分']) assert.ok(!rules.mustContain.includes(s), `固定していないこと: ${s}`);
  assert.ok(!('prices' in rules) && !('rows' in rules));
});

test('forbidden patterns compile', () => {
  for (const f of rules.forbiddenRe) new RegExp(f.pattern);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm test`
Expected: FAIL(`rules.json` が存在しない)。

- [ ] **Step 3: `tools/rules.json` を作る**

```json
{
  "mustContain": [
    "琥珀", "こはく", "完全予約制", "女性専用",
    "兵庫県姫路市大津区天神町2丁目176-10", "10:00", "17:00", "15:00", "不定休",
    "駐車場", "田代真弓", "12年目", "¥3,500",
    "おかま直伝よもぎ蒸し®", "ハーブの読み取り®", "おかま直伝頭ほぐし®",
    "料金・内容は変更になることがあります",
    "税込", "1台のみ", "当日キャンセル", "2週間以内", "妊娠の可能性がある時期", "妊活中", "授乳中",
    "生理中", "予約サイトのカレンダー", "担当医にご相談", "ペースメーカー", "クマザサ蒸し", "備考欄", "30分前後", "事前にお知らせください"
  ],
  "mustNotContain": ["TODO", "TBD", "tel:", "お電話", "治る", "治ります", "痩せる", "必ず効果", "口コミ"],
  "mustLink": [
    "https://tol-app.jp/s/hgcmuzzsyrx2ji76o97n",
    "https://line.me/R/ti/p/@ncf2830x",
    "https://ig.me/m/kohaku_salon.himeji",
    "https://www.instagram.com/kohaku_salon.himeji/"
  ],
  "forbiddenRe": [
    { "pattern": "0\\d{1,4}[-ー−]\\d{1,4}[-ー−]\\d{3,4}", "label": "電話番号らしき数字" },
    { "pattern": "(改善|デトックス|効果|効能|お客様の声|★|☆|おやすみ処|でありたいと考えています|頑張りすぎるあなた)", "label": "効能・口コミ・出典のない語" }
  ],
  "sectionIds": ["top", "worries", "about", "flow", "kodawari", "menu", "notice", "faq", "access"]
}
```

(注: 旧 `MUST_CONTAIN` の `¥10,000` `¥12,000`、旧 `MUST_CONTAIN_MORE` の `100分` は、店主が編集する料金欄の値なので外した。)

- [ ] **Step 4: `check_site.py` を `rules.json` 読み込み・料金の形式検査に変える**

`tools/check_site.py` の先頭の定数ブロック(`PRICES = [` から `SECTION_IDS = [...]` まで)を次に置き換える:

```python
RULES = json.loads((ROOT / "tools" / "rules.json").read_text(encoding="utf-8"))
MUST_CONTAIN = RULES["mustContain"]
MUST_LINK = RULES["mustLink"]
MUST_NOT_CONTAIN = RULES["mustNotContain"]
FORBIDDEN_RE = [(f["pattern"], f["label"]) for f in RULES["forbiddenRe"]]
SECTION_IDS = RULES["sectionIds"]
YEN_RE = re.compile(r"^¥\d{1,3}(,\d{3})*$")
```

`main()` 内の次の 3 か所を直す。

(a) `for p in PRICES:` ループ(3 行)を削除する。

(b) `for s_ in MUST_CONTAIN_MORE:` ループ(3 行)を削除する(`mustContain` に統合済み)。

(c) 料金表の検査(`rows = [...]` から `errors.append(f"料金表の行が仕様と違います…")` まで)を次に置き換える:

```python
    rows = [(re.sub(r"\s+", " ", n).strip(), y.strip()) for n, y in
            re.findall(r'<span class="name">(.*?)</span><span class="yen">(.*?)</span>', raw)]
    if not rows:
        errors.append("料金表の行がありません")
    for name, yen in rows:
        if not name:
            errors.append("名前が空の料金行があります")
        if not YEN_RE.match(yen):
            errors.append(f"料金の形式が正しくありません: {name} → {yen}")
```

- [ ] **Step 5: テストと検査を通す**

Run: `npm test && python tools/check_site.py`
Expected: テスト PASS、`OK: すべての検査に合格`。

- [ ] **Step 6: 料金を変えても検査が通ることを確かめる(退行テスト)**

```bash
sed 's/¥5,600/¥5,800/' index.html > /tmp/index.changed.html && cp index.html /tmp/index.orig.html && cp /tmp/index.changed.html index.html && python tools/check_site.py; cp /tmp/index.orig.html index.html
```

Expected: `OK`(料金の値を変えても落ちない)。最後に `git status --short index.html` が空であること。

- [ ] **Step 7: Commit**

```bash
git add tools/rules.json tools/check_site.py admin/tests/rules.test.js
git commit -m "検査ルールを rules.json に集約し、料金の固定リストを形式検査に変更"
```

---

### Task 4: テキスト・目印範囲・料金の基礎ライブラリ

**Files:**
- Create: `admin/js/text.js`, `admin/js/b64.js`, `admin/js/regions.js`, `admin/js/price.js`(`formatYen` のみ。Task 6 で拡張)
- Test: `admin/tests/text.test.js`, `admin/tests/regions.test.js`, `admin/tests/yen.test.js`

**Interfaces:**
- Produces:
  - `text.js`: `escapeHtml(s)`, `unescapeHtml(s)`, `escapeAttr(s)`, `toInline(text): string`(`\n`→`<br>`、エスケープ済み), `fromInline(html): string`
  - `b64.js`: `toBase64(u8: Uint8Array): string`, `fromBase64(s: string): Uint8Array`
  - `regions.js`: `getRegion(html, key): string`, `setRegion(html, key, inner): string`, `getPhoto(html, key): {src,alt,width,height}`, `setPhoto(html, key, {src,alt,width,height}): string`(いずれも不正時 `Error` を throw)
  - `price.js`: `formatYen(input: string): string|null`

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/text.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toInline, fromInline, escapeAttr } from '../js/text.js';
import { toBase64, fromBase64 } from '../js/b64.js';

test('toInline escapes markup and converts newlines to <br>', () => {
  assert.equal(toInline('a<b>&c\nd'), 'a&lt;b&gt;&amp;c<br>d');
});
test('script tags become inert text', () => {
  assert.ok(!toInline('<script>alert(1)</script>').includes('<script'));
});
test('fromInline is the inverse of toInline', () => {
  const s = 'こんにちは<&>"\n二行目';
  assert.equal(fromInline(toInline(s)), s);
});
test('fromInline strips unknown tags but keeps text', () => {
  assert.equal(fromInline('<s>通常</s>価格'), '通常価格');
});
test('escapeAttr escapes quotes', () => {
  assert.equal(escapeAttr('a"b'), 'a&quot;b');
});
test('base64 round trip with large input', () => {
  const u = new Uint8Array(100000).map((_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(u)), u);
});
```

`admin/tests/regions.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegion, setRegion, getPhoto, setPhoto } from '../js/regions.js';

const html = '<main><!--edit:a-->old<!--/edit:a--><p>keep $& this</p><img src="images/x.jpg" width="10" height="20" data-photo="p1" alt="旧"></main>';

test('getRegion returns inner text', () => {
  assert.equal(getRegion(html, 'a'), 'old');
});
test('setRegion replaces only the region and keeps $ patterns literal', () => {
  const out = setRegion(html, 'a', 'new $& $1');
  assert.equal(getRegion(out, 'a'), 'new $& $1');
  assert.ok(out.includes('<p>keep $& this</p>'));
});
test('missing marker throws a Japanese message', () => {
  assert.throws(() => getRegion(html, 'zzz'), /編集範囲の目印がありません: zzz/);
});
test('duplicated marker throws', () => {
  const dup = html + '<!--edit:a--><!--/edit:a-->';
  assert.throws(() => getRegion(dup, 'a'), /重複/);
});
test('unclosed marker throws', () => {
  assert.throws(() => getRegion('<!--edit:a-->x', 'a'), /閉じ/);
});
test('getPhoto / setPhoto read and write attributes', () => {
  assert.deepEqual(getPhoto(html, 'p1'), { src: 'images/x.jpg', alt: '旧', width: 10, height: 20 });
  const out = setPhoto(html, 'p1', { src: 'images/y.jpg', alt: 'a"b', width: 30, height: 40 });
  assert.deepEqual(getPhoto(out, 'p1'), { src: 'images/y.jpg', alt: 'a"b', width: 30, height: 40 });
  assert.ok(out.includes('data-photo="p1"'));
});
test('missing photo key throws', () => {
  assert.throws(() => getPhoto(html, 'nope'), /写真の目印がありません: nope/);
});
```

`admin/tests/yen.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatYen } from '../js/price.js';

test('formats common inputs', () => {
  assert.equal(formatYen('10000'), '¥10,000');
  assert.equal(formatYen('¥10,000'), '¥10,000');
  assert.equal(formatYen('１０，０００'), '¥10,000');
  assert.equal(formatYen('10,000円'), '¥10,000');
  assert.equal(formatYen(' ￥6000 '), '¥6,000');
});
test('rejects what cannot be a price', () => {
  for (const bad of ['', '1万', '-500', '0', 'abc', '12.5', '¥']) assert.equal(formatYen(bad), null, bad);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL(モジュールが無い)。

- [ ] **Step 3: 実装する**

`admin/js/text.js`:

```js
export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function unescapeHtml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
// 1 か所のテキスト(改行を含む)→ HTML。改行は <br>。
export function toInline(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map(escapeHtml).join('<br>');
}
// HTML → テキスト。<br> は改行、その他のタグは取り除く。
export function fromInline(html) {
  return unescapeHtml(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}
```

`admin/js/b64.js`:

```js
export function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
```

`admin/js/regions.js`:

```js
import { escapeAttr, unescapeHtml } from './text.js';

const open = (k) => `<!--edit:${k}-->`;
const close = (k) => `<!--/edit:${k}-->`;

function locate(html, key) {
  const a = html.indexOf(open(key));
  if (a < 0) throw new Error(`編集範囲の目印がありません: ${key}`);
  if (html.indexOf(open(key), a + 1) >= 0) throw new Error(`編集範囲の目印が重複しています: ${key}`);
  const start = a + open(key).length;
  const end = html.indexOf(close(key), start);
  if (end < 0) throw new Error(`編集範囲の目印が閉じていません: ${key}`);
  return [start, end];
}

export function getRegion(html, key) {
  const [s, e] = locate(html, key);
  return html.slice(s, e);
}
export function setRegion(html, key, inner) {
  const [s, e] = locate(html, key);
  return html.slice(0, s) + inner + html.slice(e);
}

function findImg(html, key) {
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].filter((m) => m[0].includes(`data-photo="${key}"`));
  if (tags.length !== 1) throw new Error(`写真の目印がありません: ${key}`);
  return tags[0];
}
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : '';
};
function withAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, (_, a, b) => a + value + b);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
}
export function getPhoto(html, key) {
  const tag = findImg(html, key)[0];
  return {
    src: attr(tag, 'src'),
    alt: unescapeHtml(attr(tag, 'alt')),
    width: Number(attr(tag, 'width')) || 0,
    height: Number(attr(tag, 'height')) || 0,
  };
}
export function setPhoto(html, key, { src, alt, width, height }) {
  const m = findImg(html, key);
  let tag = m[0];
  tag = withAttr(tag, 'src', escapeAttr(src));
  tag = withAttr(tag, 'alt', escapeAttr(alt));
  if (width) tag = withAttr(tag, 'width', String(width));
  if (height) tag = withAttr(tag, 'height', String(height));
  return html.slice(0, m.index) + tag + html.slice(m.index + m[0].length);
}
```

`admin/js/price.js`(この時点では `formatYen` のみ):

```js
// 入力を「¥10,000」形式に整える。価格として読めなければ null。
export function formatYen(input) {
  const s = String(input).normalize('NFKC').replace(/[¥,\s円]/g, '');
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  if (n <= 0) return null;
  return '¥' + n.toLocaleString('en-US');
}
```

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: すべて PASS。

- [ ] **Step 5: Commit**

```bash
git add admin/js/text.js admin/js/b64.js admin/js/regions.js admin/js/price.js admin/tests/text.test.js admin/tests/regions.test.js admin/tests/yen.test.js
git commit -m "管理画面: テキスト変換・目印範囲・金額整形の基礎ライブラリ"
```

---

### Task 5: `index.html` に目印と「お知らせ帯」を入れる

**Files:**
- Create: `tools/add-markers.mjs`
- Modify: `index.html`, `styles.css`
- Test: `admin/tests/markers.test.js`

**Interfaces:**
- Produces: `index.html` 内の領域キー `notice` `about` `worries-list` `worries-lead` `kodawari-points` `faq` `price-card` `menu-rose` `menu-body` `menu-course` `menu-pair`、`data-photo` のキー `hero-l` `hero-r` `about` `kodawari-1` `kodawari-2` `menu-rose` `menu-body` `menu-pair` `access`。

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/markers.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRegion, getPhoto } from '../js/regions.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const REGIONS = ['notice', 'about', 'worries-list', 'worries-lead', 'kodawari-points', 'faq', 'price-card', 'menu-rose', 'menu-body', 'menu-course', 'menu-pair'];
const PHOTOS = ['hero-l', 'hero-r', 'about', 'kodawari-1', 'kodawari-2', 'menu-rose', 'menu-body', 'menu-pair', 'access'];

test('every edit region exists exactly once', () => {
  for (const k of REGIONS) assert.doesNotThrow(() => getRegion(html, k), k);
});
test('every photo key exists and has alt text', () => {
  for (const k of PHOTOS) assert.ok(getPhoto(html, k).alt.length > 0, k);
});
test('notice region is empty by default', () => {
  assert.equal(getRegion(html, 'notice'), '');
});
test('regions hold what we expect', () => {
  assert.match(getRegion(html, 'about'), /はじめまして/);
  assert.match(getRegion(html, 'menu-rose'), /至福のローズフェイシャルコース/);
  assert.match(getRegion(html, 'menu-pair'), /ペア蒸し/);
  assert.match(getRegion(html, 'faq'), /予約は必要ですか/);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL(目印がありません)。

- [ ] **Step 3: 目印挿入スクリプトを書く**

`tools/add-markers.mjs`:

```js
// 一度だけ実行する。index.html に編集範囲の目印と data-photo を入れる。
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../index.html', import.meta.url);
let html = readFileSync(FILE, 'utf8');
if (html.includes('<!--edit:')) { console.log('すでに目印があります'); process.exit(0); }

const re = (s) => ({ re: new RegExp(s) });
// anchor は文字列(完全一致)か { re }(正規表現)。where: 'before' | 'after'
const REGIONS = [
  { key: 'about', start: ['<p>はじめまして。', 'before'], end: ['そう思っていただける場所でありたいと<br>思っています</p>', 'after'] },
  { key: 'worries-list', start: ['<ul class="checklist checklist--box">', 'after'], end: ['<li>気持ちまで疲れているように感じる</li>', 'after'] },
  { key: 'worries-lead', start: ['<p class="lead lead--serif">「年齢だから仕方ない」', 'before'], end: ['健康づくりとしてのケアを始めてみませんか？</p>', 'after'] },
  { key: 'kodawari-points', start: ['<ul class="points">', 'after'], end: ['<li>他にも空間ごとの香りの違いなど、お客様が五感を楽しむを意識しています。</li>', 'after'] },
  { key: 'faq', start: ['<h2>よくある質問</h2>', 'after'], end: ['妊活中の方は低温期に行います。</p></details>', 'after'] },
  { key: 'price-card', start: ['<div class="price-card">', 'after'], end: ['<p class="price"><s>通常 ¥12,000</s>¥10,000</p>', 'after'] },
  { key: 'menu-rose', start: ['<h3>至福のローズフェイシャルコース</h3>', 'before'], end: ['※B(頭ほぐし35分)は、サロンで用意した上衣に着替えていただきます。</p>', 'after'] },
  { key: 'menu-body', start: ['<h3>アロマボディトリートメント</h3>', 'before'], end: [re('¥14,000</span></li>\\s*</ul>'), 'after'] },
  { key: 'menu-course', start: ['<h3>香りに包まれて全身満たされるコース</h3>', 'before'], end: [re('¥18,600</span></li>\\s*</ul>'), 'after'] },
  { key: 'menu-pair', start: ['<h3>ペア蒸し</h3>', 'before'], end: [re('¥18,000</span></li>\\s*</ul>'), 'after'] },
];

function find(h, anchor, from = 0) {
  if (typeof anchor === 'string') {
    const i = h.indexOf(anchor, from);
    if (i < 0) throw new Error(`見つかりません: ${anchor}`);
    if (h.indexOf(anchor, i + 1) >= 0 && from === 0) throw new Error(`複数あります: ${anchor}`);
    return [i, i + anchor.length];
  }
  const g = new RegExp(anchor.re.source, 'g');
  g.lastIndex = from;
  const m = g.exec(h);
  if (!m) throw new Error(`見つかりません: ${anchor.re}`);
  return [m.index, m.index + m[0].length];
}

for (const r of REGIONS) {
  const [s0, s1] = find(html, r.start[0]);
  const startAt = r.start[1] === 'before' ? s0 : s1;
  const [e0, e1] = find(html, r.end[0], startAt);
  const endAt = r.end[1] === 'before' ? e0 : e1;
  if (endAt < startAt) throw new Error(`範囲が逆です: ${r.key}`);
  html = html.slice(0, startAt) + `<!--edit:${r.key}-->` + html.slice(startAt, endAt) + `<!--/edit:${r.key}-->` + html.slice(endAt);
}

// お知らせ帯(空)。<main> の直後。
html = html.replace(/(<main>)/, '$1\n    <!--edit:notice--><!--/edit:notice-->');

// 写真
const PHOTOS = [
  ['hero-l', 'src="images/salon-clock.jpg"'],
  ['hero-r', 'src="images/salon-hero.jpg"'],
  ['about', 'src="images/owner-steam.jpg"'],
  ['kodawari-1', 'src="images/salon-herb-plate.jpg" loading="lazy"'],
  ['kodawari-2', 'src="images/salon-herbs-hands.jpg" loading="lazy"'],
  ['menu-rose', 'src="images/salon-herb-plate.jpg" width="900"'],
  ['menu-body', 'src="images/salon-curtain.jpg"'],
  ['menu-pair', 'src="images/salon-herbs-hands.jpg" width="675"'],
  ['access', 'src="images/salon-exterior.jpg"'],
];
for (const [key, snippet] of PHOTOS) {
  const i = html.indexOf(snippet);
  if (i < 0 || html.indexOf(snippet, i + 1) >= 0) throw new Error(`写真の特定に失敗: ${key}`);
  const tagStart = html.lastIndexOf('<img', i);
  html = html.slice(0, tagStart + 4) + ` data-photo="${key}"` + html.slice(tagStart + 4);
}

writeFileSync(FILE, html);
console.log('目印を入れました');
```

- [ ] **Step 4: 実行して結果を確認する**

```bash
node tools/add-markers.mjs
git diff --stat index.html
python tools/check_site.py
npm test
```

Expected: `目印を入れました`、差分は index.html のみ、検査 `OK`、テスト PASS。`git diff index.html` を目視し、コメントと `data-photo` 以外が変わっていないこと。

- [ ] **Step 5: お知らせ帯のスタイルを足す**

`styles.css` の末尾(`@media print` の前でも後ろでもよいが、`.intro` ブロックより後)に追加:

```css
/* お知らせ帯(管理画面から編集。空のときは要素自体がない) */
.announce {
  background: var(--color-amber-dark);
  color: var(--color-white);
  text-align: center;
  padding: 10px var(--gutter, 16px);
  font-size: .9rem;
  line-height: 1.7;
}
.announce p { margin: 0; }
```

- [ ] **Step 6: 帯が実際に見えることを目視で確認する**

一時的に `<!--edit:notice--><div class="announce" role="status"><p>臨時休業のお知らせ(確認用)</p></div><!--/edit:notice-->` に書き換えてローカルで表示し(`python -m http.server 8000` → claude-in-chrome で `http://localhost:8000/`)、固定ヘッダーと重ならず読めることを確認する。重なる場合は `.announce` に `padding-top` を足す。確認後、`<!--edit:notice--><!--/edit:notice-->` に戻す(`git diff index.html` でコメントが空であること)。

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css tools/add-markers.mjs admin/tests/markers.test.js
git commit -m "index.html に編集範囲の目印とお知らせ帯を追加"
```

---

### Task 6: 文章・リスト・FAQ・料金の parse / render

**Files:**
- Create: `admin/js/blocks.js`, `admin/js/list.js`, `admin/js/faq.js`
- Modify: `admin/js/price.js`(`parseGroup` `renderGroup` `parseCard` `renderCard` を追加)
- Test: `admin/tests/models.test.js`

**Interfaces:**
- Consumes: Task 4 の `toInline`/`fromInline`、`formatYen`。
- Produces:
  - `blocks.js`: `parseBlocks(html): {kind:'p'|'h', text}[]`, `renderBlocks(blocks, {indent?, closeIndent?, pClass?}): string`, `blocksToText(blocks): string`, `textToBlocks(text): blocks`
  - `list.js`: `parseList(html): string[]`, `renderList(items, {indent?, closeIndent?}): string`, `listToText(items): string`, `textToList(text): string[]`
  - `faq.js`: `parseFaq(html): {q,a}[]`, `renderFaq(items, {indent?, closeIndent?}): string`
  - `price.js`: `parseGroup(html): {title, intro: string[], rows: {name,yen}[], notes: string[]}`, `renderGroup(group, {indent?, closeIndent?}): string`, `parseCard(html): {badge,title,time,regular,price}`, `renderCard(card, {indent?, closeIndent?}): string`

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/models.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, renderBlocks, blocksToText, textToBlocks } from '../js/blocks.js';
import { parseList, renderList, listToText, textToList } from '../js/list.js';
import { parseFaq, renderFaq } from '../js/faq.js';
import { parseGroup, renderGroup, parseCard, renderCard } from '../js/price.js';

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();

test('blocks: parse / render round trip', () => {
  const html = '\n  <p>はじめまして。<br>田代です。</p>\n  <h3>理由</h3>\n  <p>仕事に、家事に。</p>\n';
  const blocks = parseBlocks(html);
  assert.deepEqual(blocks, [
    { kind: 'p', text: 'はじめまして。\n田代です。' },
    { kind: 'h', text: '理由' },
    { kind: 'p', text: '仕事に、家事に。' },
  ]);
  assert.equal(norm(renderBlocks(blocks, { indent: '  ', closeIndent: '' })), norm(html));
});
test('blocks: text form uses blank lines and "## " headings', () => {
  const blocks = textToBlocks('一行目\n二行目\n\n## 見出し\n\n本文');
  assert.deepEqual(blocks, [
    { kind: 'p', text: '一行目\n二行目' },
    { kind: 'h', text: '見出し' },
    { kind: 'p', text: '本文' },
  ]);
  assert.equal(blocksToText(blocks), '一行目\n二行目\n\n## 見出し\n\n本文');
});
test('blocks: pClass is applied and markup is escaped', () => {
  const out = renderBlocks([{ kind: 'p', text: '<b>&' }], { pClass: 'lead lead--serif' });
  assert.match(out, /<p class="lead lead--serif">&lt;b&gt;&amp;<\/p>/);
});
test('blocks: empty input renders nothing', () => {
  assert.equal(renderBlocks([]), '');
  assert.deepEqual(textToBlocks('  \n\n  '), []);
});

test('list: round trip with <br> inside items', () => {
  const html = '<li>一つ目<br>続き</li><li>二つ目</li>';
  const items = parseList(html);
  assert.deepEqual(items, ['一つ目\n続き', '二つ目']);
  assert.equal(norm(renderList(items, { indent: '', closeIndent: '' })), html);
  assert.deepEqual(textToList(listToText(items)), items);
});

test('faq: round trip', () => {
  const html = '<details><summary>予約は必要ですか?</summary><p>完全予約制です。</p></details><details><summary>Q2</summary><p>A2</p></details>';
  const items = parseFaq(html);
  assert.deepEqual(items, [{ q: '予約は必要ですか?', a: '完全予約制です。' }, { q: 'Q2', a: 'A2' }]);
  assert.equal(norm(renderFaq(items, { indent: '', closeIndent: '' })), html);
});

const GROUP = `<h3>ペア蒸し</h3>
          <p class="fine">2名様分の料金です。</p>
          <ul class="price-list">
            <li><span class="name">よもぎ蒸し</span><span class="yen">¥6,000</span></li>
            <li><span class="name">まこも蒸し</span><span class="yen">¥12,000</span></li>
          </ul>
          <p class="fine">※注記</p>`;
test('price group: parse', () => {
  assert.deepEqual(parseGroup(GROUP), {
    title: 'ペア蒸し',
    intro: ['2名様分の料金です。'],
    rows: [{ name: 'よもぎ蒸し', yen: '¥6,000' }, { name: 'まこも蒸し', yen: '¥12,000' }],
    notes: ['※注記'],
  });
});
test('price group: render round trip', () => {
  assert.equal(norm(renderGroup(parseGroup(GROUP), { indent: '', closeIndent: '' })), norm(GROUP));
});
test('price group: yen are normalized on render, bad ones are kept verbatim for validation', () => {
  const out = renderGroup({ title: 't', intro: [], notes: [], rows: [{ name: 'a', yen: '10000' }, { name: 'b', yen: '1万' }] });
  assert.match(out, /<span class="yen">¥10,000<\/span>/);
  assert.match(out, /<span class="yen">1万<\/span>/);
});

const CARD = `<span class="badge">初回限定</span>
          <h3>アロマ × まこも蒸し</h3>
          <p>100分</p>
          <p class="price"><s>通常 ¥12,000</s>¥10,000</p>`;
test('price card: parse / render', () => {
  const c = parseCard(CARD);
  assert.deepEqual(c, { badge: '初回限定', title: 'アロマ × まこも蒸し', time: '100分', regular: '¥12,000', price: '¥10,000' });
  assert.equal(norm(renderCard(c, { indent: '', closeIndent: '' })), norm(CARD));
});
test('price card: no regular price drops the <s>', () => {
  const out = renderCard({ badge: '', title: 't', time: '60分', regular: '', price: '9000' });
  assert.ok(!out.includes('<s>') && !out.includes('badge'));
  assert.match(out, /<p class="price">¥9,000<\/p>/);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL(モジュールが無い / `parseGroup` が未定義)。

- [ ] **Step 3: 実装する**

`admin/js/blocks.js`:

```js
import { toInline, fromInline } from './text.js';

export function parseBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(p|h3)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    out.push({ kind: m[1] === 'h3' ? 'h' : 'p', text: fromInline(m[2]) });
  }
  return out;
}

export function renderBlocks(blocks, { indent = '          ', closeIndent = indent, pClass = '' } = {}) {
  if (!blocks.length) return '';
  const open = pClass ? `<p class="${pClass}">` : '<p>';
  const lines = blocks.map((b) => (b.kind === 'h' ? `<h3>${toInline(b.text)}</h3>` : `${open}${toInline(b.text)}</p>`));
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}

export function blocksToText(blocks) {
  return blocks.map((b) => (b.kind === 'h' ? `## ${b.text}` : b.text)).join('\n\n');
}

export function textToBlocks(text) {
  return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.startsWith('## ') ? { kind: 'h', text: s.slice(3).trim() } : { kind: 'p', text: s }));
}
```

`admin/js/list.js`:

```js
import { toInline, fromInline } from './text.js';

export function parseList(html) {
  return [...String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => fromInline(m[1]));
}
export function renderList(items, { indent = '          ', closeIndent = indent } = {}) {
  if (!items.length) return '';
  return `\n${indent}${items.map((t) => `<li>${toInline(t)}</li>`).join(`\n${indent}`)}\n${closeIndent}`;
}
export function listToText(items) {
  return items.join('\n\n');
}
export function textToList(text) {
  return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}
```

`admin/js/faq.js`:

```js
import { toInline, fromInline } from './text.js';

export function parseFaq(html) {
  return [...String(html).matchAll(/<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
    .map((m) => ({ q: fromInline(m[1]), a: fromInline(m[2]) }));
}
export function renderFaq(items, { indent = '        ', closeIndent = '      ' } = {}) {
  const valid = items.filter((i) => i.q.trim() || i.a.trim());
  if (!valid.length) return '';
  const lines = valid.map((i) => `<details><summary>${toInline(i.q)}</summary><p>${toInline(i.a)}</p></details>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}
```

`admin/js/price.js` に追記(先頭に import を足す):

```js
import { toInline, fromInline } from './text.js';

// (既存の formatYen はそのまま)

export function parseGroup(html) {
  const h = String(html);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(h);
  const ulStart = h.indexOf('<ul');
  const ulEnd = h.indexOf('</ul>');
  if (ulStart < 0 || ulEnd < 0) throw new Error('料金表の形が想定と違います');
  const fines = (s) => [...s.matchAll(/<p class="fine">([\s\S]*?)<\/p>/g)].map((m) => fromInline(m[1]));
  const rows = [...h.slice(ulStart, ulEnd).matchAll(/<span class="name">([\s\S]*?)<\/span><span class="yen">([\s\S]*?)<\/span>/g)]
    .map((m) => ({ name: fromInline(m[1]).replace(/\s+/g, ' ').trim(), yen: fromInline(m[2]).trim() }));
  return {
    title: title ? fromInline(title[1]) : '',
    intro: fines(h.slice(0, ulStart)),
    rows,
    notes: fines(h.slice(ulEnd + 5)),
  };
}

export function renderGroup(g, { indent = '          ', closeIndent = indent } = {}) {
  const lines = [];
  if (g.title.trim()) lines.push(`<h3>${toInline(g.title)}</h3>`);
  for (const t of g.intro.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  lines.push('<ul class="price-list">');
  for (const r of g.rows) {
    const yen = formatYen(r.yen) ?? r.yen.trim(); // 読めない値はそのまま残し、公開前検査で止める
    lines.push(`  <li><span class="name">${toInline(r.name)}</span><span class="yen">${toInline(yen)}</span></li>`);
  }
  lines.push('</ul>');
  for (const t of g.notes.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}

export function parseCard(html) {
  const h = String(html);
  const badge = /<span class="badge">([\s\S]*?)<\/span>/.exec(h);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(h);
  const time = /<p>([\s\S]*?)<\/p>/.exec(h);
  const price = /<p class="price">(?:<s>通常\s*([^<]*)<\/s>)?([^<]*)<\/p>/.exec(h);
  return {
    badge: badge ? fromInline(badge[1]) : '',
    title: title ? fromInline(title[1]) : '',
    time: time ? fromInline(time[1]) : '',
    regular: price && price[1] ? price[1].trim() : '',
    price: price ? price[2].trim() : '',
  };
}

export function renderCard(c, { indent = '          ', closeIndent = '        ' } = {}) {
  const lines = [];
  if (c.badge.trim()) lines.push(`<span class="badge">${toInline(c.badge)}</span>`);
  lines.push(`<h3>${toInline(c.title)}</h3>`);
  if (c.time.trim()) lines.push(`<p>${toInline(c.time)}</p>`);
  const price = formatYen(c.price) ?? c.price.trim();
  const regular = c.regular.trim() ? (formatYen(c.regular) ?? c.regular.trim()) : '';
  lines.push(`<p class="price">${regular ? `<s>通常 ${toInline(regular)}</s>` : ''}${toInline(price)}</p>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}
```

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: すべて PASS。

- [ ] **Step 5: Commit**

```bash
git add admin/js/blocks.js admin/js/list.js admin/js/faq.js admin/js/price.js admin/tests/models.test.js
git commit -m "管理画面: 文章・リスト・FAQ・料金の parse / render"
```

---

### Task 7: サイト全体のモデル(読み出し・書き戻し・変更要約)と公開前検査

**Files:**
- Create: `admin/js/site-model.js`, `admin/js/validate.js`
- Test: `admin/tests/site-model.test.js`, `admin/tests/validate.test.js`

**Interfaces:**
- Consumes: Task 4〜6 の全モジュール、`tools/rules.json`。
- Produces:
  - `site-model.js`:
    - `GROUPS: {rose,body,course,pair}→表示名`, `PHOTOS: key→表示名`
    - `readModels(html): Models` — `{notice:string, about:Block[], worriesList:string[], worriesLead:Block[], kodawari:string[], faq:{q,a}[], card:Card, groups:{rose,body,course,pair: Group}, photos:{[key]:{src,alt,width,height,previewSrc?}}}`
    - `applyModels(html, models, {preview?:boolean}): string`
    - `summarizeChanges(before: Models, after: Models): string[]`(日本語ラベルの配列。変更なしなら `[]`)
  - `validate.js`: `validateDocument(html, rules): string[]`(日本語メッセージ。問題なしなら `[]`)

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/site-model.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readModels, applyModels, summarizeChanges } from '../js/site-model.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();

test('read → apply is lossless on the real index.html (modulo whitespace between tags)', () => {
  const m = readModels(html);
  assert.equal(norm(applyModels(html, m)), norm(html));
});

test('real page is parsed into the expected shape', () => {
  const m = readModels(html);
  assert.equal(m.notice, '');
  assert.ok(m.about.length > 10);
  assert.equal(m.card.price, '¥10,000');
  assert.equal(m.groups.pair.rows.length, 4);
  assert.equal(m.groups.rose.rows.length, 4);
  assert.equal(m.faq.length, 7);
  assert.equal(m.photos['hero-l'].src, 'images/salon-clock.jpg');
});

test('editing a price changes only that row and nothing outside the regions', () => {
  const m = readModels(html);
  m.groups.pair.rows[0].yen = '6500';
  const out = applyModels(html, m);
  assert.match(out, /<span class="name">よもぎ蒸し<\/span><span class="yen">¥6,500<\/span>/);
  // 領域の外は 1 文字も変わらない(JSON-LD・GA4・フッター)
  const outside = (s) => s.replace(/<!--edit:[\s\S]*?<!--\/edit:[^>]*-->/g, '');
  assert.equal(outside(out), outside(html));
});

test('notice: text becomes an announce band, empty removes it', () => {
  const m = readModels(html);
  m.notice = '10/20は臨時休業です\n<script>x</script>';
  const out = applyModels(html, m);
  assert.match(out, /<div class="announce" role="status"><p>10\/20は臨時休業です<br>&lt;script&gt;x&lt;\/script&gt;<\/p><\/div>/);
  assert.equal(readModels(out).notice, '10/20は臨時休業です\n<script>x</script>');
  m.notice = '   ';
  assert.equal(norm(applyModels(out, m)), norm(html));
});

test('photo: preview uses previewSrc, publish uses src', () => {
  const m = readModels(html);
  m.photos.about = { ...m.photos.about, src: 'images/new.jpg', previewSrc: 'data:image/jpeg;base64,AAAA', alt: '新しい説明' };
  assert.match(applyModels(html, m), /src="images\/new.jpg"[^>]*alt="新しい説明"|alt="新しい説明"[^>]*src="images\/new.jpg"/);
  assert.match(applyModels(html, m, { preview: true }), /data:image\/jpeg;base64,AAAA/);
});

test('summarizeChanges names what changed', () => {
  const a = readModels(html);
  const b = structuredClone(a);
  assert.deepEqual(summarizeChanges(a, b), []);
  b.groups.rose.rows[0].yen = '¥5,900';
  b.faq.pop();
  b.photos.access.alt = 'x';
  const s = summarizeChanges(a, b);
  assert.ok(s.some((x) => x.includes('ローズフェイシャル')));
  assert.ok(s.some((x) => x.includes('よくある質問')));
  assert.ok(s.some((x) => x.includes('写真')));
});
```

`admin/tests/validate.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDocument } from '../js/validate.js';
import { readModels, applyModels } from '../js/site-model.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const rules = JSON.parse(readFileSync(new URL('../../tools/rules.json', import.meta.url), 'utf8'));

test('the real page passes', () => {
  assert.deepEqual(validateDocument(html, rules), []);
});

test('a price in a bad format is rejected with the row name', () => {
  const m = readModels(html);
  m.groups.pair.rows[0].yen = '1万';
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('料金の形式が正しくありません') && e.includes('よもぎ蒸し')), errs.join('\n'));
});

test('empty price is rejected', () => {
  const m = readModels(html);
  m.groups.body.rows[0].yen = '';
  assert.ok(validateDocument(applyModels(html, m), rules).length > 0);
});

test('forbidden words are named', () => {
  const m = readModels(html);
  m.about[0].text = 'これで疲れが改善します';
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('改善')), errs.join('\n'));
});

test('a phone-number-like string is rejected', () => {
  const m = readModels(html);
  m.notice = 'お問い合わせは 079-123-4567 まで';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('電話番号')));
});

test('removing a required phrase is reported', () => {
  const m = readModels(html);
  m.about = m.about.filter((b) => !b.text.includes('12年目')); // 「12年目」は自己紹介にしかない
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('12年目')), errs.join('\n'));
});

test('a photo without alt text is rejected', () => {
  const m = readModels(html);
  m.photos.about.alt = '';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('説明文')));
});

test('a price card with no price is rejected', () => {
  const m = readModels(html);
  m.card.price = 'abc';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('料金の形式')));
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL(モジュールが無い)。

- [ ] **Step 3: `site-model.js` を実装する**

```js
import { getRegion, setRegion, getPhoto, setPhoto } from './regions.js';
import { parseBlocks, renderBlocks } from './blocks.js';
import { parseList, renderList } from './list.js';
import { parseFaq, renderFaq } from './faq.js';
import { parseCard, renderCard, parseGroup, renderGroup } from './price.js';
import { toInline, fromInline } from './text.js';

export const GROUPS = {
  rose: 'ローズフェイシャル',
  body: 'アロマボディトリートメント',
  course: 'コース',
  pair: 'ペア蒸し',
};
export const PHOTOS = {
  'hero-l': 'トップ(左)',
  'hero-r': 'トップ(右)',
  about: '自己紹介',
  'kodawari-1': 'こだわり(1枚目)',
  'kodawari-2': 'こだわり(2枚目)',
  'menu-rose': 'メニュー(ローズ)',
  'menu-body': 'メニュー(ボディ)',
  'menu-pair': 'メニュー(ペア蒸し)',
  access: 'アクセス',
};

function parseNotice(html) {
  const m = /<p>([\s\S]*?)<\/p>/.exec(html);
  return m ? fromInline(m[1]) : '';
}
function renderNotice(text) {
  return text.trim() ? `<div class="announce" role="status"><p>${toInline(text.trim())}</p></div>` : '';
}

export function readModels(html) {
  const groups = {};
  for (const k of Object.keys(GROUPS)) groups[k] = parseGroup(getRegion(html, `menu-${k}`));
  const photos = {};
  for (const k of Object.keys(PHOTOS)) photos[k] = getPhoto(html, k);
  return {
    notice: parseNotice(getRegion(html, 'notice')),
    about: parseBlocks(getRegion(html, 'about')),
    worriesList: parseList(getRegion(html, 'worries-list')),
    worriesLead: parseBlocks(getRegion(html, 'worries-lead')),
    kodawari: parseList(getRegion(html, 'kodawari-points')),
    faq: parseFaq(getRegion(html, 'faq')),
    card: parseCard(getRegion(html, 'price-card')),
    groups,
    photos,
  };
}

export function applyModels(html, m, { preview = false } = {}) {
  let out = html;
  out = setRegion(out, 'notice', renderNotice(m.notice));
  out = setRegion(out, 'about', renderBlocks(m.about, { indent: '          ' }));
  out = setRegion(out, 'worries-list', renderList(m.worriesList, { indent: '          ' }));
  out = setRegion(out, 'worries-lead', renderBlocks(m.worriesLead, { indent: '        ', pClass: 'lead lead--serif' }));
  out = setRegion(out, 'kodawari-points', renderList(m.kodawari, { indent: '            ', closeIndent: '          ' }));
  out = setRegion(out, 'faq', renderFaq(m.faq, { indent: '        ', closeIndent: '      ' }));
  out = setRegion(out, 'price-card', renderCard(m.card, { indent: '          ', closeIndent: '        ' }));
  for (const k of Object.keys(GROUPS)) {
    out = setRegion(out, `menu-${k}`, renderGroup(m.groups[k], { indent: '          ', closeIndent: '          ' }));
  }
  for (const k of Object.keys(PHOTOS)) {
    const p = m.photos[k];
    out = setPhoto(out, k, { ...p, src: preview && p.previewSrc ? p.previewSrc : p.src });
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function summarizeChanges(before, after) {
  const out = [];
  if (!same(before.notice, after.notice)) out.push('お知らせ');
  if (!same(before.about, after.about)) out.push('自己紹介の文章');
  if (!same(before.worriesList, after.worriesList)) out.push('「こんな不調」のチェックリスト');
  if (!same(before.worriesLead, after.worriesLead)) out.push('「こんな不調」の説明文');
  if (!same(before.kodawari, after.kodawari)) out.push('サロンのこだわり');
  if (!same(before.faq, after.faq)) out.push('よくある質問');
  if (!same(before.card, after.card)) out.push('初回限定メニュー');
  for (const [k, label] of Object.entries(GROUPS)) {
    if (!same(before.groups[k], after.groups[k])) out.push(`料金: ${label}`);
  }
  for (const [k, label] of Object.entries(PHOTOS)) {
    const a = before.photos[k], b = after.photos[k];
    if (a.src !== b.src || a.alt !== b.alt) out.push(`写真: ${label}`);
  }
  return out;
}
```

- [ ] **Step 4: `validate.js` を実装する**

```js
import { unescapeHtml } from './text.js';

const YEN_RE = /^¥\d{1,3}(,\d{3})*$/;
const squash = (s) => s.replace(/\s+/g, '');

function visibleText(html) {
  return unescapeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' '),
  );
}

export function validateDocument(html, rules) {
  const errs = [];
  const text = squash(visibleText(html));

  for (const s of rules.mustContain) {
    if (!text.includes(squash(s))) errs.push(`本文に必要な文言がありません: 「${s}」`);
  }
  for (const url of rules.mustLink) {
    if (!html.includes(url)) errs.push(`必要なリンクがありません: ${url}`);
  }
  for (const s of rules.mustNotContain) {
    if (html.includes(s)) errs.push(`載せられない語が含まれています: 「${s}」`);
  }
  for (const f of rules.forbiddenRe) {
    const m = new RegExp(f.pattern).exec(html);
    if (m) errs.push(`${f.label}が含まれています: 「${m[0]}」(効能・口コミ・電話番号は載せない方針です)`);
  }
  for (const id of rules.sectionIds) {
    if (!html.includes(`id="${id}"`)) errs.push(`セクションがありません: #${id}`);
  }

  const rows = [...html.matchAll(/<span class="name">([\s\S]*?)<\/span><span class="yen">([\s\S]*?)<\/span>/g)];
  if (!rows.length) errs.push('料金表の行がありません');
  for (const m of rows) {
    const name = unescapeHtml(m[1]).replace(/\s+/g, ' ').trim();
    const yen = unescapeHtml(m[2]).trim();
    if (!name) errs.push('名前が空の料金行があります');
    if (!YEN_RE.test(yen)) errs.push(`料金の形式が正しくありません: 「${name}」→「${yen}」(例: ¥10,000)`);
  }
  const price = /<p class="price">(?:<s>通常\s*([^<]*)<\/s>)?([^<]*)<\/p>/.exec(html);
  if (price) {
    if (!YEN_RE.test(unescapeHtml(price[2]).trim())) errs.push(`料金の形式が正しくありません: 初回限定メニュー →「${price[2].trim()}」(例: ¥10,000)`);
    if (price[1] && !YEN_RE.test(unescapeHtml(price[1]).trim())) errs.push(`料金の形式が正しくありません: 初回限定メニューの通常価格 →「${price[1].trim()}」`);
  }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = /\salt="([^"]*)"/.exec(m[0]);
    if (!alt || !alt[1].trim()) {
      const src = /\ssrc="([^"]*)"/.exec(m[0]);
      errs.push(`写真に説明文(代替テキスト)がありません: ${src ? src[1] : ''}`);
    }
  }
  if ((html.match(/<h1\b/g) || []).length !== 1) errs.push('h1 が 1 つではありません');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const d of new Set(ids.filter((i) => ids.filter((x) => x === i).length > 1))) errs.push(`id が重複しています: ${d}`);
  return errs;
}
```

- [ ] **Step 5: 通ることを確認**

Run: `npm test`
Expected: すべて PASS。`read → apply is lossless` が落ちる場合は、`git diff` 相当で差分を出して原因の領域を特定し、その領域の parse/render(Task 6)を直す(テストは変えない)。

- [ ] **Step 6: Commit**

```bash
git add admin/js/site-model.js admin/js/validate.js admin/tests/site-model.test.js admin/tests/validate.test.js
git commit -m "管理画面: サイト全体のモデルと公開前検査"
```

---

### Task 8: トークン暗号化と GitHub への 1 コミット公開

**Files:**
- Create: `admin/js/crypto.js`, `admin/js/github.js`, `tools/make-config.mjs`
- Test: `admin/tests/crypto.test.js`, `admin/tests/github.test.js`

**Interfaces:**
- Consumes: `b64.js`。
- Produces:
  - `crypto.js`: `encryptToken(token, pass, iter?=600000): Promise<Box>`、`decryptToken(box, pass): Promise<string>`(失敗は `Error('パスワードが違います')`)。`Box = {v:1, iter, salt, iv, ct}`(Base64 文字列)
  - `github.js`: `class PublishError extends Error { code: 'AUTH'|'CONFLICT'|'NETWORK'|'OTHER' }`、`new SiteRepo({owner, repo, branch?='main', token, fetchImpl?})`、`repo.load(path?='index.html'): Promise<{headSha, treeSha, html}>`、`repo.commit({headSha, treeSha, files: {path:string, content: string|Uint8Array}[], message}): Promise<{headSha}>`

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/crypto.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken } from '../js/crypto.js';

test('round trip', async () => {
  const box = await encryptToken('github_pat_abc', 'correct horse', 1000);
  assert.equal(await decryptToken(box, 'correct horse'), 'github_pat_abc');
});
test('wrong password gives a Japanese error, not a crash', async () => {
  const box = await encryptToken('t', 'right', 1000);
  await assert.rejects(() => decryptToken(box, 'wrong'), /パスワードが違います/);
});
test('each encryption uses a fresh salt and iv', async () => {
  const a = await encryptToken('t', 'p', 1000);
  const b = await encryptToken('t', 'p', 1000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});
test('the box does not contain the token', async () => {
  const box = await encryptToken('github_pat_SECRET', 'p', 1000);
  assert.ok(!JSON.stringify(box).includes('SECRET'));
});
```

`admin/tests/github.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SiteRepo, PublishError } from '../js/github.js';
import { toBase64, fromBase64 } from '../js/b64.js';

function fakeGithub(opts = {}) {
  const st = { head: 'c1', commits: { c1: { tree: 't1', parent: null } }, blobs: {}, trees: {}, n: 1, files: { 'index.html': '<html>旧</html>' }, calls: [] };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const f = async (url, init = {}) => {
    const method = init.method || 'GET';
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : null;
    st.calls.push(`${method} ${path}`);
    if (opts.status) return json(opts.status, { message: 'x' });
    if (method === 'GET' && path === '/git/ref/heads/main') return json(200, { object: { sha: st.head } });
    let m;
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(.+)$/))) return json(200, { tree: { sha: st.commits[m[1]].tree } });
    if (method === 'GET' && path.startsWith('/contents/')) {
      const name = decodeURIComponent(path.slice('/contents/'.length));
      return json(200, { content: toBase64(new TextEncoder().encode(st.files[name])), encoding: 'base64' });
    }
    if (method === 'POST' && path === '/git/blobs') { const id = `b${++st.n}`; st.blobs[id] = body.content; return json(201, { sha: id }); }
    if (method === 'POST' && path === '/git/trees') { const id = `t${++st.n}`; st.trees[id] = body; return json(201, { sha: id }); }
    if (method === 'POST' && path === '/git/commits') { const id = `c${++st.n}`; st.commits[id] = { tree: body.tree, parent: body.parents[0], message: body.message }; return json(201, { sha: id }); }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (body.force !== false) throw new Error('force must be false');
      if (st.commits[body.sha].parent !== st.head) return json(422, { message: 'Update is not a fast forward' });
      st.head = body.sha; return json(200, {});
    }
    return json(404, { message: 'not found ' + path });
  };
  return { st, f };
}

test('load returns head, tree and decoded html', async () => {
  const { f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  assert.deepEqual({ headSha: s.headSha, treeSha: s.treeSha, html: s.html }, { headSha: 'c1', treeSha: 't1', html: '<html>旧</html>' });
});

test('commit puts html and image into one commit', async () => {
  const { st, f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  const out = await repo.commit({
    ...s,
    files: [{ path: 'index.html', content: '<html>新</html>' }, { path: 'images/a.jpg', content: new Uint8Array([1, 2, 3]) }],
    message: '管理画面から更新',
  });
  assert.equal(st.head, out.headSha);
  const tree = Object.values(st.trees)[0];
  assert.equal(tree.base_tree, 't1');
  assert.deepEqual(tree.tree.map((t) => t.path).sort(), ['images/a.jpg', 'index.html']);
  assert.equal(st.commits[st.head].message, '管理画面から更新');
  assert.equal(st.calls.filter((c) => c === 'POST /git/commits').length, 1);
});

test('a concurrent change is reported as CONFLICT and nothing is overwritten', async () => {
  const { st, f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  st.commits.cX = { tree: 'tX', parent: 'c1' }; st.head = 'cX'; // 田代さんが push した
  await assert.rejects(
    () => repo.commit({ ...s, files: [{ path: 'index.html', content: 'x' }], message: 'm' }),
    (e) => e instanceof PublishError && e.code === 'CONFLICT' && /読み込み直して/.test(e.message),
  );
  assert.equal(st.head, 'cX');
});

test('401 is AUTH with a message about the expired token', async () => {
  const { f } = fakeGithub({ status: 401 });
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  await assert.rejects(() => repo.load(), (e) => e.code === 'AUTH' && /期限/.test(e.message));
});

test('a network failure is NETWORK', async () => {
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => repo.load(), (e) => e.code === 'NETWORK' && /通信/.test(e.message));
});

test('the token is only sent as a bearer header', async () => {
  const { f } = fakeGithub();
  let seen;
  const spy = async (url, init) => { seen = { url, init }; return f(url, init); };
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 'SECRET', fetchImpl: spy });
  await repo.load();
  assert.ok(!seen.url.includes('SECRET'));
  assert.equal(seen.init.headers.Authorization, 'Bearer SECRET');
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL(モジュールが無い)。

- [ ] **Step 3: `crypto.js` を実装する**

```js
import { toBase64, fromBase64 } from './b64.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptToken(token, pass, iter = 600000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token)));
  return { v: 1, iter, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptToken(box, pass) {
  try {
    const key = await deriveKey(pass, fromBase64(box.salt), box.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(box.iv) }, key, fromBase64(box.ct));
    return dec.decode(pt);
  } catch {
    throw new Error('パスワードが違います');
  }
}
```

- [ ] **Step 4: `github.js` を実装する**

```js
import { toBase64, fromBase64 } from './b64.js';

export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class SiteRepo {
  constructor({ owner, repo, branch = 'main', token, fetchImpl }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.f = fetchImpl || ((...a) => fetch(...a));
  }

  async #api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await this.f(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new PublishError('NETWORK', '通信できませんでした。電波の良い場所で、もう一度お試しください。何も変更されていません。');
    }
    if (res.status === 401 || res.status === 403) {
      throw new PublishError('AUTH', '管理画面の鍵の有効期限が切れています。田代さんに連絡してください。');
    }
    if (!res.ok) {
      const conflict = method === 'PATCH' && (res.status === 422 || res.status === 409);
      if (conflict) {
        throw new PublishError('CONFLICT', 'ほかの変更が先に入っていました。ページを読み込み直して、もう一度編集してください(何も上書きしていません)。');
      }
      throw new PublishError('OTHER', `うまくいきませんでした(${res.status})。しばらくしてからもう一度お試しください。`);
    }
    return res.json();
  }

  async load(path = 'index.html') {
    const ref = await this.#api(`/git/ref/heads/${this.branch}`);
    const headSha = ref.object.sha;
    const commit = await this.#api(`/git/commits/${headSha}`);
    const file = await this.#api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${headSha}`);
    return { headSha, treeSha: commit.tree.sha, html: new TextDecoder().decode(fromBase64(file.content)) };
  }

  async commit({ headSha, treeSha, files, message }) {
    const entries = [];
    for (const f of files) {
      const bytes = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
      const blob = await this.#api('/git/blobs', { method: 'POST', body: { content: toBase64(bytes), encoding: 'base64' } });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.#api('/git/trees', { method: 'POST', body: { base_tree: treeSha, tree: entries } });
    const commit = await this.#api('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [headSha] } });
    await this.#api(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    return { headSha: commit.sha };
  }
}
```

- [ ] **Step 5: 設定ファイル生成ツールを書く**

`tools/make-config.mjs`:

```js
// 使い方(田代さん用。トークンとパスワードは環境変数で渡し、履歴に残さない):
//   $env:KOHAKU_TOKEN="github_pat_..."; $env:KOHAKU_PASS="長いパスフレーズ"; node tools/make-config.mjs
import { writeFileSync } from 'node:fs';
import { encryptToken } from '../admin/js/crypto.js';

const token = process.env.KOHAKU_TOKEN;
const pass = process.env.KOHAKU_PASS;
if (!token || !pass) { console.error('KOHAKU_TOKEN と KOHAKU_PASS を環境変数で指定してください'); process.exit(1); }
if (pass.length < 16) { console.error('パスフレーズは 16 文字以上にしてください'); process.exit(1); }

const box = await encryptToken(token, pass);
const config = { owner: 'tassy5865-lang', repo: 'kohaku-site', branch: 'main', box };
writeFileSync(new URL('../admin/config.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log('admin/config.json を作成しました');
```

- [ ] **Step 6: 通ることを確認**

Run: `npm test`
Expected: すべて PASS。

- [ ] **Step 7: Commit**

```bash
git add admin/js/crypto.js admin/js/github.js tools/make-config.mjs admin/tests/crypto.test.js admin/tests/github.test.js
git commit -m "管理画面: トークンの暗号化と GitHub への 1 コミット公開"
```

---

### Task 9: 画面(ログイン・4 タブ・プレビュー・公開)

**Files:**
- Create: `admin/index.html`, `admin/admin.css`, `admin/js/images.js`, `admin/js/preview.js`, `admin/js/app.js`
- Test: `admin/tests/images.test.js`, `admin/tests/preview.test.js`

**Interfaces:**
- Consumes: Task 4〜8 の全モジュール。
- Produces: `fitSize(w,h,max?=1600): {width,height}`、`toJpeg(file, {max?, quality?}): Promise<{bytes: Uint8Array, width, height}>`(ブラウザ専用)、`bytesToDataUrl(bytes): string`、`makePreview(html): string`。

- [ ] **Step 1: 失敗するテストを書く**

`admin/tests/images.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, bytesToDataUrl } from '../js/images.js';

test('fitSize shrinks the long side to max and keeps the ratio', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1200, height: 1600 });
});
test('fitSize never enlarges', () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});
test('bytesToDataUrl', () => {
  assert.equal(bytesToDataUrl(new Uint8Array([1, 2, 3])), 'data:image/jpeg;base64,AQID');
});
```

`admin/tests/preview.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePreview } from '../js/preview.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('preview has no scripts, no intro overlay, and a base href', () => {
  const p = makePreview(html);
  assert.ok(!/<script\b/i.test(p));
  assert.ok(!p.includes('class="intro"'));
  assert.match(p, /<head>\s*<base href="\.\.\/">/);
  assert.ok(p.includes('<h1>'));
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test`
Expected: FAIL。

- [ ] **Step 3: `images.js` と `preview.js` を実装する**

`admin/js/images.js`:

```js
import { toBase64 } from './b64.js';

export function fitSize(w, h, max = 1600) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

export function bytesToDataUrl(bytes) {
  return 'data:image/jpeg;base64,' + toBase64(bytes);
}

const MAX_FILE = 30 * 1024 * 1024;

// ブラウザ専用。写真を縮小して JPEG にする(向きは EXIF に従って補正)。
export async function toJpeg(file, { max = 1600, quality = 0.82 } = {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('写真のファイルを選んでください。');
  if (file.size > MAX_FILE) throw new Error('写真が大きすぎます(30MB まで)。');
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('この写真は読み込めませんでした。JPEG か PNG の写真を選んでください。');
  }
  const { width, height } = fitSize(bmp.width, bmp.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('写真を変換できませんでした。別の写真でお試しください。');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}
```

`admin/js/preview.js`:

```js
// 管理画面のプレビュー用。スクリプト(GA4・オープニング動画)を外し、相対パスが ../ から解決されるようにする。
export function makePreview(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="intro"[\s\S]*?<\/video>\s*<\/div>/, '')
    .replace(/<head>/i, '<head><base href="../">');
}
```

- [ ] **Step 4: `admin/index.html` と `admin/admin.css` を作る**

`admin/index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>琥珀 管理画面</title>
  <link rel="stylesheet" href="admin.css">
</head>
<body>
  <main id="login" class="login">
    <h1>琥珀 管理画面</h1>
    <p>パスワードを入力してください。</p>
    <form id="login-form">
      <label>パスワード<input id="pass" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="btn btn--solid">入る</button>
    </form>
    <p id="login-msg" class="msg" role="alert"></p>
  </main>

  <div id="editor" class="editor" hidden>
    <header class="bar">
      <strong>琥珀 管理画面</strong>
      <span id="status" class="status" role="status"></span>
      <button id="publish" class="btn btn--solid" type="button">公開する</button>
    </header>
    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="text" aria-selected="true">文章</button>
      <button role="tab" data-tab="price" aria-selected="false">料金・メニュー</button>
      <button role="tab" data-tab="photo" aria-selected="false">写真</button>
      <button role="tab" data-tab="notice" aria-selected="false">お知らせ</button>
    </nav>
    <div class="split">
      <section id="panel" class="panel" aria-live="polite"></section>
      <iframe id="preview" class="preview" title="プレビュー" sandbox=""></iframe>
    </div>
  </div>

  <dialog id="confirm" class="dialog">
    <h2>公開の確認</h2>
    <p>次の内容を公開します。</p>
    <ul id="confirm-list"></ul>
    <p id="confirm-errors" class="msg" role="alert"></p>
    <div class="row">
      <button id="confirm-cancel" class="btn" type="button">やめる</button>
      <button id="confirm-ok" class="btn btn--solid" type="button">公開する</button>
    </div>
  </dialog>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

`admin/admin.css`:

```css
:root { --bg:#F7F3ED; --surface:#FFFDFC; --text:#4B443F; --amber:#8E5B32; --line:rgba(184,168,154,.55); --err:#9b2c2c; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#2a2622; --surface:#332e29; --text:#efe8df; --amber:#d9a066; --line:rgba(184,168,154,.35); --err:#f2a0a0; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.7 "Noto Sans JP","Yu Gothic","Hiragino Sans",sans-serif; }
.login { max-width:420px; margin:12vh auto; padding:0 16px; }
label { display:block; font-size:.9rem; margin:12px 0 4px; }
input,textarea { width:100%; font:inherit; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--text); }
textarea { min-height:8em; resize:vertical; }
input[aria-invalid="true"] { border-color:var(--err); }
.btn { font:inherit; padding:10px 16px; border:1px solid var(--amber); border-radius:999px; background:transparent; color:var(--amber); cursor:pointer; }
.btn--solid { background:var(--amber); color:#fff; }
.btn[disabled] { opacity:.5; cursor:default; }
.msg { color:var(--err); min-height:1.5em; }
.bar { display:flex; gap:12px; align-items:center; padding:8px 16px; background:var(--surface); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; }
.status { flex:1; font-size:.9rem; }
.tabs { display:flex; gap:4px; padding:8px 16px 0; overflow-x:auto; }
.tabs button { font:inherit; padding:8px 14px; border:1px solid var(--line); border-bottom:0; border-radius:8px 8px 0 0; background:var(--bg); color:var(--text); cursor:pointer; }
.tabs button[aria-selected="true"] { background:var(--surface); font-weight:700; }
.split { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; padding:16px; }
.panel { background:var(--surface); border:1px solid var(--line); border-radius:0 8px 8px 8px; padding:16px; }
.preview { width:100%; height:70vh; border:1px solid var(--line); border-radius:8px; background:#fff; }
@media (min-width: 1000px) { .split { grid-template-columns: minmax(0,1fr) minmax(0,1fr); } .preview { height: calc(100vh - 140px); position: sticky; top: 100px; } }
.card { border:1px solid var(--line); border-radius:8px; padding:12px; margin:12px 0; }
.row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.row > input { flex:1 1 12em; }
.row > .yen { flex:0 0 8em; }
.small { font-size:.85rem; opacity:.8; }
.thumb { width:120px; height:120px; object-fit:cover; border-radius:8px; border:1px solid var(--line); }
.dialog { border:1px solid var(--line); border-radius:12px; background:var(--surface); color:var(--text); max-width:520px; }
```

- [ ] **Step 5: `app.js` を実装する**

```js
import { decryptToken } from './crypto.js';
import { SiteRepo, PublishError } from './github.js';
import { readModels, applyModels, summarizeChanges, GROUPS, PHOTOS } from './site-model.js';
import { validateDocument } from './validate.js';
import { blocksToText, textToBlocks } from './blocks.js';
import { listToText, textToList } from './list.js';
import { formatYen } from './price.js';
import { toJpeg, bytesToDataUrl } from './images.js';
import { makePreview } from './preview.js';

const $ = (s) => document.querySelector(s);
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

let repo, site, models, original, rules, tab = 'text';
const pending = {}; // photo key → {path, bytes}
const DRAFT_KEY = 'kohaku-admin-draft';
let previewTimer;

const safe = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 下書きが保存できなくても編集は続けられる */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

function status(text) { $('#status').textContent = text; }

function strip(m) { // 下書きには、まだ公開していない写真(previewSrc)を入れない
  const c = structuredClone(m);
  for (const k of Object.keys(c.photos)) { if (pending[k]) c.photos[k] = structuredClone(original.photos[k]); delete c.photos[k].previewSrc; }
  return c;
}

function changed() {
  schedulePreview();
  safe.set(DRAFT_KEY, JSON.stringify({ headSha: site.headSha, models: strip(models) }));
  const n = summarizeChanges(original, models).length;
  status(n ? `未公開の変更が ${n} か所あります` : '変更はありません');
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    try { $('#preview').srcdoc = makePreview(applyModels(site.html, models, { preview: true })); }
    catch (e) { status(e.message); }
  }, 250);
}

// ---------- パネル ----------
function field(label, control, hint) {
  return h('label', {}, label, control, hint ? h('span', { class: 'small' }, hint) : null);
}
function textarea(value, onInput, rows = 10) {
  const t = h('textarea', { rows: String(rows), value });
  t.addEventListener('input', () => onInput(t.value));
  return t;
}
function input(value, onInput, extra = {}) {
  const i = h('input', { type: 'text', value, ...extra });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}
function moveItem(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }

function textPanel() {
  const m = models;
  return h('div', {},
    h('h2', {}, '自己紹介'),
    field('文章', textarea(blocksToText(m.about), (v) => { m.about = textToBlocks(v); changed(); }, 18),
      '段落は空行で区切ります。「## 」で始めた行は見出しになります。'),
    h('h2', {}, '「こんな不調、ありませんか?」'),
    field('チェックリスト', textarea(listToText(m.worriesList), (v) => { m.worriesList = textToList(v); changed(); }, 8), '1項目ごとに空行で区切ります。'),
    field('説明文', textarea(blocksToText(m.worriesLead), (v) => { m.worriesLead = textToBlocks(v).filter((b) => b.kind === 'p'); changed(); }, 10)),
    h('h2', {}, 'サロンのこだわり'),
    field('項目', textarea(listToText(m.kodawari), (v) => { m.kodawari = textToList(v); changed(); }, 12), '1項目ごとに空行で区切ります。'),
    h('h2', {}, 'よくある質問'),
    ...m.faq.map((f, i) => h('div', { class: 'card' },
      field('質問', input(f.q, (v) => { f.q = v; changed(); })),
      field('答え', textarea(f.a, (v) => { f.a = v; changed(); }, 4)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { moveItem(m.faq, i, -1); changed(); render(); } }, '↑'),
        h('button', { class: 'btn', type: 'button', onclick: () => { moveItem(m.faq, i, 1); changed(); render(); } }, '↓'),
        h('button', { class: 'btn', type: 'button', onclick: () => { m.faq.splice(i, 1); changed(); render(); } }, '削除'))),
    ),
    h('button', { class: 'btn', type: 'button', onclick: () => { m.faq.push({ q: '', a: '' }); changed(); render(); } }, '質問を追加'),
  );
}

function yenInput(row) {
  const i = input(row.yen, (v) => { row.yen = v; i.setAttribute('aria-invalid', String(!formatYen(v))); changed(); }, { inputmode: 'numeric', 'aria-label': '金額' });
  i.classList.add('yen');
  i.addEventListener('blur', () => { const f = formatYen(i.value); if (f) { row.yen = f; i.value = f; i.setAttribute('aria-invalid', 'false'); changed(); } });
  i.setAttribute('aria-invalid', String(!formatYen(row.yen)));
  return i;
}

function pricePanel() {
  const m = models;
  const c = m.card;
  return h('div', {},
    h('h2', {}, '初回限定メニュー'),
    h('div', { class: 'card' },
      field('ラベル(空にすると非表示)', input(c.badge, (v) => { c.badge = v; changed(); })),
      field('メニュー名', input(c.title, (v) => { c.title = v; changed(); })),
      field('時間', input(c.time, (v) => { c.time = v; changed(); })),
      h('div', { class: 'row' },
        field('通常価格(空にすると非表示)', input(c.regular, (v) => { c.regular = v; changed(); }, { inputmode: 'numeric' })),
        field('今回の価格', input(c.price, (v) => { c.price = v; changed(); }, { inputmode: 'numeric' })))),
    ...Object.entries(GROUPS).map(([k, label]) => {
      const g = m.groups[k];
      return h('div', { class: 'card' },
        h('h2', {}, label),
        field('見出し', input(g.title, (v) => { g.title = v; changed(); })),
        field('見出しの下の注記(1行に1つ)', textarea(g.intro.join('\n'), (v) => { g.intro = v.split('\n').filter((s) => s.trim()); changed(); }, 2)),
        ...g.rows.map((r, i) => h('div', { class: 'row' },
          input(r.name, (v) => { r.name = v; changed(); }, { 'aria-label': 'メニュー名' }),
          yenInput(r),
          h('button', { class: 'btn', type: 'button', onclick: () => { moveItem(g.rows, i, -1); changed(); render(); } }, '↑'),
          h('button', { class: 'btn', type: 'button', onclick: () => { moveItem(g.rows, i, 1); changed(); render(); } }, '↓'),
          h('button', { class: 'btn', type: 'button', onclick: () => { g.rows.splice(i, 1); changed(); render(); } }, '削除'))),
        h('button', { class: 'btn', type: 'button', onclick: () => { g.rows.push({ name: '', yen: '' }); changed(); render(); } }, '行を追加'),
        field('一覧の下の注記(1行に1つ)', textarea(g.notes.join('\n'), (v) => { g.notes = v.split('\n').filter((s) => s.trim()); changed(); }, 2)));
    }),
  );
}

function photoPanel() {
  return h('div', {},
    h('p', { class: 'small' }, '写真を選ぶと自動で縮小されます。説明文は、目の見えない方や写真が表示されないときに読み上げられます。'),
    ...Object.entries(PHOTOS).map(([k, label]) => {
      const p = models.photos[k];
      const msg = h('p', { class: 'msg', role: 'alert' });
      const file = h('input', { type: 'file', accept: 'image/*' });
      file.addEventListener('change', async () => {
        msg.textContent = '';
        if (!file.files[0]) return;
        try {
          const { bytes, width, height } = await toJpeg(file.files[0]);
          const path = `images/photo-${k}-${Date.now().toString(36)}.jpg`;
          pending[k] = { path, bytes };
          Object.assign(p, { src: path, width, height, previewSrc: bytesToDataUrl(bytes) });
          changed(); render();
        } catch (e) { msg.textContent = e.message; file.value = ''; }
      });
      return h('div', { class: 'card' },
        h('h2', {}, label),
        h('img', { class: 'thumb', src: p.previewSrc || `../${p.src}`, alt: '' }),
        field('写真を差し替える', file),
        field('説明文', input(p.alt, (v) => { p.alt = v; changed(); })),
        msg);
    }),
  );
}

function noticePanel() {
  return h('div', {},
    h('h2', {}, 'お知らせ'),
    h('p', { class: 'small' }, '臨時休業や営業日の変更などを、ページの一番上に帯で表示します。空にすると非表示になります。'),
    field('お知らせの文', textarea(models.notice, (v) => { models.notice = v; changed(); }, 4)));
}

function render() {
  const panel = $('#panel');
  panel.replaceChildren({ text: textPanel, price: pricePanel, photo: photoPanel, notice: noticePanel }[tab]());
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
}

// ---------- 公開 ----------
function buildFinal() {
  const html = applyModels(site.html, models);
  return { html, errors: validateDocument(html, rules) };
}

function openConfirm() {
  let built;
  try { built = buildFinal(); } catch (e) { status(e.message); return; }
  const list = summarizeChanges(original, models);
  const ul = $('#confirm-list');
  ul.replaceChildren(...(list.length ? list : ['(変更はありません)']).map((t) => h('li', {}, t)));
  $('#confirm-errors').replaceChildren(...built.errors.map((e) => h('div', {}, e)));
  $('#confirm-ok').disabled = built.errors.length > 0 || list.length === 0;
  $('#confirm').showModal();
}

async function publish() {
  const ok = $('#confirm-ok');
  ok.disabled = true;
  status('公開しています…');
  try {
    const { html, errors } = buildFinal();
    if (errors.length) throw new Error(errors[0]);
    const files = [{ path: 'index.html', content: html }, ...Object.values(pending).map((p) => ({ path: p.path, content: p.bytes }))];
    const summary = summarizeChanges(original, models).join('、');
    await repo.commit({ headSha: site.headSha, treeSha: site.treeSha, files, message: `管理画面から更新: ${summary}` });
    $('#confirm').close();
    safe.del(DRAFT_KEY);
    for (const k of Object.keys(pending)) delete pending[k];
    await loadSite();
    status('公開しました。反映まで 1〜2 分ほどかかります。');
  } catch (e) {
    $('#confirm-errors').replaceChildren(h('div', {}, e.message));
    status(e instanceof PublishError ? e.message : '公開できませんでした。内容を確認してください。');
    ok.disabled = false;
  }
}

async function loadSite() {
  site = await repo.load();
  original = readModels(site.html);
  models = structuredClone(original);
  const raw = safe.get(DRAFT_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d.headSha === site.headSha) { models = d.models; status('前回の下書きを復元しました'); }
    } catch { /* 壊れた下書きは無視する */ }
  }
  render();
  schedulePreview();
}

async function login(pass) {
  const config = await (await fetch('config.json', { cache: 'no-store' })).json();
  rules = await (await fetch('../tools/rules.json', { cache: 'no-store' })).json();
  const token = await decryptToken(config.box, pass);
  repo = new SiteRepo({ owner: config.owner, repo: config.repo, branch: config.branch, token });
  await loadSite();
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#login-msg');
  msg.textContent = '確認しています…';
  try {
    await login($('#pass').value);
    $('#pass').value = '';
    $('#login').hidden = true;
    $('#editor').hidden = false;
    msg.textContent = '';
  } catch (e) {
    msg.textContent = e.message || 'うまくいきませんでした。';
  }
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
}
$('#publish').addEventListener('click', openConfirm);
$('#confirm-cancel').addEventListener('click', () => $('#confirm').close());
$('#confirm-ok').addEventListener('click', publish);
```

- [ ] **Step 6: 単体テストを通す**

Run: `npm test`
Expected: すべて PASS。

- [ ] **Step 7: Commit**

```bash
git add admin/index.html admin/admin.css admin/js/images.js admin/js/preview.js admin/js/app.js admin/tests/images.test.js admin/tests/preview.test.js
git commit -m "管理画面: ログイン・4タブ・プレビュー・公開の画面"
```

---

### Task 10: 実機での通し確認、鍵の設定、引き渡し

**Files:**
- Create: `admin/config.json`(`tools/make-config.mjs` で生成)
- Modify: `CLAUDE.md`(管理画面の運用を追記)
- Modify(旧リポジトリのメモリ): `project_kohaku_salon.md`

**Interfaces:**
- Consumes: Task 1〜9 のすべて。

- [ ] **Step 1: 田代さんに GitHub のトークン作成を依頼する**

次を案内する(トークンはチャットに貼らせず、手元の環境変数に入れてもらう)。

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. Repository access: **Only select repositories → `kohaku-site`**
3. Permissions: **Contents: Read and write**(他は何も付けない)
4. Expiration: **90 days**。期限日をカレンダーに入れる。

- [ ] **Step 2: 設定ファイルを生成する**

```powershell
$env:KOHAKU_TOKEN = "github_pat_..."   # 作成したトークン
$env:KOHAKU_PASS  = "16文字以上のパスフレーズ"   # 店主さんに渡すパスワード(別経路で渡す)
node tools/make-config.mjs
Remove-Item Env:KOHAKU_TOKEN, Env:KOHAKU_PASS
git add admin/config.json
git commit -m "管理画面の設定(暗号化済みトークン)を追加"
git push
```

Expected: `admin/config.json を作成しました`。`admin/config.json` に `github_pat_` の文字列が**含まれない**こと(`grep -c github_pat admin/config.json` が `0`)。

- [ ] **Step 3: 実機で通しを確認する(PC)**

`https://tassy5865-lang.github.io/kohaku-site/admin/` を claude-in-chrome で開き、順に確認する。

1. 間違ったパスワード → 「パスワードが違います」と出る。
2. 正しいパスワード → 編集画面とプレビューが出る。
3. 「料金・メニュー」でペア蒸しの1行の金額を `6500` に変えて blur → `¥6,500` に整形され、プレビューが更新される。
4. 金額を `1万` にして「公開する」→ 確認ダイアログに「料金の形式が正しくありません」が出て、公開ボタンが押せない。
5. 金額を `¥6,500` に戻し、「お知らせ」に「確認用」と入れる → プレビューに帯が出る。
6. 「公開する」→ 確認 → 公開。`gh api repos/tassy5865-lang/kohaku-site/commits/main` で 1 コミットが増え、`git show --stat` が `index.html` のみであること。
7. 1〜2 分後に公開サイトで料金とお知らせ帯が反映されている。GA4・JSON-LD・動画が変わっていない(`git diff HEAD~1 -- index.html` が領域内のみ)。
8. 後始末: 管理画面でお知らせを空に、金額を元に戻して公開(または `git revert`)。

- [ ] **Step 4: 写真の差し替えを確認する**

「写真」タブで 1 枚(スマホ縦撮りの JPEG)を差し替え、説明文を入力して公開する。公開後の画像が横倒しになっていないこと、`images/photo-…jpg` が 1600px 以内・約 500KB 以下であること(`git ls-tree -l HEAD images/ | grep photo-`)を確認する。HEIC や PDF を選んだときに、日本語のエラーが出て既存の写真が変わらないこともここで確認する。

- [ ] **Step 5: 競合と期限切れを確認する**

1. 管理画面を開いたまま、別の端末(またはローカル)から `index.html` に 1 文字足して push する。管理画面で「公開する」→ 「ほかの変更が先に入っていました…」が出て、push した内容が消えていないこと。
2. 期限切れの確認は、無効なトークンで一時的に `config.json` を作り直す代わりに、テスト(`github.test.js` の 401)で担保済みとする。

- [ ] **Step 6: スマホ実機で確認する**

店主さんのスマホ(または田代さんのスマホ)で同じ URL を開き、ログイン・文字入力・写真の選択・公開ができること、タブが横に切れずに操作できることを確認する。操作しづらい箇所があれば `admin/admin.css` を直す。

- [ ] **Step 7: 運用メモを `CLAUDE.md` に追記して push**

`CLAUDE.md` に次の節を追加する。

```markdown
## 管理画面(admin/)
- URL: `https://tassy5865-lang.github.io/kohaku-site/admin/`。店主がパスワードで入り、文章・料金メニュー・写真・お知らせを編集して公開する
- 編集できる範囲は `index.html` の `<!--edit:KEY-->…<!--/edit:KEY-->` と `data-photo="KEY"`。**この目印を消さない・増やすときは `admin/js/site-model.js` も直す**
- 保存は GitHub Git Data API で 1 コミット。トークンは `admin/config.json` にパスワードで暗号化して入っている(fine-grained PAT、このリポジトリの Contents のみ、有効90日)
- トークンの更新: 新しいトークンを作り、`KOHAKU_TOKEN` `KOHAKU_PASS` を環境変数に入れて `node tools/make-config.mjs` → コミット・push
- 検査ルールは `tools/rules.json`(Python の `check_site.py` と管理画面の公開前検査が共有)。必須語・禁止語を変えるときはここだけ直す
- テスト: `npm test`(依存パッケージなし、Node 20+)
```

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: 管理画面の運用を追記"
git push
```

- [ ] **Step 8: メモリを更新する**

`project_kohaku_salon.md` に「2026-10-?? 管理画面(admin/)を kohaku-site リポジトリに実装、公開URLは kohaku-site に移設、旧URLはリダイレクト」を追記し、`MEMORY.md` の該当行を更新する。トークン期限(作成日+90日)も書く。

---

## Self-Review

**Spec coverage**
- 編集範囲4種(文章・料金メニュー・写真・お知らせ): Task 5(目印)・6〜7(モデル)・9(画面)。
- 保存方式(GitHub API で直接コミット): Task 8(1 コミット、競合は CONFLICT)。
- リポジトリ分離(案A)・URL更新・リダイレクト・リンク元更新: Task 1〜2。
- 認証(PBKDF2 60 万回・AES-GCM、トークン権限限定・90日): Task 8・10。
- noindex・innerHTML 不使用・プレビュー sandbox: Task 9。
- 検査の流用: Task 3(rules.json)・7(validate.js)・CI(Task 1)。
- 下書き(ブラウザ内)・差分要約・公開前確認: Task 7(`summarizeChanges`)・9。
- 検証(単体テスト + 実機通し): 各 Task のテストと Task 10。
- 仕様との差異(コメント目印・canonical 既存・1 コミット・rules.json)は冒頭「仕様からの補正」に明記し、Task 1 Step 8 でスペックに反映する。

**Placeholder scan:** TBD・TODO・「適宜」の類なし。Task 10 Step 8 の日付 `2026-10-??` は実施日に置き換える記入欄(実行時に確定する値)。

**Type consistency:** `readModels` の戻り値のキー(`notice, about, worriesList, worriesLead, kodawari, faq, card, groups, photos`)は Task 7 のテスト・実装・Task 9 の `app.js` で一致。`parseGroup` の戻り `{title, intro, rows, notes}` は Task 6 のテスト・`renderGroup`・`app.js` の `g.intro/g.rows/g.notes` と一致。`SiteRepo.commit({headSha, treeSha, files, message})` は Task 8 のテストと Task 9 の呼び出しで一致。`PublishError.code` は `'AUTH'|'CONFLICT'|'NETWORK'|'OTHER'`。

**Review Focus の対応:** 1→Task 4(`yen.test.js`)・7(`validate.test.js`)、2→Task 4(`text.test.js`)・7(`notice` のテスト)、3→Task 9 Step 4・`toJpeg` の拒否メッセージ(実機は Task 10 Step 4)、4→Task 8(CONFLICT/NETWORK テスト)・10 Step 5、5→Task 8(crypto/401 テスト)、6→Task 4(`regions.test.js`)、7→Task 7(`validate.test.js`)。

**既知の限界(実装しない)**
- 古い写真ファイル(差し替え前)はリポジトリに残る(掃除は手動)。
- 下書きは文章・料金のみ。選んだだけで未公開の写真は、ページを閉じると失われる。
- 「ご予約前にご確認ください」「ご来店の流れ」は今回の編集対象外(必要になったら同じ仕組みで領域を足せる)。
