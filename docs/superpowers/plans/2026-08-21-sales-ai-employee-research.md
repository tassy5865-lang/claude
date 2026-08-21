# 営業AI社員 - 案件リサーチ(Web検索連携) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 営業AI社員プロジェクトの第3カテゴリ(最終カテゴリ)として、Claude APIのWeb検索機能を使い、①リード発掘(業界・キーワードから新規候補企業を探す)②個別下調べ(会社名/URLから事業内容・接点を調査)の2モードを持つ「案件リサーチ」タブを追加する。あわせて、Phase 2で漏れていた「営業文作成にリサーチメモを含める」連携も補う。

**Architecture:** 既存の`営業AI社員/index.html`(単一HTML、CDN経由React 18 + Babel Standalone + Tailwind CSS、サーバーなし)を拡張する。新規CDNライブラリは追加しない。Claude Messages APIをブラウザから`fetch`で直接呼び出す既存パターン(Phase 2で確立・検証済み)を踏襲し、リクエストに`tools`パラメータでWeb検索(`web_search_20250305`)・Web取得(`web_fetch_20250910`)を追加する。モデル間の互換性のため、常に基本バリアント(`_20250305`/`_20250910`)を使う(動的フィルタリング版`_20260209`はHaiku系で未対応のため使わない)。「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成にし、「案件リサーチ」を中央に挿入する。

**Tech Stack:** HTML / React 18 (UMD, CDNモード) / Babel Standalone / Tailwind CSS(CDN) / localStorage / Claude Messages API(`https://api.anthropic.com/v1/messages`、生fetch呼び出し、`web_search_20250305`・`web_fetch_20250910`ツール使用)。ビルドツールなし。

**Spec:** [docs/superpowers/specs/2026-08-20-sales-ai-employee-design.md](../specs/2026-08-20-sales-ai-employee-design.md)

## Global Constraints

- 単一HTMLファイル(`営業AI社員/index.html`)構成を維持する。サーバーを追加しない。新規CDN依存を追加しない
- Claude APIキーはlocalStorageにのみ保存(既存のAPI設定機能をそのまま使う。この段階で変更しない)
- Web検索・Web取得は`web_search_20250305`・`web_fetch_20250910`の基本バリアントで固定する(モデルごとの対応バリアント分岐はしない)。ベータヘッダーは不要
- Web検索はユーザーのAnthropic APIキー側で従量課金される機能である(トークン費用とは別)。実装コード上での特別な配慮は不要だが、ドキュメントに一言触れておく
- 本プランのスコープは「案件リサーチ」タブ(リード発掘・個別下調べ)と、Phase 2の`generateSalesText`へのresearchNotes連携のみ
- 既存の「案件パイプライン」「営業文作成」タブの機能を壊さないこと。タブバーへの新規タブ挿入以外で既存タブの表示・ロジックを変更しない
- 案件を参照する新規状態(`researchSaveDealId`)は、Phase 2の最終レビューで見つかった「参照先の案件が削除されると状態が浮く」バグ(`composeSelectedDealId`の教訓)と同じ轍を踏まないよう、最初から削除時リセットの`useEffect`を実装する

---

## File Structure

- Modify: `営業AI社員/index.html` — 案件リサーチタブ(タブ枠組み・個別下調べ・リード発掘)、`generateSalesText`へのresearchNotes連携を追加
- Modify: `営業AI社員/CLAUDE.md` — 案件リサーチタブの説明を追記、プロジェクト計画済み3カテゴリが揃った旨を記載

## Interfaces (全タスク共通)

リード候補オブジェクトの形(Task 3が生成、パイプラインには`companyName`のみを使って新規案件を作る):

```js
{
  companyName: string,
  reason: string,   // 候補として挙げた理由
}
```

`researchNotes`フィールド(Deal内、Phase 1で予約済み)への追記フォーマット(Task 2が書き込む):

```
[2026/8/21]
<調査結果本文>

---
[2026/8/15]
<以前の調査結果本文>
```

(新しい調査結果を先頭ではなく既存の下に追記する形。日付は`toLocaleDateString('ja-JP')`。空でなければ`\n\n---\n`で区切って連結)

---

### Task 1: 案件リサーチタブの枠組み(タブ挿入・サブモード切替)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: 既存の`activeTab`/`setActiveTab`(Phase 2)
- Produces: `activeTab === 'research'`という新しいタブ値、`researchMode`/`setResearchMode`状態(`'leads' | 'individual'`)。以降のタスクがこれらを使う。

- [ ] **Step 1: タブバーに「案件リサーチ」ボタンを中央に挿入する**

以下の既存コード:

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

を、以下に置き換える(「案件リサーチ」ボタンを中央に挿入するだけ):

```jsx
                    <div className="flex gap-2 mb-6 border-b border-slate-700">
                        <button
                            onClick={() => setActiveTab('pipeline')}
                            className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px ' + (activeTab === 'pipeline' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}
                        >
                            案件パイプライン
                        </button>
                        <button
                            onClick={() => setActiveTab('research')}
                            className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px ' + (activeTab === 'research' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}
                        >
                            案件リサーチ
                        </button>
                        <button
                            onClick={() => setActiveTab('compose')}
                            className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px ' + (activeTab === 'compose' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}
                        >
                            営業文作成
                        </button>
                    </div>
```

- [ ] **Step 2: `researchMode`状態を追加する**

以下の既存コード:

```jsx
            const [activeTab, setActiveTab] = useState('pipeline');
```

を、以下に置き換える:

```jsx
            const [activeTab, setActiveTab] = useState('pipeline');
            const [researchMode, setResearchMode] = useState('leads');
```

- [ ] **Step 3: 案件リサーチタブのブロック(サブモード切替+プレースホルダー)を追加する**

以下の既存コード:

```jsx
                        </>
                    )}

                    {activeTab === 'compose' && (
```

を、以下に置き換える(パイプラインタブの終わりと営業文作成タブの始まりの間に、案件リサーチタブのブロックを挿入するだけ):

```jsx
                        </>
                    )}

                    {activeTab === 'research' && (
                        <div>
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setResearchMode('leads')}
                                    className={'px-3 py-1.5 rounded text-sm font-semibold ' + (researchMode === 'leads' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}
                                >
                                    リード発掘
                                </button>
                                <button
                                    onClick={() => setResearchMode('individual')}
                                    className={'px-3 py-1.5 rounded text-sm font-semibold ' + (researchMode === 'individual' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}
                                >
                                    個別下調べ
                                </button>
                            </div>

                            {researchMode === 'leads' && (
                                <div className="text-slate-400 text-sm">準備中です。</div>
                            )}

                            {researchMode === 'individual' && (
                                <div className="text-slate-400 text-sm">準備中です。</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'compose' && (
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由(`python -m http.server`など)で`営業AI社員/index.html`を開く。

1. タブバーが「案件パイプライン」「案件リサーチ」「営業文作成」の3つになっていることを確認
2. 「案件リサーチ」タブを開くと「リード発掘」「個別下調べ」の切替ボタンが表示され、それぞれ「準備中です。」と表示されることを確認
3. サブモードボタンをクリックすると選択中のボタンがハイライトされ、表示内容が切り替わることを確認
4. 「案件パイプライン」「営業文作成」タブの既存機能(追加・編集・削除・生成フォーム等)が壊れていないことを確認
5. コンソールエラーがないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 案件リサーチタブの枠組み(タブ挿入・サブモード切替)を追加"
```

---

### Task 2: 個別下調べモード(Web検索+Web取得、researchNotesへの保存)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1の`researchMode`。既存の`apiKey`, `model`, `deals`, `updateDeal`。
- Produces: `researchCompany(...)`関数。`researchResultText`, `researchSaveDealId`状態。以降のタスクはこれらに依存しない(独立モード)。

- [ ] **Step 1: Web検索・Web取得を使う調査関数を追加する**

`async function generateSalesText({ ... }) { ... }`の閉じ`}`の直後(`function App() {`の直前)に追加:

```jsx

        async function researchCompany({ apiKey, model, query }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当のリサーチ担当です。';
            prompt += '以下の会社について、Web検索を使って調査し、営業アプローチの参考になるよう要約してください。\n\n';
            prompt += `調査対象: ${query}\n\n`;
            prompt += '出力には以下を含めてください:\n';
            prompt += '- 事業内容の概要\n';
            prompt += '- 抱えていそうな課題・ニーズ\n';
            prompt += '- 営業上の接点になりそうな情報(採用状況、最近のニュース、技術スタックなど)\n';
            prompt += '前置きや断り書きは不要です。箇条書き中心で簡潔にまとめてください。';

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
                    max_tokens: 4096,
                    tools: [
                        { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
                        { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 },
                    ],
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const text = (data.content || [])
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim();

            if (!text) {
                throw new Error(data.stop_reason === 'refusal'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : 'APIから調査結果を取得できませんでした。');
            }
            return text;
        }
```

- [ ] **Step 2: `App`内に個別下調べの状態と処理を追加する**

Task 1で追加した以下のコード:

```jsx
            const [activeTab, setActiveTab] = useState('pipeline');
            const [researchMode, setResearchMode] = useState('leads');
```

の直後に追加:

```jsx

            const [researchQuery, setResearchQuery] = useState('');
            const [researchLoading, setResearchLoading] = useState(false);
            const [researchError, setResearchError] = useState('');
            const [researchResultText, setResearchResultText] = useState('');
            const [researchSaveDealId, setResearchSaveDealId] = useState('');

            useEffect(() => {
                if (researchSaveDealId && !deals.some(d => d.id === researchSaveDealId)) {
                    setResearchSaveDealId('');
                }
            }, [deals, researchSaveDealId]);
```

`saveGeneratedText`関数の閉じ`}`の直後(`function addDeal(companyName) {`の直前)に追加:

```jsx

            async function handleResearchIndividual() {
                setResearchLoading(true);
                setResearchError('');
                try {
                    const text = await researchCompany({ apiKey, model, query: researchQuery });
                    setResearchResultText(text);
                } catch (e) {
                    setResearchError(e.message || '調査に失敗しました');
                } finally {
                    setResearchLoading(false);
                }
            }

            function saveResearchNotes() {
                if (!researchSaveDealId || !researchResultText) return;
                const target = deals.find(d => d.id === researchSaveDealId);
                if (!target) return;
                const dateLabel = new Date().toLocaleDateString('ja-JP');
                const entry = `[${dateLabel}]\n${researchResultText}`;
                const merged = target.researchNotes ? `${target.researchNotes}\n\n---\n${entry}` : entry;
                updateDeal(researchSaveDealId, { researchNotes: merged });
            }
```

- [ ] **Step 3: 個別下調べモードのUIを実装する**

Task 1で追加した以下のプレースホルダー:

```jsx
                            {researchMode === 'individual' && (
                                <div className="text-slate-400 text-sm">準備中です。</div>
                            )}
```

を、以下に置き換える:

```jsx
                            {researchMode === 'individual' && (
                                <div>
                                    <div className="mb-4">
                                        <label className="block text-sm text-slate-400 mb-1">会社名またはURL</label>
                                        <input
                                            type="text"
                                            value={researchQuery}
                                            onChange={e => setResearchQuery(e.target.value)}
                                            placeholder="例: 株式会社〇〇 または https://example.com"
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>

                                    <button
                                        onClick={handleResearchIndividual}
                                        disabled={!apiKey || !researchQuery.trim() || researchLoading}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-4 py-2 rounded mb-4"
                                    >
                                        {researchLoading ? '調査中...' : '調査する'}
                                    </button>
                                    {!apiKey && (
                                        <p className="text-slate-500 text-xs mb-4">APIキーが未設定です。右上の設定から入力してください。</p>
                                    )}

                                    {researchError && (
                                        <div className="bg-rose-950 border border-rose-700 text-rose-200 rounded p-3 mb-4 text-sm">
                                            {researchError}
                                        </div>
                                    )}

                                    {researchResultText && (
                                        <div className="mb-4">
                                            <div className="bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap mb-2">
                                                {researchResultText}
                                            </div>
                                            <label className="block text-sm text-slate-400 mb-1">この結果を保存する案件</label>
                                            <select
                                                value={researchSaveDealId}
                                                onChange={e => setResearchSaveDealId(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm mb-2"
                                            >
                                                <option value="">選択してください</option>
                                                {deals.map(d => (
                                                    <option key={d.id} value={d.id}>{d.companyName}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={saveResearchNotes}
                                                disabled={!researchSaveDealId}
                                                className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold px-4 py-2 rounded"
                                            >
                                                この案件のリサーチメモに保存
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。この環境には実際のAnthropic APIキーがないため、Phase 2 Task 3と同じ手法で検証する。

1. **実ネットワーク疎通確認**: 設定で架空のAPIキー(例: `sk-ant-test-invalid-key-000`)を入力し、個別下調べで何か入力して「調査する」を押す。`mcp__Claude_Browser__read_network_requests`または直接`fetch`をJSコンソールで実行し、`tools`パラメータ(web_search・web_fetch)付きのリクエストでも`https://api.anthropic.com/v1/messages`に到達し、CORSブロックではなく通常のHTTPエラー(401等)が返ることを確認する。**この結果を報告に必ず明記すること**
2. **成功パスのモックテスト**: `window.fetch`を以下のように差し替えてから「調査する」を押す(複数のtextブロックが混在するケースを模擬):
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       content: [
           { type: 'server_tool_use', id: 'x', name: 'web_search', input: {} },
           { type: 'web_search_tool_result', tool_use_id: 'x', content: [] },
           { type: 'text', text: '- 事業内容: テスト事業\n' },
           { type: 'text', text: '- 課題: テスト課題\n- 接点: テスト接点' },
       ]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 調査結果欄に、2つのtextブロックが結合された内容(事業内容・課題・接点すべて)が表示されることを確認(server_tool_use/web_search_tool_resultブロックは無視されること)
3. 案件を1件パイプラインに追加した状態で、上記モック結果を「この案件のリサーチメモに保存」する。案件の`researchNotes`に`[日付]`付きで保存されることを確認(直接確認する方法がなければ、営業文作成タブでその案件を選択し、Task 4完了後に反映を確認する形でも可。このタスク時点ではlocalStorageの中身をコンソールで直接確認して問題ない: `JSON.parse(localStorage.getItem('salesPipelineDeals'))`)
4. 同じ案件にもう一度別の調査結果を保存し、既存の`researchNotes`の下に`---`区切りで追記されることを確認(上書きされないこと)
5. ページをリロードして`window.fetch`のモックを解除する
6. コンソールエラーがないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 個別下調べモード(Web検索・Web取得、リサーチメモ保存)を追加"
```

---

### Task 3: リード発掘モード(候補リスト生成・パイプライン追加)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1の`researchMode`。既存の`apiKey`, `model`, `setDeals`。
- Produces: `findLeadCandidates(...)`関数、`addLeadToPipeline(...)`関数。本プランの最終機能タスク。

- [ ] **Step 1: 候補企業を探すAPI呼び出し関数を追加する**

`async function researchCompany({ ... }) { ... }`の閉じ`}`の直後(`function App() {`の直前)に追加:

```jsx

        async function findLeadCandidates({ apiKey, model, keywords }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当です。';
            prompt += 'Web検索を使って、以下の条件に合いそうな新規営業先の候補企業を5〜8社程度探してください。\n\n';
            prompt += `条件・キーワード: ${keywords}\n\n`;
            prompt += '出力は必ず、説明文を一切含めず、以下の形式のJSON配列のみにしてください:\n';
            prompt += '[{"companyName": "会社名", "reason": "候補として挙げた理由(1〜2文)"}, ...]';

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
                    max_tokens: 4096,
                    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const fullText = (data.content || [])
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim();

            if (!fullText) {
                throw new Error(data.stop_reason === 'refusal'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : 'APIから候補を取得できませんでした。');
            }

            const start = fullText.indexOf('[');
            const end = fullText.lastIndexOf(']');
            if (start === -1 || end === -1 || end < start) {
                return { candidates: null, rawText: fullText };
            }
            try {
                const parsed = JSON.parse(fullText.slice(start, end + 1));
                if (!Array.isArray(parsed)) {
                    return { candidates: null, rawText: fullText };
                }
                return {
                    candidates: parsed
                        .filter(c => c && typeof c.companyName === 'string' && c.companyName.trim())
                        .map(c => ({ companyName: c.companyName.trim(), reason: typeof c.reason === 'string' ? c.reason.trim() : '' })),
                    rawText: fullText,
                };
            } catch (e) {
                return { candidates: null, rawText: fullText };
            }
        }
```

- [ ] **Step 2: `App`内にリード発掘の状態と処理を追加する**

Task 2で追加した以下のコード:

```jsx
            useEffect(() => {
                if (researchSaveDealId && !deals.some(d => d.id === researchSaveDealId)) {
                    setResearchSaveDealId('');
                }
            }, [deals, researchSaveDealId]);
```

の直後に追加:

```jsx

            const [leadsKeywords, setLeadsKeywords] = useState('');
            const [leadsLoading, setLeadsLoading] = useState(false);
            const [leadsError, setLeadsError] = useState('');
            const [leadsCandidates, setLeadsCandidates] = useState(null);
            const [leadsRawText, setLeadsRawText] = useState('');
```

Task 2で追加した`handleResearchIndividual`関数の閉じ`}`と`saveResearchNotes`関数の間ではなく、`saveResearchNotes`関数の閉じ`}`の直後(`function addDeal(companyName) {`の直前)に追加:

```jsx

            async function handleFindLeads() {
                setLeadsLoading(true);
                setLeadsError('');
                setLeadsCandidates(null);
                setLeadsRawText('');
                try {
                    const result = await findLeadCandidates({ apiKey, model, keywords: leadsKeywords });
                    setLeadsCandidates(result.candidates);
                    setLeadsRawText(result.rawText);
                } catch (e) {
                    setLeadsError(e.message || '検索に失敗しました');
                } finally {
                    setLeadsLoading(false);
                }
            }

            function addLeadToPipeline(candidate) {
                const trimmed = candidate.companyName.trim();
                if (!trimmed) return;
                const newDeal = {
                    id: crypto.randomUUID(),
                    companyName: trimmed,
                    status: STATUS_OPTIONS[0],
                    nextActionDate: '',
                    memo: '',
                    researchNotes: candidate.reason || '',
                    history: [],
                    createdAt: new Date().toISOString(),
                };
                setDeals(prev => [...prev, newDeal]);
            }
```

(`addLeadToPipeline`は既存の`addDeal`とは別関数にする。`addDeal`は会社名のみを受け取る仕様のままにし、リード発掘由来の案件だけが理由付きで`researchNotes`を初期セットする形にするため)

- [ ] **Step 3: リード発掘モードのUIを実装する**

Task 1で追加した以下のプレースホルダー:

```jsx
                            {researchMode === 'leads' && (
                                <div className="text-slate-400 text-sm">準備中です。</div>
                            )}
```

を、以下に置き換える:

```jsx
                            {researchMode === 'leads' && (
                                <div>
                                    <div className="mb-4">
                                        <label className="block text-sm text-slate-400 mb-1">業界・キーワード</label>
                                        <input
                                            type="text"
                                            value={leadsKeywords}
                                            onChange={e => setLeadsKeywords(e.target.value)}
                                            placeholder="例: 東京 医療系スタートアップ 業務効率化"
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>

                                    <button
                                        onClick={handleFindLeads}
                                        disabled={!apiKey || !leadsKeywords.trim() || leadsLoading}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-4 py-2 rounded mb-4"
                                    >
                                        {leadsLoading ? '検索中...' : '候補を探す'}
                                    </button>
                                    {!apiKey && (
                                        <p className="text-slate-500 text-xs mb-4">APIキーが未設定です。右上の設定から入力してください。</p>
                                    )}

                                    {leadsError && (
                                        <div className="bg-rose-950 border border-rose-700 text-rose-200 rounded p-3 mb-4 text-sm">
                                            {leadsError}
                                        </div>
                                    )}

                                    {leadsCandidates && leadsCandidates.length > 0 && (
                                        <ul className="space-y-2">
                                            {leadsCandidates.map((c, i) => (
                                                <li key={i} className="bg-slate-800 border border-slate-700 rounded p-3 text-sm">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-medium">{c.companyName}</span>
                                                        <button
                                                            onClick={() => addLeadToPipeline(c)}
                                                            className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-3 py-1 rounded"
                                                        >
                                                            + パイプラインに追加
                                                        </button>
                                                    </div>
                                                    {c.reason && (
                                                        <div className="text-slate-400 text-xs">{c.reason}</div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {leadsCandidates && leadsCandidates.length === 0 && (
                                        <p className="text-slate-400 text-sm">候補が見つかりませんでした。キーワードを変えて再試行してください。</p>
                                    )}

                                    {leadsCandidates === null && leadsRawText && (
                                        <div>
                                            <p className="text-amber-400 text-xs mb-2">候補リストの解析に失敗しました。生の応答を表示します。</p>
                                            <div className="bg-slate-800 border border-slate-700 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap">
                                                {leadsRawText}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。

1. **実ネットワーク疎通確認**: 架空のAPIキーで「候補を探す」を押し、`tools`パラメータ付きのリクエストが実際に`https://api.anthropic.com/v1/messages`に到達し、CORSブロックではなくHTTPエラーが返ることを確認する(Task 2 Step 4と同様の手法)。**結果を報告に明記すること**
2. **JSON解析成功パスのモックテスト**: `window.fetch`を以下のように差し替えてから「候補を探す」を押す:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       content: [
           { type: 'text', text: '検索しました。\n\n' },
           { type: 'text', text: '[{"companyName": "テスト株式会社A", "reason": "理由A"}, {"companyName": "テスト株式会社B", "reason": "理由B"}]' },
       ]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 2件の候補が会社名・理由付きで一覧表示されることを確認(複数textブロックにまたがっていても、JSON配列部分が正しく抽出・解析されること)
   - 「+ パイプラインに追加」を押すと、「案件パイプライン」タブにその会社が追加され、`researchNotes`に理由が入っていることを確認(localStorageで確認: `JSON.parse(localStorage.getItem('salesPipelineDeals'))`)
3. **JSON解析失敗パスのモックテスト**: `window.fetch`を以下のように差し替えてから再度実行する:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       content: [{ type: 'text', text: '候補が見つかりませんでした。理由: 検索結果が不十分でした。' }]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 「候補リストの解析に失敗しました。生の応答を表示します。」という注意書きとともに、生のテキストが表示されることを確認(アプリがクラッシュしないこと)
4. ページをリロードして`window.fetch`のモックを解除する
5. コンソールエラーがないことを確認(意図的なテスト用ログを除く)

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: リード発掘モード(候補リスト生成・パイプライン追加)を追加"
```

---

### Task 4: 営業文作成へのリサーチメモ連携(Phase 2拡張)

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: 既存の`generateSalesText`, `handleGenerate`(Phase 2)。Task 2・3で書き込まれる`deal.researchNotes`。
- Produces: なし(既存関数のシグネチャ拡張のみ)。本プランの最終機能タスク。

- [ ] **Step 1: `generateSalesText`にresearchNotesを受け取る引数を追加する**

以下の既存コード:

```jsx
        async function generateSalesText({ apiKey, model, companyName, textType, tone, dealMemo, closedDeals }) {
```

を、以下に置き換える:

```jsx
        async function generateSalesText({ apiKey, model, companyName, textType, tone, dealMemo, dealResearchNotes, closedDeals }) {
```

- [ ] **Step 2: プロンプトにリサーチメモを含める**

以下の既存コード:

```jsx
            if (dealMemo && dealMemo.trim()) {
                prompt += `\n参考情報(この案件のメモ):\n${dealMemo.trim()}\n`;
            }
```

を、以下に置き換える:

```jsx
            if (dealMemo && dealMemo.trim()) {
                prompt += `\n参考情報(この案件のメモ):\n${dealMemo.trim()}\n`;
            }
            if (dealResearchNotes && dealResearchNotes.trim()) {
                prompt += `\n参考情報(この案件のリサーチメモ):\n${dealResearchNotes.trim()}\n`;
            }
```

- [ ] **Step 3: `handleGenerate`の呼び出しにresearchNotesを渡す**

以下の既存コード:

```jsx
                    const result = await generateSalesText({
                        apiKey,
                        model,
                        companyName,
                        textType: composeTextType,
                        tone: composeTone,
                        dealMemo: selectedDeal ? selectedDeal.memo : '',
                        closedDeals,
                    });
```

を、以下に置き換える:

```jsx
                    const result = await generateSalesText({
                        apiKey,
                        model,
                        companyName,
                        textType: composeTextType,
                        tone: composeTone,
                        dealMemo: selectedDeal ? selectedDeal.memo : '',
                        dealResearchNotes: selectedDeal ? selectedDeal.researchNotes : '',
                        closedDeals,
                    });
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。

1. 「案件リサーチ」タブ(個別下調べ、またはリード発掘の「+ パイプラインに追加」)を使って、`researchNotes`が入った案件を1件用意する(Task 2/3のモック手法を再利用してよい)
2. 「営業文作成」タブでその案件を選択し、`window.fetch`を以下のように一時的に差し替えて、実際に送信されるリクエストボディを記録できるようにする:
   ```js
   window.fetch = async (url, opts) => {
       console.log('REQUEST_BODY', opts.body);
       return new Response(JSON.stringify({ content: [{ type: 'text', text: 'テスト本文\n\n### 改善アドバイス\n- テスト' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   };
   ```
3. 「生成」を押し、コンソールに出力された`REQUEST_BODY`の中に、案件の`researchNotes`の内容が含まれていることを確認する
4. `researchNotes`が空の案件(直接会社名入力、または通常のパイプライン追加案件)で生成した場合は、プロンプトに「参考情報(この案件のリサーチメモ)」セクションが含まれないことを確認する(既存の`dealMemo`と同じ空ガード挙動)
5. ページをリロードして`window.fetch`のモックを解除する
6. 通常の生成フロー(モックなし、架空キーでのエラー確認等、Phase 2 Task 3で行った検証)に regression がないことを軽く確認する
7. コンソールエラーがないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 営業文作成のプロンプトにリサーチメモ(researchNotes)を含めるよう連携"
```

---

### Task 5: CLAUDE.mdドキュメント更新

**Files:**
- Modify: `営業AI社員/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜4で完成した案件リサーチタブの機能一覧
- Produces: なし(ドキュメントのみ、本プランの最終タスク)

- [ ] **Step 1: CLAUDE.mdを更新する**

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
案件データは`researchNotes`・`history`フィールドを持つ。`researchNotes`は今後のリサーチ画面実装時に使用予定（現時点では未使用・常に空）。`history`フィールドは営業文作成タブで使用されている（後述）。
```

を、以下に置き換える:

```markdown
案件データは`researchNotes`・`history`フィールドを持つ。`researchNotes`は案件リサーチタブ（後述）で使用され、`history`フィールドは営業文作成タブで使用されている（後述）。
```

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
### 未実装（今後のカテゴリ）
- 案件リサーチ画面（リード発掘・個別下調べ、Claude API Web検索連携）
```

を、以下に置き換える:

```markdown
### 案件リサーチタブ
- ヘッダーに「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成（案件リサーチは中央）。タブ内に「リード発掘」「個別下調べ」の2サブモードを切替ボタンで表示
- **リード発掘**: 業界・キーワードを入力→Claude API（Web検索ツール`web_search_20250305`）が引き合いそうな候補企業をJSON形式で5〜8社程度リストアップ（会社名+理由）。JSON解析に失敗した場合は生の応答テキストをフォールバック表示。各候補の「+ パイプラインに追加」でワンクリックで新規案件を作成し、理由を`researchNotes`に自動保存
- **個別下調べ**: 会社名またはURLを入力→Claude API（Web検索`web_search_20250305`+Web取得`web_fetch_20250910`、入力にURLが含まれる場合は該当ページを直接取得）が事業内容・課題・営業上の接点を要約。既存案件を選択して「この案件のリサーチメモに保存」すると、選択案件の`researchNotes`に日付区切りで追記（上書きしない）
- Web検索・Web取得はユーザーのAnthropic APIキー側で従量課金される機能（トークン費用とは別に検索回数に応じて課金）
- 営業文作成タブの生成プロンプトには、選択中の案件の`researchNotes`も自動的に含まれる（メモと同様、空なら該当セクションを省略）

計画していた3カテゴリ（案件パイプライン・案件リサーチ・営業文作成）はすべて実装済み。今後の機能追加はユーザーの指示ベースで検討する。
```

- [ ] **Step 2: コミット**

```bash
git add "営業AI社員/CLAUDE.md"
git commit -m "営業AI社員: CLAUDE.mdに案件リサーチタブの説明を追記"
```
