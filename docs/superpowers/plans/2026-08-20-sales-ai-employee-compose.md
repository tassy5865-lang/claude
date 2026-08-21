# 営業AI社員 - 営業文作成(Claude API連携) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 営業AI社員プロジェクトの第2カテゴリとして、Claude APIを使い営業文(提案・アプローチメール/見積もり・提案書/フォローアップ・返信文)を生成し、案件パイプラインと連携する「営業文作成」タブを追加する。あわせて勝率アドバイス機能(受注/失注実績を踏まえた改善提案)も統合する。

**Architecture:** 既存の`営業AI社員/index.html`(単一HTML、CDN経由React 18 + Babel Standalone + Tailwind CSS、サーバーなし)を拡張する。新規CDNライブラリは追加しない。Claude Messages APIをブラウザから`fetch`で直接呼び出す(`anthropic-dangerous-direct-browser-access: true`ヘッダーを付与 — Anthropic公式SDKの`dangerouslyAllowBrowser`オプションが内部で送信するのと同じヘッダーで、ブラウザからの直接アクセスを許可する)。APIキー・使用モデルはlocalStorageにのみ保存(既存プロジェクト群と同じBYOKパターン)。ヘッダーに「案件パイプライン」「営業文作成」の2タブを追加し、既存のパイプライン機能はそのまま「案件パイプライン」タブに格納する。

**Tech Stack:** HTML / React 18 (UMD, CDNモード) / Babel Standalone / Tailwind CSS(CDN) / localStorage / Claude Messages API(`https://api.anthropic.com/v1/messages`、生fetch呼び出し)。ビルドツールなし、Anthropic SDKは使用しない(CDNで配布されていないため)。

**Spec:** [docs/superpowers/specs/2026-08-20-sales-ai-employee-design.md](../specs/2026-08-20-sales-ai-employee-design.md)

## Global Constraints

- 単一HTMLファイル(`営業AI社員/index.html`)構成を維持する。サーバーを追加しない。新規CDN依存を追加しない
- Claude APIキーはlocalStorageにのみ保存し、サーバーには一切送信しない。ブラウザから`fetch`で`https://api.anthropic.com/v1/messages`を直接呼び出す(ヘッダー: `Content-Type: application/json`, `x-api-key: <ユーザー入力のキー>`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`)
- モデルはプリセット3種(`claude-sonnet-5`をデフォルト、`claude-opus-5`, `claude-haiku-4-5`)+カスタム入力欄。プリセット以外の文字列を手入力できること
- トーン指定は自由テキスト入力(プリセット選択式にしない)
- 本プランのスコープは「営業文作成」タブ(+勝率アドバイスの統合)のみ。「案件リサーチ」タブ(Web検索連携)は次フェーズで別プランとする
- 既存の「案件パイプライン」タブの機能(追加・編集・削除・ソート・フォローアップハイライト・保存失敗バナー)を壊さないこと。挙動を変更する場合はタブ切替の追加によるラップのみに留める

---

## File Structure

- Modify: `営業AI社員/index.html` — タブナビゲーション、API設定モーダル、営業文作成タブ(フォーム・API呼び出し・結果表示・履歴保存)を追加
- Modify: `営業AI社員/CLAUDE.md` — 営業文作成タブの説明を追記

## Interfaces (全タスク共通)

Deal(案件)オブジェクトの`history`フィールド(Phase 1で予約済み、本プランで初めて読み書きする)に格納するエントリの形:

```js
{
  type: string,       // TEXT_TYPE_OPTIONS の value ('proposal' | 'quote' | 'followup')
  tone: string,        // 生成時に入力したトーン・要望(空文字列可)
  body: string,        // 生成された本文(ユーザーが編集した場合はその内容)
  createdAt: string,   // ISO文字列
}
```

localStorageキー(新規): `claudeApiKey`(文字列)、`claudeModel`(文字列)。

---

### Task 1: API設定(APIキー・モデル選択)UI

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: 既存の`App`コンポーネント(Phase 1で完成済み。`useState`, `useEffect`は`const { useState, useEffect } = React;`で既にインポート済み)
- Produces: `apiKey`, `model`, `showSettings`状態と、それらを更新する`setApiKey`, `setModel`, `setShowSettings`。以降の全タスクがこの`apiKey`・`model`を使う。`MODEL_PRESETS`定数、`DEFAULT_MODEL`定数。

- [ ] **Step 1: モデルプリセット定数とlocalStorage読み込みヘルパーを追加する**

`営業AI社員/index.html`内、`function isClosedStatus(status) { ... }`の直後(`function App() {`の直前)に以下を追加する:

```jsx
        const MODEL_PRESETS = [
            { label: 'Claude Sonnet 5(バランス重視)', value: 'claude-sonnet-5' },
            { label: 'Claude Opus 5(最高品質)', value: 'claude-opus-5' },
            { label: 'Claude Haiku 4.5(最安)', value: 'claude-haiku-4-5' },
        ];
        const DEFAULT_MODEL = 'claude-sonnet-5';

        function loadApiKey() {
            try {
                return localStorage.getItem('claudeApiKey') || '';
            } catch (e) {
                return '';
            }
        }

        function loadModel() {
            try {
                return localStorage.getItem('claudeModel') || DEFAULT_MODEL;
            } catch (e) {
                return DEFAULT_MODEL;
            }
        }
```

- [ ] **Step 2: `App`内にAPI設定の状態を追加する**

`function App() {`の中、以下の既存コード:

```jsx
            const [deals, setDeals] = useState(loadDeals);
            const [newCompanyName, setNewCompanyName] = useState('');
            const [saveError, setSaveError] = useState(false);

            useEffect(() => {
                setSaveError(!saveDeals(deals));
            }, [deals]);
```

を、以下に置き換える(既存3行はそのまま、直後に新規状態とuseEffectを追加):

```jsx
            const [deals, setDeals] = useState(loadDeals);
            const [newCompanyName, setNewCompanyName] = useState('');
            const [saveError, setSaveError] = useState(false);

            useEffect(() => {
                setSaveError(!saveDeals(deals));
            }, [deals]);

            const [apiKey, setApiKey] = useState(loadApiKey);
            const [model, setModel] = useState(loadModel);
            const [showSettings, setShowSettings] = useState(false);

            useEffect(() => {
                try { localStorage.setItem('claudeApiKey', apiKey); } catch (e) {}
            }, [apiKey]);

            useEffect(() => {
                try { localStorage.setItem('claudeModel', model); } catch (e) {}
            }, [model]);
```

- [ ] **Step 3: 設定アイコン(歯車ボタン)と設定モーダルをヘッダーに追加する**

以下の既存コード:

```jsx
                <div className="min-h-screen text-slate-100 p-6 max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">案件パイプライン</h1>
```

を、以下に置き換える:

```jsx
                <div className="min-h-screen text-slate-100 p-6 max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold">営業AI社員</h1>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="relative bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
                            title="API設定"
                        >
                            ⚙️ 設定
                            {!apiKey && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full"></span>
                            )}
                        </button>
                    </div>

                    {showSettings && (
                        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
                            <div className="bg-slate-800 border border-slate-600 rounded p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                                <h2 className="text-lg font-bold mb-4">API設定</h2>
                                <label className="block text-sm text-slate-400 mb-1">Claude APIキー</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-ant-..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
                                />
                                <label className="block text-sm text-slate-400 mb-1">モデル</label>
                                <select
                                    value={MODEL_PRESETS.some(p => p.value === model) ? model : '__custom__'}
                                    onChange={e => setModel(e.target.value === '__custom__' ? '' : e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-2"
                                >
                                    {MODEL_PRESETS.map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                    <option value="__custom__">カスタム(モデルIDを直接入力)</option>
                                </select>
                                {!MODEL_PRESETS.some(p => p.value === model) && (
                                    <input
                                        type="text"
                                        value={model}
                                        onChange={e => setModel(e.target.value)}
                                        placeholder="モデルIDを入力"
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
                                    />
                                )}
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded w-full mt-2"
                                >
                                    閉じる
                                </button>
                            </div>
                        </div>
                    )}
```

この置き換えの直後には、既存の`{saveError && (`ブロックがそのまま続く(変更しない)。

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由(`python -m http.server`など)で`営業AI社員/index.html`を開く。

1. ページタイトル・見出しが「営業AI社員」になっていることを確認
2. 右上の「⚙️ 設定」ボタンに赤丸バッジが表示されていることを確認(APIキー未設定のため)
3. ボタンをクリックしてモーダルが開くことを確認
4. APIキーに適当な文字列を入力、モデルは「カスタム」を選択してテキスト入力欄が表示されることを確認、何かIDを入力
5. 「閉じる」でモーダルを閉じ、リロードしてもAPIキー・モデルの入力内容が保持されていることを確認(設定モーダルを再度開いて確認)
6. APIキーを入力した状態では赤丸バッジが消えていることを確認
7. 既存のパイプライン機能(案件の追加・編集・削除)が壊れていないことを確認
8. コンソールにエラーが出ていないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: API設定(APIキー・モデル選択)UIを追加"
```

---

### Task 2: タブナビゲーション導入

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1完了後の`App`(`apiKey`, `model`, `showSettings`が存在する状態)
- Produces: `activeTab`状態(`'pipeline' | 'compose'`)、`setActiveTab`。以降のタスクがこれを使ってタブ内容を出し分ける。

- [ ] **Step 1: `activeTab`状態を追加する**

Task 1で追加した以下のコード:

```jsx
            useEffect(() => {
                try { localStorage.setItem('claudeModel', model); } catch (e) {}
            }, [model]);
```

の直後に追加:

```jsx

            const [activeTab, setActiveTab] = useState('pipeline');
```

- [ ] **Step 2: タブ切り替えボタンを追加する**

Task 1で追加した設定モーダルの`{showSettings && ( ... )}`ブロックの直後(既存の`{saveError && (`ブロックの直前)に、以下を追加する:

```jsx

                    <div className="flex gap-2 mb-6 border-b border-slate-700">
                        <button
                            onClick={() => setActiveTab('pipeline')}
                            className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px ' + (activeTab === 'pipeline' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}
                        >
                            案件パイプライン
                        </button>
                        <button
                            onClick={() => setActiveTab('compose')}
                            className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px ' + (activeTab === 'compose' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}
                        >
                            営業文作成
                        </button>
                    </div>
```

- [ ] **Step 3: 既存のパイプライン内容を`activeTab === 'pipeline'`でラップし、営業文作成タブのプレースホルダーを追加する**

以下の既存コード全体(`{saveError && (`から、案件一覧を出し分ける`{deals.length === 0 ? ( ... ) : ( ... )}`の閉じ`)}`まで — つまりタブ追加前の最後のJSXブロック一式)を:

```jsx
                    {saveError && (
                        <div className="bg-rose-950 border border-rose-700 text-rose-200 rounded p-3 mb-4 text-sm">
                            変更を保存できませんでした。プライベートブラウジングモードやストレージ容量の制限が原因の可能性があります。
                        </div>
                    )}

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
                            {sortedDeals.map(deal => (
                                <li
                                    key={deal.id}
                                    className={
                                        'rounded p-3 border ' +
                                        (deal.nextActionDate && deal.nextActionDate <= today && !isClosedStatus(deal.status)
                                            ? 'bg-rose-950 border-rose-700'
                                            : 'bg-slate-800 border-slate-700')
                                    }
                                >
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
                                            {deal.nextActionDate && deal.nextActionDate <= today && !isClosedStatus(deal.status) && (
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
                        </ul>
                    )}
```

以下に置き換える(内容は一切変更せず、`{activeTab === 'pipeline' && (<> ... </>)}`で丸ごとラップし、その直後に営業文作成タブのプレースホルダーを追加するだけ):

```jsx
                    {activeTab === 'pipeline' && (
                        <>
                            {saveError && (
                                <div className="bg-rose-950 border border-rose-700 text-rose-200 rounded p-3 mb-4 text-sm">
                                    変更を保存できませんでした。プライベートブラウジングモードやストレージ容量の制限が原因の可能性があります。
                                </div>
                            )}

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
                                    {sortedDeals.map(deal => (
                                        <li
                                            key={deal.id}
                                            className={
                                                'rounded p-3 border ' +
                                                (deal.nextActionDate && deal.nextActionDate <= today && !isClosedStatus(deal.status)
                                                    ? 'bg-rose-950 border-rose-700'
                                                    : 'bg-slate-800 border-slate-700')
                                            }
                                        >
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
                                                    {deal.nextActionDate && deal.nextActionDate <= today && !isClosedStatus(deal.status) && (
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
                                </ul>
                            )}
                        </>
                    )}

                    {activeTab === 'compose' && (
                        <div className="text-slate-400 text-sm">準備中です。</div>
                    )}
```

- [ ] **Step 4: ブラウザで動作確認する**

1. 「案件パイプライン」タブが初期表示され、既存機能(追加・編集・削除・ステータス変更・次アクション日・メモ・フォローアップハイライト)がすべて壊れず動作することを確認
2. 「営業文作成」タブに切り替えると「準備中です。」と表示され、パイプライン内容が非表示になることを確認
3. 「案件パイプライン」タブに戻ると、追加した案件がそのまま表示されていることを確認(タブ切替でデータが消えないこと)
4. コンソールエラーがないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: タブナビゲーション(案件パイプライン/営業文作成)を追加"
```

---

### Task 3: 営業文作成フォーム + Claude API呼び出し

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1の`apiKey`, `model`。Task 2の`activeTab`。既存の`deals`, `isClosedStatus`。
- Produces: `TEXT_TYPE_OPTIONS`定数、`generateSalesText(...)`関数、`composeResultBody`状態。Task 4がこの`composeResultBody`・`composeSelectedDealId`・`composeTextType`・`composeTone`を使う。

- [ ] **Step 1: 文章種別の定数とAPI呼び出し関数を追加する**

`function loadModel() { ... }`の直後(`function App() {`の直前)に追加:

```jsx

        const TEXT_TYPE_OPTIONS = [
            { value: 'proposal', label: '提案・アプローチメール' },
            { value: 'quote', label: '見積もり・提案書としての文章' },
            { value: 'followup', label: 'フォローアップ・返信文' },
        ];

        async function generateSalesText({ apiKey, model, companyName, textType, tone, dealMemo, closedDeals }) {
            const textTypeLabel = (TEXT_TYPE_OPTIONS.find(t => t.value === textType) || {}).label || textType;

            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当です。以下の条件で営業文を作成してください。\n\n';
            prompt += `宛先の会社名: ${companyName || '(未指定)'}\n`;
            prompt += `文章の種類: ${textTypeLabel}\n`;
            if (tone && tone.trim()) {
                prompt += `トーン・要望: ${tone.trim()}\n`;
            }
            if (dealMemo && dealMemo.trim()) {
                prompt += `\n参考情報(この案件のメモ):\n${dealMemo.trim()}\n`;
            }
            if (closedDeals && closedDeals.length > 0) {
                prompt += '\n過去の受注・失注案件の傾向(参考):\n';
                closedDeals.forEach(d => {
                    prompt += `- ${d.companyName}: ${d.status}${d.memo ? '(' + d.memo + ')' : ''}\n`;
                });
            }
            prompt += '\n本文をそのまま送信できる形で出力してください。前置きや説明は不要です。\n';
            prompt += '本文の後に、必ず見出し「### 改善アドバイス」を1行だけ出力し、その下にこの文章のトーンや構成について改善できる点を3行程度の箇条書きで書いてください。';

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const textBlock = (data.content || []).find(b => b.type === 'text');
            const fullText = textBlock ? textBlock.text : '';

            const marker = '### 改善アドバイス';
            const markerIndex = fullText.indexOf(marker);
            if (markerIndex === -1) {
                return { body: fullText.trim(), advice: '' };
            }
            return {
                body: fullText.slice(0, markerIndex).trim(),
                advice: fullText.slice(markerIndex + marker.length).trim(),
            };
        }
```

- [ ] **Step 2: `App`内に営業文作成タブの状態と生成処理を追加する**

Task 1で追加した以下のコード:

```jsx
            useEffect(() => {
                try { localStorage.setItem('claudeModel', model); } catch (e) {}
            }, [model]);

            const [activeTab, setActiveTab] = useState('pipeline');
```

の直後に追加:

```jsx

            const [composeSelectedDealId, setComposeSelectedDealId] = useState('');
            const [composeManualCompany, setComposeManualCompany] = useState('');
            const [composeTextType, setComposeTextType] = useState(TEXT_TYPE_OPTIONS[0].value);
            const [composeTone, setComposeTone] = useState('');
            const [composeLoading, setComposeLoading] = useState(false);
            const [composeError, setComposeError] = useState('');
            const [composeResultBody, setComposeResultBody] = useState('');
            const [composeResultAdvice, setComposeResultAdvice] = useState('');

            async function handleGenerate() {
                setComposeLoading(true);
                setComposeError('');
                try {
                    const selectedDeal = deals.find(d => d.id === composeSelectedDealId) || null;
                    const companyName = selectedDeal ? selectedDeal.companyName : composeManualCompany;
                    const closedDeals = deals.filter(d => isClosedStatus(d.status));
                    const result = await generateSalesText({
                        apiKey,
                        model,
                        companyName,
                        textType: composeTextType,
                        tone: composeTone,
                        dealMemo: selectedDeal ? selectedDeal.memo : '',
                        closedDeals,
                    });
                    setComposeResultBody(result.body);
                    setComposeResultAdvice(result.advice);
                } catch (e) {
                    setComposeError(e.message || '生成に失敗しました');
                } finally {
                    setComposeLoading(false);
                }
            }
```

- [ ] **Step 3: 営業文作成タブのUIを実装する**

Task 2で追加した以下のプレースホルダー:

```jsx
                    {activeTab === 'compose' && (
                        <div className="text-slate-400 text-sm">準備中です。</div>
                    )}
```

を、以下に置き換える:

```jsx
                    {activeTab === 'compose' && (
                        <div>
                            <div className="mb-4">
                                <label className="block text-sm text-slate-400 mb-1">対象の案件(任意)</label>
                                <select
                                    value={composeSelectedDealId}
                                    onChange={e => setComposeSelectedDealId(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm mb-2"
                                >
                                    <option value="">選択しない(会社名を直接入力)</option>
                                    {deals.map(d => (
                                        <option key={d.id} value={d.id}>{d.companyName}</option>
                                    ))}
                                </select>
                                {!composeSelectedDealId && (
                                    <input
                                        type="text"
                                        value={composeManualCompany}
                                        onChange={e => setComposeManualCompany(e.target.value)}
                                        placeholder="会社名を入力"
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                )}
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm text-slate-400 mb-1">文章の種類</label>
                                <select
                                    value={composeTextType}
                                    onChange={e => setComposeTextType(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm"
                                >
                                    {TEXT_TYPE_OPTIONS.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm text-slate-400 mb-1">トーン・要望(任意)</label>
                                <textarea
                                    value={composeTone}
                                    onChange={e => setComposeTone(e.target.value)}
                                    placeholder="例: 丁寧に、少しカジュアルに、簡潔に、など"
                                    rows={2}
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={!apiKey || composeLoading}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-4 py-2 rounded mb-4"
                            >
                                {composeLoading ? '生成中...' : '生成'}
                            </button>
                            {!apiKey && (
                                <p className="text-slate-500 text-xs mb-4">APIキーが未設定です。右上の設定から入力してください。</p>
                            )}

                            {composeError && (
                                <div className="bg-rose-950 border border-rose-700 text-rose-200 rounded p-3 mb-4 text-sm">
                                    {composeError}
                                </div>
                            )}

                            {composeResultBody && (
                                <div className="mb-4">
                                    <label className="block text-sm text-slate-400 mb-1">生成された文章(編集可)</label>
                                    <textarea
                                        value={composeResultBody}
                                        onChange={e => setComposeResultBody(e.target.value)}
                                        rows={10}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            )}

                            {composeResultAdvice && (
                                <div className="bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300">
                                    <div className="font-semibold text-slate-400 mb-1">改善アドバイス</div>
                                    <div className="whitespace-pre-wrap">{composeResultAdvice}</div>
                                </div>
                            )}
                        </div>
                    )}
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。

1. APIキー未設定の状態で「営業文作成」タブを開き、「生成」ボタンが無効化されていること、注意書きが表示されることを確認
2. 設定でAPIキーに**架空の文字列**(例: `sk-ant-test-invalid-key-000`)を設定し、文章種別を選択、「生成」を押す
   - ネットワークタブ(`mcp__Claude_Browser__read_network_requests`)で`https://api.anthropic.com/v1/messages`へのリクエストが実際に送信されていることを確認する(CORSでブロックされていないか、ブラウザ拡張機能に依存せず直接検証すること)
   - 認証エラー(401など)がエラーメッセージとして画面に表示され、入力していたトーン等が消えずに残っていることを確認
   - **この結果を報告に必ず明記すること**: リクエストが実際にAnthropic APIに到達し、CORSエラーではなく通常のHTTPエラーレスポンス(401等)として返ってきたかどうか。ここが`anthropic-dangerous-direct-browser-access`ヘッダーの動作検証の核心である
3. 成功パスをテストするため、ブラウザのJavaScriptコンソールで一時的に`window.fetch`を以下のようなモックに差し替えてから「生成」を押す:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       content: [{ type: 'text', text: '拝啓\n\nテスト本文です。\n\n敬具\n\n### 改善アドバイス\n- もう少し具体的に\n- 挨拶を工夫する\n- 締めくくりを丁寧に' }]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 「生成された文章」欄に「拝啓...敬具」部分のみ(見出し以降を含まない)が表示され、「改善アドバイス」欄に箇条書き部分が表示されることを確認(マーカーでの分割が正しく機能している)
   - 生成された文章のtextareaが編集可能であることを確認
4. ページをリロードして`window.fetch`のモックを解除する
5. コンソールエラーがないことを確認(モック関連の意図的なテストコードを除く)

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 営業文作成フォームとClaude API呼び出しを追加"
```

---

### Task 4: 生成結果の案件履歴への保存・履歴表示

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 3の`composeResultBody`, `composeSelectedDealId`, `composeTextType`, `composeTone`。既存の`deals`, `updateDeal`, `TEXT_TYPE_OPTIONS`。
- Produces: `saveGeneratedText()`関数。本プランの最終機能タスク。

- [ ] **Step 1: 履歴保存関数を追加する**

Task 3で追加した`async function handleGenerate() { ... }`の閉じ`}`の直後に追加:

```jsx

            function saveGeneratedText() {
                if (!composeSelectedDealId || !composeResultBody) return;
                const target = deals.find(d => d.id === composeSelectedDealId);
                if (!target) return;
                const entry = {
                    type: composeTextType,
                    tone: composeTone,
                    body: composeResultBody,
                    createdAt: new Date().toISOString(),
                };
                updateDeal(composeSelectedDealId, { history: [...target.history, entry] });
            }
```

- [ ] **Step 2: 保存ボタンと履歴一覧のUIを追加する**

Task 3で追加した以下のコード:

```jsx
                            {composeResultBody && (
                                <div className="mb-4">
                                    <label className="block text-sm text-slate-400 mb-1">生成された文章(編集可)</label>
                                    <textarea
                                        value={composeResultBody}
                                        onChange={e => setComposeResultBody(e.target.value)}
                                        rows={10}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            )}

                            {composeResultAdvice && (
                                <div className="bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300">
                                    <div className="font-semibold text-slate-400 mb-1">改善アドバイス</div>
                                    <div className="whitespace-pre-wrap">{composeResultAdvice}</div>
                                </div>
                            )}
                        </div>
                    )}
```

を、以下に置き換える(生成文・アドバイス表示はそのまま、保存ボタンと履歴一覧を追加):

```jsx
                            {composeResultBody && (
                                <div className="mb-4">
                                    <label className="block text-sm text-slate-400 mb-1">生成された文章(編集可)</label>
                                    <textarea
                                        value={composeResultBody}
                                        onChange={e => setComposeResultBody(e.target.value)}
                                        rows={10}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            )}

                            {composeResultBody && composeSelectedDealId && (
                                <button
                                    onClick={saveGeneratedText}
                                    className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded mb-4"
                                >
                                    この案件の履歴に保存
                                </button>
                            )}

                            {composeResultAdvice && (
                                <div className="bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300">
                                    <div className="font-semibold text-slate-400 mb-1">改善アドバイス</div>
                                    <div className="whitespace-pre-wrap">{composeResultAdvice}</div>
                                </div>
                            )}

                            {composeSelectedDealId && (() => {
                                const target = deals.find(d => d.id === composeSelectedDealId);
                                if (!target || target.history.length === 0) return null;
                                return (
                                    <div className="mt-6">
                                        <div className="text-sm font-semibold text-slate-400 mb-2">この案件の生成履歴</div>
                                        <ul className="space-y-2">
                                            {[...target.history].reverse().map((h, i) => (
                                                <li key={i} className="bg-slate-800 border border-slate-700 rounded p-3 text-sm">
                                                    <div className="text-slate-400 text-xs mb-1">
                                                        {(TEXT_TYPE_OPTIONS.find(t => t.value === h.type) || {}).label || h.type}
                                                        {' '}・{' '}
                                                        {new Date(h.createdAt).toLocaleString('ja-JP')}
                                                    </div>
                                                    <div className="whitespace-pre-wrap">{h.body}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
```

- [ ] **Step 3: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。

1. 「案件パイプライン」タブで案件を1件追加する
2. 「営業文作成」タブで、Task 3の手順と同じ`window.fetch`モックを使って生成を行う(先に追加した案件を「対象の案件」に選択した状態で生成すること)
3. 「この案件の履歴に保存」ボタンが表示されることを確認し、クリックする
4. 「この案件の生成履歴」に、種別ラベル・日時・本文が表示されることを確認
5. ページをリロードし、同じ案件を選択し直して履歴が保持されていることを確認(localStorage永続化)
6. 対象の案件を選択していない状態(「選択しない」のまま)では保存ボタンが表示されないことを確認
7. ページをリロードして`window.fetch`のモックを解除する
8. コンソールエラーがないことを確認

- [ ] **Step 4: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 生成した営業文の案件履歴への保存・表示を追加"
```

---

### Task 5: CLAUDE.mdドキュメント更新

**Files:**
- Modify: `営業AI社員/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜4で完成した営業文作成タブの機能一覧
- Produces: なし(ドキュメントのみ、本プランの最終タスク)

- [ ] **Step 1: CLAUDE.mdを更新する**

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSSを使用。サーバーなし、GitHub Pagesでそのまま公開できる。AI機能(営業文作成・リサーチ)はClaude APIを直接呼び出す方式を予定（APIキーはユーザーがブラウザ内で入力し、localStorageにのみ保存）。
```

を、以下に置き換える:

```markdown
## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSSを使用。サーバーなし、GitHub Pagesでそのまま公開できる。AI機能(営業文作成)はClaude Messages API（`https://api.anthropic.com/v1/messages`）を`fetch`でブラウザから直接呼び出す方式（`anthropic-dangerous-direct-browser-access: true`ヘッダーを付与）。APIキー・使用モデルはユーザーがブラウザ内で入力し、localStorageにのみ保存（キー: `claudeApiKey`, `claudeModel`）。案件リサーチ機能は今後実装予定。
```

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
### 未実装（今後のカテゴリ）
- 案件リサーチ画面（リード発掘・個別下調べ、Claude API web_search連携）
- 営業文作成画面（提案・見積・フォロー文の生成、勝率アドバイス、Claude API連携）
- APIキー設定UI（上記2画面の実装時に追加）
```

を、以下に置き換える:

```markdown
### 営業文作成タブ
- ヘッダーに「案件パイプライン」「営業文作成」の2タブを追加（タブ切替はページリロードでリセットされ、選択状態は保存しない）
- 右上の「⚙️ 設定」からClaude APIキー・使用モデル（プリセット3種: Claude Sonnet 5[デフォルト]/Claude Opus 5/Claude Haiku 4.5 + カスタム入力）を設定（localStorageのみ保存、未設定時はボタン無効化＋赤丸バッジ）
- パイプラインの案件を選択（または会社名を直接入力）→文章種別（提案・アプローチメール/見積もり・提案書/フォローアップ・返信文）を選択→トーン・要望を自由テキストで入力（任意）→「生成」でClaude APIを呼び出し、営業文を生成
- 案件を選択している場合、その案件のメモと、パイプライン内の受注/失注案件の傾向をプロンプトに含める（勝率アドバイスの材料）
- 生成結果は本文（編集可能）と改善アドバイス（プロンプト内で固定見出し「### 改善アドバイス」により分離）の2エリアに分けて表示
- 「この案件の履歴に保存」で、選択中の案件の`history`配列に生成結果を追記。案件選択時、その案件の過去の生成履歴を一覧表示

### 未実装（今後のカテゴリ）
- 案件リサーチ画面（リード発掘・個別下調べ、Claude API Web検索連携）
```

- [ ] **Step 2: コミット**

```bash
git add "営業AI社員/CLAUDE.md"
git commit -m "営業AI社員: CLAUDE.mdに営業文作成タブの説明を追記"
```
