# 営業AI社員 - 案件パイプライン管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 営業AI社員プロジェクトの第1カテゴリとして、案件(リード)の追加・編集・削除・ステータス管理・フォローアップリマインダーができる「案件パイプライン」を単一HTMLアプリとして構築する。

**Architecture:** 他プロジェクト(AI-OCR等)と同じ「単一HTML + CDN経由React 18 + Babel Standalone(JSXをブラウザ内変換) + Tailwind CSS」構成。サーバーなし。データはlocalStorageにのみ保存。本タスクではAI(Claude API)連携は行わない — パイプラインはデータの土台であり、AI機能(営業文作成・リサーチ)は今後のカテゴリで追加する。

**Tech Stack:** HTML / React 18 (UMD, CDNモード) / Babel Standalone / Tailwind CSS(CDN) / localStorage。ビルドツールなし。

**Spec:** [docs/superpowers/specs/2026-08-20-sales-ai-employee-design.md](../specs/2026-08-20-sales-ai-employee-design.md)

## Global Constraints

- サーバー不要・単一HTMLファイル構成(他プロジェクトと同じパターン)を維持する
- データはlocalStorageにのみ保存し、サーバーへは一切送信しない
- 本プランのスコープは「案件パイプライン」のみ。Claude API連携・タブ構成(リサーチ/営業文作成)は含めない(スコープドイテレーション: 1カテゴリずつ進める方針)
- 案件データモデルは将来カテゴリ(営業文作成・リサーチ)が使う`researchNotes`(リサーチメモ)と`history`(生成履歴)フィールドを持つ(スペックのデータモデル節に準拠。今回は空のまま保持するのみで、読み書きロジックは実装しない)

---

## File Structure

- Create: `営業AI社員/index.html` — アプリ本体(HTML+CSS+React/JSXすべてを含む単一ファイル)
- Create: `営業AI社員/CLAUDE.md` — プロジェクトドキュメント(他プロジェクトと同じ形式: 概要・技術スタック・現在の状態・進め方の注意)

## Interfaces (全タスク共通の型)

案件(Deal)オブジェクトの形:

```js
{
  id: string,              // crypto.randomUUID()
  companyName: string,     // 会社名(必須)
  status: string,           // '未アプローチ' | '提案中' | '商談中' | '受注' | '失注'
  nextActionDate: string,   // 'YYYY-MM-DD' または ''
  memo: string,
  researchNotes: string,    // 今後のリサーチ機能用。今回は常に ''
  history: Array,           // 今後の営業文作成機能用。今回は常に []
  createdAt: string,        // ISO文字列
}
```

localStorageキー: `salesPipelineDeals`(JSON文字列化した配列)

---

### Task 1: HTMLスケルトンとReact起動確認

**Files:**
- Create: `営業AI社員/index.html`

**Interfaces:**
- Consumes: なし(最初のタスク)
- Produces: `App`コンポーネント(以降のタスクがこの中に機能を追加していく)、`#root`へのReactマウント

- [ ] **Step 1: index.htmlの雛形を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>営業AI社員 - 案件パイプライン</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- React & ReactDOM -->
    <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
    <!-- Babel for JSX -->
    <script src="https://unpkg.com/@babel/standalone@7.23.9/babel.min.js"></script>

    <style>
        body { font-family: 'Inter', 'Noto Sans JP', sans-serif; background-color: #0b0f19; margin: 0; }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        /** @jsx React.createElement */
        /** @jsxFrag React.Fragment */
        const { useState, useEffect } = React;

        function App() {
            return (
                <div className="min-h-screen text-slate-100 p-6 max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">案件パイプライン</h1>
                </div>
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>
```

- [ ] **Step 2: ブラウザで開いて起動を確認する**

Claude Browserツールで `営業AI社員/index.html` を `file://` パスで開く(例: `mcp__Claude_Browser__navigate` に絶対パスの `file:///.../営業AI社員/index.html` を渡す)。

Expected: ページタイトルが「営業AI社員 - 案件パイプライン」、画面に「案件パイプライン」という見出しが表示される。`mcp__Claude_Browser__read_console_messages` でコンソールエラーが出ていないことを確認する。

- [ ] **Step 3: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: HTMLスケルトンとReact起動を追加"
```

---

### Task 2: 案件の追加・一覧表示・削除(localStorage永続化)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1の`App`コンポーネント
- Produces: `deals`状態(Deal配列)、`addDeal(companyName)`、`deleteDeal(id)`、`STORAGE_KEY`定数。以降のタスクはこの`deals`状態と更新関数を使う。

- [ ] **Step 1: データ読み書きのヘルパーとstate管理をAppに追加する**

`App`関数の中身を以下に置き換える(`<style>`ブロックとhead部分はTask 1のまま変更しない):

```jsx
const STORAGE_KEY = 'salesPipelineDeals';
const STATUS_OPTIONS = ['未アプローチ', '提案中', '商談中', '受注', '失注'];

function loadDeals() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('案件データの読み込みに失敗しました', e);
        return [];
    }
}

function saveDeals(deals) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
    } catch (e) {
        console.error('案件データの保存に失敗しました', e);
    }
}

function App() {
    const [deals, setDeals] = useState(loadDeals);
    const [newCompanyName, setNewCompanyName] = useState('');

    useEffect(() => {
        saveDeals(deals);
    }, [deals]);

    function addDeal(companyName) {
        const trimmed = companyName.trim();
        if (!trimmed) return;
        const newDeal = {
            id: crypto.randomUUID(),
            companyName: trimmed,
            status: STATUS_OPTIONS[0],
            nextActionDate: '',
            memo: '',
            researchNotes: '',
            history: [],
            createdAt: new Date().toISOString(),
        };
        setDeals(prev => [...prev, newDeal]);
        setNewCompanyName('');
    }

    function deleteDeal(id) {
        if (!window.confirm('この案件を削除しますか？')) return;
        setDeals(prev => prev.filter(d => d.id !== id));
    }

    function handleAddSubmit(e) {
        e.preventDefault();
        addDeal(newCompanyName);
    }

    return (
        <div className="min-h-screen text-slate-100 p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">案件パイプライン</h1>

            <form onSubmit={handleAddSubmit} className="flex gap-2 mb-6">
                <input
                    type="text"
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="会社名を入力"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded"
                >
                    + 案件を追加
                </button>
            </form>

            {deals.length === 0 ? (
                <p className="text-slate-400 text-sm">案件がまだありません。「+ 案件を追加」から始めましょう。</p>
            ) : (
                <ul className="space-y-2">
                    {deals.map(deal => (
                        <li key={deal.id} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between">
                            <span className="font-medium">{deal.companyName}</span>
                            <button
                                onClick={() => deleteDeal(deal.id)}
                                className="text-slate-400 hover:text-rose-400 text-sm"
                            >
                                削除
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 2: ブラウザで動作確認する**

`file://` で `営業AI社員/index.html` を開く(既に開いていればリロード)。

1. 会社名を入力して「+ 案件を追加」を押す → 一覧に表示されることを確認
2. ページをリロードする → 追加した案件が消えずに残っていることを確認(localStorage永続化)
3. 「削除」を押す → 確認ダイアログが出て、OKで一覧から消えることを確認
4. 全件削除した状態でリロード → 「案件がまだありません。」の空状態メッセージが出ることを確認

Expected: 上記4点すべてが仕様通りに動作し、コンソールエラーが出ていないこと。

- [ ] **Step 3: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 案件の追加・一覧・削除とlocalStorage永続化を追加"
```

---

### Task 3: ステータス・次アクション日・メモのインライン編集

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 2の`deals`状態、`setDeals`、`STATUS_OPTIONS`
- Produces: `updateDeal(id, patch)`関数。Task 4がこれをそのまま使う。

- [ ] **Step 1: `updateDeal`関数と各行の編集UIを追加する**

`deleteDeal`関数の直後に`updateDeal`を追加:

```jsx
    function updateDeal(id, patch) {
        setDeals(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    }
```

`<ul>`内の`<li>`の中身を以下に置き換える(会社名・削除ボタンはそのまま残しつつ、ステータス・次アクション日・メモの編集欄を追加):

```jsx
                    {deals.map(deal => (
                        <li key={deal.id} className="bg-slate-800 border border-slate-700 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{deal.companyName}</span>
                                <button
                                    onClick={() => deleteDeal(deal.id)}
                                    className="text-slate-400 hover:text-rose-400 text-sm"
                                >
                                    削除
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center text-sm mb-2">
                                <select
                                    value={deal.status}
                                    onChange={e => updateDeal(deal.id, { status: e.target.value })}
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1"
                                >
                                    {STATUS_OPTIONS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <label className="flex items-center gap-1 text-slate-400">
                                    次アクション日:
                                    <input
                                        type="date"
                                        value={deal.nextActionDate}
                                        onChange={e => updateDeal(deal.id, { nextActionDate: e.target.value })}
                                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1"
                                    />
                                </label>
                            </div>
                            <textarea
                                value={deal.memo}
                                onChange={e => updateDeal(deal.id, { memo: e.target.value })}
                                placeholder="メモ"
                                rows={2}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </li>
                    ))}
```

- [ ] **Step 2: ブラウザで動作確認する**

`file://` で開き直すかリロードして:

1. 案件を1件追加する
2. ステータスのセレクトを「提案中」に変更 → リロードしても「提案中」のままであることを確認
3. 次アクション日に今日以降の日付を入力 → リロードしても保持されることを確認
4. メモ欄に文字を入力 → リロードしても保持されることを確認

Expected: 3項目すべてがlocalStorageに永続化され、コンソールエラーが出ていないこと。

- [ ] **Step 3: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: ステータス・次アクション日・メモのインライン編集を追加"
```

---

### Task 4: フォローアップリマインダー(期日ソート・ハイライト)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 3の`deals`, `updateDeal`, `deleteDeal`
- Produces: `todayStr()`ヘルパー、ソート・ハイライト済みの表示ロジック(以降のタスクなし。本プランの最終機能タスク)

- [ ] **Step 1: 今日の日付を取得するヘルパーとソート・ハイライトロジックを追加する**

`STATUS_OPTIONS`定数の直後に追加:

```jsx
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

`App`関数内、`deals.map(...)`で描画する直前に、ソート済み配列を計算する処理を追加する(`return`文の直前、`handleAddSubmit`関数定義の後に挿入):

```jsx
    const sortedDeals = [...deals].sort((a, b) => {
        if (!a.nextActionDate && !b.nextActionDate) return 0;
        if (!a.nextActionDate) return 1;
        if (!b.nextActionDate) return -1;
        return a.nextActionDate.localeCompare(b.nextActionDate);
    });
    const today = todayStr();
```

`{deals.map(deal => (` を `{sortedDeals.map(deal => (` に変更する(空状態チェックの`deals.length === 0`はそのまま`deals`を参照でよい)。

`<li>`のclassNameを、期日超過・当日の案件をハイライトするように変更する:

```jsx
                        <li
                            key={deal.id}
                            className={
                                'rounded p-3 border ' +
                                (deal.nextActionDate && deal.nextActionDate <= today
                                    ? 'bg-rose-950 border-rose-700'
                                    : 'bg-slate-800 border-slate-700')
                            }
                        >
```

さらに、期日超過・当日の案件には「次アクション日」ラベルの前に注意書きを出す。`<label className="flex items-center gap-1 text-slate-400">次アクション日:` の行を以下に置き換える:

```jsx
                                <label className="flex items-center gap-1 text-slate-400">
                                    {deal.nextActionDate && deal.nextActionDate <= today && (
                                        <span className="text-rose-400 font-semibold mr-1">要フォロー</span>
                                    )}
                                    次アクション日:
                                    <input
                                        type="date"
                                        value={deal.nextActionDate}
                                        onChange={e => updateDeal(deal.id, { nextActionDate: e.target.value })}
                                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1"
                                    />
                                </label>
```

- [ ] **Step 2: ブラウザで動作確認する**

`file://` で開き直すかリロードして:

1. 3件の案件を追加し、それぞれ次アクション日を「昨日」「今日」「来週」に設定する
2. 一覧が次アクション日の昇順(昨日→今日→来週→日付未設定)で並んでいることを確認
3. 「昨日」「今日」の2件が赤系の背景色でハイライトされ、「要フォロー」ラベルが表示されていることを確認
4. 「来週」の案件と日付未設定の案件はハイライトされていないことを確認

Expected: 上記4点すべてが仕様通りで、コンソールエラーが出ていないこと。

- [ ] **Step 3: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: フォローアップリマインダー(期日ソート・ハイライト)を追加"
```

---

### Task 5: CLAUDE.mdドキュメント作成

**Files:**
- Create: `営業AI社員/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜4で完成した`営業AI社員/index.html`の機能一覧
- Produces: なし(ドキュメントのみ、本プランの最終タスク)

- [ ] **Step 1: CLAUDE.mdを作成する**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## プロジェクト概要

自分自身の受託・フリーランス営業を支援するAIツール。案件リサーチ・営業文の作成・案件パイプライン管理を1つのWebツールで完結させる。ヘッダーのタブで画面を切り替える構成を予定(現時点ではパイプライン画面のみ)。

## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSSを使用。サーバーなし、GitHub Pagesでそのまま公開できる。AI機能(営業文作成・リサーチ)はClaude APIを直接呼び出す方式を予定（APIキーはユーザーがブラウザ内で入力し、localStorageにのみ保存）。

## 現在の状態

### 案件パイプライン画面
- 会社名を入力して案件を追加、一覧表示、削除（確認ダイアログあり）
- 案件ごとにステータス（未アプローチ/提案中/商談中/受注/失注）、次アクション日、メモをインライン編集可能
- 次アクション日の昇順（未設定は最後）で自動ソート
- 次アクション日が今日以前（期日超過・当日）の案件は赤系ハイライト+「要フォロー」ラベルで表示（フォローアップリマインダー）
- データは`localStorage`（キー: `salesPipelineDeals`）にのみ保存、サーバー送信なし
- 案件データは今後のカテゴリ（リサーチ・営業文作成）が使う`researchNotes`・`history`フィールドを持つが、現時点では未使用（常に空）

### 未実装（今後のカテゴリ）
- 案件リサーチ画面（リード発掘・個別下調べ、Claude API web_search連携）
- 営業文作成画面（提案・見積・フォロー文の生成、勝率アドバイス、Claude API連携）
- APIキー設定UI（上記2画面の実装時に追加）

## 進め方の注意

機能は一気に全部作らず、ユーザーが指定した1カテゴリずつ進める。
```

- [ ] **Step 2: コミット**

```bash
git add "営業AI社員/CLAUDE.md"
git commit -m "営業AI社員: プロジェクトドキュメント(CLAUDE.md)を追加"
```
