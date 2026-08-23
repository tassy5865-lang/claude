# 営業AI社員 - Gemini API移行(検索機能なし版) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「営業AI社員」の全AI機能(営業文作成・案件リサーチ)をClaude APIからGoogle Gemini APIに置き換え、ユーザーがClaude APIキーなしで全機能を使えるようにする。あわせて、案件リサーチのWeb検索連携(Claude固有機能)は削除し、AIの学習知識のみに基づく推測に切り替える(検索機能なし版であることを画面上に明示)。

**Architecture:** 既存の`営業AI社員/index.html`(単一HTML、CDN経由React 18 + Babel Standalone + Tailwind CSS、サーバーなし)の中身を、リポジトリ内の`AI-OCR/index.html`で既に実績のあるGoogle Gemini API呼び出しパターン(`generateContent`エンドポイント、APIキーはクエリパラメータ、構造化出力は`responseSchema`)に統一する。Claude Messages API・`web_search`/`web_fetch`ツール・`pause_turn`処理は全て削除する。UI構成(3タブ・パイプライン機能・データモデル)は変更しない。

**Tech Stack:** HTML / React 18 (UMD, CDNモード) / Babel Standalone / Tailwind CSS(CDN) / localStorage / Google Gemini API(`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`、生fetch呼び出し)。ビルドツールなし。

**Spec:** [docs/superpowers/specs/2026-08-20-sales-ai-employee-design.md](../specs/2026-08-20-sales-ai-employee-design.md)(元の設計。本プランはユーザーの追加要望により、その後の実装からClaude→Geminiへの置き換え・検索機能の削除を行う)

## Global Constraints

- 単一HTMLファイル(`営業AI社員/index.html`)構成を維持する。サーバーを追加しない。新規CDN依存を追加しない
- AI呼び出しは全て`AI-OCR/index.html`と同じGemini `generateContent`パターンに統一する(エンドポイント・APIキーのクエリパラメータ渡し・リクエスト/レスポンス形状)
- モデルプリセットは`AI-OCR`と同じ3種(`gemini-flash-latest`[デフォルト]/`gemini-flash-lite-latest`/`gemini-pro-latest`)+カスタム入力欄。localStorageキーも`AI-OCR`と同じ命名規則に合わせ`geminiApiKey`・`geminiModel`とする
- Claude Messages API・`anthropic-dangerous-direct-browser-access`ヘッダー・`web_search_20250305`/`web_fetch_20250910`ツール・`pause_turn`処理(`callClaudeWithTools`関数含む)は全て削除する
- 案件リサーチ(個別下調べ・リード発掘)はWeb検索を行わない。AIの学習知識のみに基づく推測であることをプロンプトで明示し、画面上にも警告バナーを表示する(ユーザーへの誠実な情報開示)
- リード発掘の候補リストは、Claude版で使っていた文字列からのJSON抜き出し(`indexOf('[')`/`lastIndexOf(']')`)ではなく、Geminiの構造化出力機能(`responseMimeType: 'application/json'` + `responseSchema`)を使う。ただしパース失敗時のフォールバック(生テキスト表示)は維持する
- パイプライン機能・データモデル(`researchNotes`・`history`フィールド等)・タブ構成・UI文言(ラベル・ボタン名等、APIプロバイダに関係しない部分)は変更しない

---

## File Structure

- Modify: `営業AI社員/index.html` — 設定UI・`generateSalesText`・`researchCompany`・`findLeadCandidates`をGemini方式に置き換え、`callClaudeWithTools`を削除
- Modify: `営業AI社員/CLAUDE.md` — Gemini方式への移行、検索機能なしの制約を反映

## Interfaces (全タスク共通)

Gemini `generateContent`呼び出しの共通形:

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
Headers: { 'Content-Type': 'application/json' }
Body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig?: {...} }
Response: data.candidates[0].content.parts[].text (複数partsがあれば連結), data.candidates[0].finishReason
```

localStorageキー(変更後): `geminiApiKey`(文字列)、`geminiModel`(文字列)。

---

### Task 1: 設定UIをGemini方式に置き換え

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: なし(最初のタスク)
- Produces: `MODEL_PRESETS`(Gemini版)、`DEFAULT_MODEL`(`gemini-flash-latest`)、`loadApiKey`/`loadModel`(localStorageキー`geminiApiKey`/`geminiModel`)。以降の全タスクがこれを使う。

- [ ] **Step 1: モデルプリセット・localStorage読み込みヘルパーをGemini版に置き換える**

以下の既存コード:

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

を、以下に置き換える:

```jsx
        const MODEL_PRESETS = [
            { label: 'Gemini Flash(標準・推奨)', value: 'gemini-flash-latest' },
            { label: 'Gemini Flash-Lite(高速・低コスト)', value: 'gemini-flash-lite-latest' },
            { label: 'Gemini Pro(高精度)', value: 'gemini-pro-latest' },
        ];
        const DEFAULT_MODEL = 'gemini-flash-latest';

        function loadApiKey() {
            try {
                return localStorage.getItem('geminiApiKey') || '';
            } catch (e) {
                return '';
            }
        }

        function loadModel() {
            try {
                return localStorage.getItem('geminiModel') || DEFAULT_MODEL;
            } catch (e) {
                return DEFAULT_MODEL;
            }
        }
```

- [ ] **Step 2: `App`内のlocalStorage保存先キーをGemini版に置き換える**

以下の既存コード:

```jsx
            useEffect(() => {
                try { localStorage.setItem('claudeApiKey', apiKey); } catch (e) {}
            }, [apiKey]);

            useEffect(() => {
                try { localStorage.setItem('claudeModel', model); } catch (e) {}
            }, [model]);
```

を、以下に置き換える:

```jsx
            useEffect(() => {
                try { localStorage.setItem('geminiApiKey', apiKey); } catch (e) {}
            }, [apiKey]);

            useEffect(() => {
                try { localStorage.setItem('geminiModel', model); } catch (e) {}
            }, [model]);
```

- [ ] **Step 3: 設定モーダルのラベル・プレースホルダーをGemini向けに変更する**

以下の既存コード:

```jsx
                                <h2 className="text-lg font-bold mb-4">API設定</h2>
                                <label className="block text-sm text-slate-400 mb-1">Claude APIキー</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-ant-..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
                                />
```

を、以下に置き換える:

```jsx
                                <h2 className="text-lg font-bold mb-4">API設定</h2>
                                <label className="block text-sm text-slate-400 mb-1">Gemini APIキー</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="AIza..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
                                />
```

(`MODEL_PRESETS`を参照しているカスタムモデル選択のロジック自体はプロバイダに依存しないため変更不要)

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由(`python -m http.server`など)で`営業AI社員/index.html`を開く。

1. 右上の「⚙️ 設定」を開き、「Gemini APIキー」というラベルとプレースホルダー`AIza...`が表示されていることを確認
2. モデルのプルダウンにGeminiの3プリセット(Gemini Flash/Flash-Lite/Pro)が表示され、デフォルトで「Gemini Flash」が選択されていることを確認
3. カスタムモデル選択が引き続き動作することを確認(Task 1のPhase 2時点の挙動と同じ)
4. 適当なAPIキーを入力してリロードし、値が保持されていること、保存先が`localStorage.getItem('geminiApiKey')`/`geminiModel`であることをJSコンソールで確認(`claudeApiKey`ではないこと)
5. 既存のパイプライン機能が壊れていないことを確認
6. コンソールエラーがないことを確認

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: API設定をGemini方式に置き換え"
```

---

### Task 2: 営業文作成をGemini方式に置き換え

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1完了後の`apiKey`, `model`(Geminiキー・モデル)
- Produces: なし(既存関数`generateSalesText`のシグネチャ・呼び出し側は変更しない。内部実装のみ置き換え)

- [ ] **Step 1: `generateSalesText`のAPI呼び出し部分をGemini方式に置き換える**

以下の既存コード(プロンプト構築部分より後、`generateSalesText`関数内):

```jsx
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

            if (!fullText.trim()) {
                throw new Error(data.stop_reason === 'refusal'
                    ? 'AIが生成を拒否しました。内容を変えて再試行してください。'
                    : 'APIから本文を取得できませんでした。');
            }
```

を、以下に置き換える(この後に続くマーカー分割ロジックは一切変更しない):

```jsx
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const candidate = (data.candidates || [])[0];
            const fullText = candidate && candidate.content && candidate.content.parts
                ? candidate.content.parts.map(p => p.text || '').join('')
                : '';

            if (!fullText.trim()) {
                throw new Error(candidate && candidate.finishReason === 'SAFETY'
                    ? 'AIが生成を拒否しました。内容を変えて再試行してください。'
                    : 'APIから本文を取得できませんでした。');
            }
```

- [ ] **Step 2: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。この環境には実際のGemini APIキーがないため、以下の方法で検証する。

1. **実ネットワーク疎通確認**: 設定で架空のAPIキー(例: `AIza-test-invalid-key-000`)を入力し、「営業文作成」タブで「生成」を押す。`mcp__Claude_Browser__read_network_requests`で`https://generativelanguage.googleapis.com/v1beta/models/...`へのリクエストが実際に送信され、HTTPエラー(400/403等)が返ってくることを確認する(Gemini APIはクエリパラメータでキーを渡すためCORS絡みの懸念はClaudeより小さいはずだが、念のため実際に確認すること)。**結果を報告に明記すること**
2. **成功パスのモックテスト**: `window.fetch`を以下のように差し替えてから「生成」を押す:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       candidates: [{
           content: { parts: [{ text: '拝啓\n\nテスト本文です。\n\n敬具\n\n### 改善アドバイス\n- テスト' }] },
           finishReason: 'STOP',
       }]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 「生成された文章」欄に本文のみ、「改善アドバイス」欄にアドバイスのみが表示され、マーカー分割が引き続き正しく機能することを確認
3. ページをリロードして`window.fetch`のモックを解除する
4. コンソールエラーがないことを確認

- [ ] **Step 3: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 営業文作成をGemini方式に置き換え"
```

---

### Task 3: 案件リサーチをGemini方式(検索機能なし)に置き換え

**Files:**
- Modify: `営業AI社員/index.html`

**Interfaces:**
- Consumes: Task 1完了後の`apiKey`, `model`。既存の`researchMode`, `leadsCandidates`等の状態(変更しない)
- Produces: なし(既存関数`researchCompany`・`findLeadCandidates`のシグネチャ・呼び出し側は変更しない。内部実装を全面置き換え、`callClaudeWithTools`を削除)

- [ ] **Step 1: `callClaudeWithTools`を削除し、`researchCompany`をGemini方式(検索なし)に置き換える**

以下の既存コード全体(`callClaudeWithTools`関数と`researchCompany`関数の両方)を:

```jsx
        async function callClaudeWithTools({ apiKey, model, prompt, tools, maxTokens }) {
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            };
            let messages = [{ role: 'user', content: prompt }];
            let data;
            let continuations = 0;
            const MAX_CONTINUATIONS = 3;
            while (true) {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ model: model, max_tokens: maxTokens, tools: tools, messages: messages }),
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
                }

                data = await response.json();
                if (data.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
                    messages = [...messages, { role: 'assistant', content: data.content }];
                    continuations++;
                    continue;
                }
                break;
            }
            return data;
        }

        async function researchCompany({ apiKey, model, query }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当のリサーチ担当です。';
            prompt += '以下の会社について、Web検索を使って調査し、営業アプローチの参考になるよう要約してください。\n\n';
            prompt += `調査対象: ${query}\n\n`;
            prompt += '調査対象がURLの場合は、Web取得ツールでそのページの内容を直接確認したうえで要約に反映してください。\n';
            prompt += '出力には以下を含めてください:\n';
            prompt += '- 事業内容の概要\n';
            prompt += '- 抱えていそうな課題・ニーズ\n';
            prompt += '- 営業上の接点になりそうな情報(採用状況、最近のニュース、技術スタックなど)\n';
            prompt += '前置きや断り書きは不要です。箇条書き中心で簡潔にまとめてください。';

            const data = await callClaudeWithTools({
                apiKey,
                model,
                prompt,
                maxTokens: 4096,
                tools: [
                    { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
                    { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 },
                ],
            });

            const text = (data.content || [])
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim();

            if (data.stop_reason === 'pause_turn') {
                const note = '\n\n[注意: 検索回数の上限に達したため、調査が完了しないまま打ち切られました。結果は不完全な可能性があります。]';
                return (text || '(調査結果を取得できませんでした)') + note;
            }

            if (!text) {
                throw new Error(data.stop_reason === 'refusal'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : 'APIから調査結果を取得できませんでした。');
            }
            return text;
        }
```

以下に置き換える:

```jsx
        async function researchCompany({ apiKey, model, query }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当のリサーチ担当です。';
            prompt += 'あなたが学習時点で知っている情報の範囲で、以下の会社について営業アプローチの参考になるよう要約してください。\n';
            prompt += 'あなたはインターネットに接続できないため、最新情報の確認や実在確認はできません。知らない場合や自信がない場合は、推測であることを明記するか、正直に「情報が見つかりませんでした」と書いてください。\n\n';
            prompt += `調査対象: ${query}\n\n`;
            prompt += '出力には以下を含めてください:\n';
            prompt += '- 事業内容の概要\n';
            prompt += '- 抱えていそうな課題・ニーズ\n';
            prompt += '- 営業上の接点になりそうな情報\n';
            prompt += '前置きや断り書き(上記の免責事項以外)は不要です。箇条書き中心で簡潔にまとめてください。';

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const candidate = (data.candidates || [])[0];
            const text = candidate && candidate.content && candidate.content.parts
                ? candidate.content.parts.map(p => p.text || '').join('').trim()
                : '';

            if (!text) {
                throw new Error(candidate && candidate.finishReason === 'SAFETY'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : 'APIから調査結果を取得できませんでした。');
            }
            return text;
        }
```

- [ ] **Step 2: `findLeadCandidates`をGemini方式(構造化出力・検索なし)に置き換える**

以下の既存コード全体(`findLeadCandidates`関数)を:

```jsx
        async function findLeadCandidates({ apiKey, model, keywords }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当です。';
            prompt += 'Web検索を使って、以下の条件に合いそうな新規営業先の候補企業を5〜8社程度探してください。\n\n';
            prompt += `条件・キーワード: ${keywords}\n\n`;
            prompt += '出力は必ず、説明文を一切含めず、以下の形式のJSON配列のみにしてください:\n';
            prompt += '[{"companyName": "会社名", "reason": "候補として挙げた理由(1〜2文)"}, ...]';

            const data = await callClaudeWithTools({
                apiKey,
                model,
                prompt,
                maxTokens: 4096,
                tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
            });

            const fullText = (data.content || [])
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim();

            if (!fullText) {
                throw new Error(data.stop_reason === 'refusal'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : data.stop_reason === 'pause_turn'
                        ? '検索回数の上限に達したため、候補を取得できませんでした。キーワードを絞って再試行してください。'
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

以下に置き換える:

```jsx
        async function findLeadCandidates({ apiKey, model, keywords }) {
            let prompt = 'あなたは受託・フリーランスで開発の仕事をしている営業担当です。';
            prompt += 'あなたが学習時点で知っている情報の範囲で、以下の条件に合いそうな新規営業先の候補企業を5〜8社程度、思いつく限り挙げてください。\n';
            prompt += 'あなたはインターネットに接続できないため、実在確認や最新の企業状況は確認できません。実在するかどうか確信が持てない場合でも、条件に近そうな候補として挙げて構いません。\n\n';
            prompt += `条件・キーワード: ${keywords}`;

            const schema = {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        companyName: { type: 'STRING' },
                        reason: { type: 'STRING' },
                    },
                    required: ['companyName', 'reason'],
                },
            };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: schema,
                    },
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`API呼び出しに失敗しました (${response.status}): ${errBody}`);
            }

            const data = await response.json();
            const candidate = (data.candidates || [])[0];
            const fullText = candidate && candidate.content && candidate.content.parts
                ? candidate.content.parts.map(p => p.text || '').join('').trim()
                : '';

            if (!fullText) {
                throw new Error(candidate && candidate.finishReason === 'SAFETY'
                    ? 'AIが調査を拒否しました。内容を変えて再試行してください。'
                    : 'APIから候補を取得できませんでした。');
            }

            try {
                const parsed = JSON.parse(fullText);
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

- [ ] **Step 3: 案件リサーチタブに「検索機能なし」警告バナーを追加する**

以下の既存コード:

```jsx
                                <button
                                    onClick={() => setResearchMode('individual')}
                                    className={'px-3 py-1.5 rounded text-sm font-semibold ' + (researchMode === 'individual' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}
                                >
                                    個別下調べ
                                </button>
                            </div>

                            {researchMode === 'leads' && (
```

を、以下に置き換える(サブモード切替ボタンの直後、両モード共通の警告バナーを挿入するだけ):

```jsx
                                <button
                                    onClick={() => setResearchMode('individual')}
                                    className={'px-3 py-1.5 rounded text-sm font-semibold ' + (researchMode === 'individual' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}
                                >
                                    個別下調べ
                                </button>
                            </div>

                            <div className="bg-amber-950 border border-amber-700 text-amber-200 rounded p-3 mb-4 text-sm">
                                ⚠️ この機能はWeb検索を行いません。AIの学習知識のみに基づく推測です。情報が古い・不正確な場合や、候補企業が実在しない場合があります。必ずご自身で最新情報・実在確認を行ってください。
                            </div>

                            {researchMode === 'leads' && (
```

- [ ] **Step 4: ブラウザで動作確認する**

ローカルHTTPサーバー経由で開く。

1. 「案件リサーチ」タブを開き、両サブモードで警告バナーが表示されることを確認
2. **実ネットワーク疎通確認**: 架空のAPIキーで「調査する」「候補を探す」それぞれを押し、`https://generativelanguage.googleapis.com/v1beta/models/...`へのリクエストが実際に送信され、HTTPエラーが返ってくることを確認する。**結果を報告に明記すること**
3. **個別下調べの成功パスのモックテスト**: `window.fetch`を以下のように差し替えてから「調査する」を押す:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       candidates: [{ content: { parts: [{ text: '- 事業内容: テスト事業\n- 課題: テスト課題' }] }, finishReason: 'STOP' }]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 調査結果が表示されることを確認
4. **リード発掘の成功パスのモックテスト**: `window.fetch`を以下のように差し替えてから「候補を探す」を押す:
   ```js
   window.fetch = async (url, opts) => new Response(JSON.stringify({
       candidates: [{
           content: { parts: [{ text: '[{"companyName": "テスト株式会社A", "reason": "理由A"}, {"companyName": "テスト株式会社B", "reason": "理由B"}]' }] },
           finishReason: 'STOP',
       }]
   }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   ```
   - 2件の候補が表示され、「+ パイプラインに追加」で案件に追加されることを確認
5. ページをリロードして`window.fetch`のモックを解除する
6. コンソールエラーがないことを確認(`callClaudeWithTools`の参照が残っていないことも確認: `grep -n callClaudeWithTools 営業AI社員/index.html`が何もヒットしないこと)

- [ ] **Step 5: コミット**

```bash
git add "営業AI社員/index.html"
git commit -m "営業AI社員: 案件リサーチをGemini方式(検索機能なし)に置き換え"
```

---

### Task 4: CLAUDE.mdドキュメント更新

**Files:**
- Modify: `営業AI社員/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜3で完成したGemini移行後の機能一覧
- Produces: なし(ドキュメントのみ、本プランの最終タスク)

- [ ] **Step 1: CLAUDE.mdをGemini移行後の内容に更新する**

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSSを使用。サーバーなし、GitHub Pagesでそのまま公開できる。AI機能（営業文作成・案件リサーチ）はClaude Messages API（`https://api.anthropic.com/v1/messages`）を`fetch`でブラウザから直接呼び出す方式（`anthropic-dangerous-direct-browser-access: true`ヘッダーを付与）。APIキー・使用モデルはユーザーがブラウザ内で入力し、localStorageにのみ保存（キー: `claudeApiKey`, `claudeModel`）。
```

を、以下に置き換える:

```markdown
## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSSを使用。サーバーなし、GitHub Pagesでそのまま公開できる。AI機能（営業文作成・案件リサーチ）はGoogle Gemini API（`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`、リポジトリ内`AI-OCR`と同じ方式）を`fetch`でブラウザから直接呼び出す（APIキーはクエリパラメータで渡す）。APIキー・使用モデルはユーザーがブラウザ内で入力し、localStorageにのみ保存（キー: `geminiApiKey`, `geminiModel`）。**2026-08-23時点でClaude APIからGeminiに全面移行**（Claude APIキーが不要になった）。
```

`営業AI社員/CLAUDE.md`の以下の既存部分:

```markdown
### 営業文作成タブ
- ヘッダーの「営業文作成」タブ（現在は「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成）。タブ切替はページリロードでリセットされ、選択状態は保存しない
- 右上の「⚙️ 設定」からClaude APIキー・使用モデル（プリセット3種: Claude Sonnet 5[デフォルト]/Claude Opus 5/Claude Haiku 4.5 + カスタム入力）を設定（localStorageのみ保存、未設定時はボタン無効化＋赤丸バッジ）
- パイプラインの案件を選択（または会社名を直接入力）→文章種別（提案・アプローチメール/見積もり・提案書/フォローアップ・返信文）を選択→トーン・要望を自由テキストで入力（任意）→「生成」でClaude APIを呼び出し、営業文を生成
- 案件を選択している場合、その案件のメモとリサーチメモ、パイプライン内の受注/失注案件の傾向をプロンプトに含める（勝率アドバイスの材料）
- 生成結果は本文（編集可能）と改善アドバイス（プロンプト内で固定見出し「### 改善アドバイス」により分離）の2エリアに分けて表示
- 「この案件の履歴に保存」で、選択中の案件の`history`配列に生成結果を追記。案件選択時、その案件の過去の生成履歴を一覧表示

### 案件リサーチタブ
- ヘッダーに「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成（案件リサーチは中央）。タブ内に「リード発掘」「個別下調べ」の2サブモードを切替ボタンで表示
- **リード発掘**: 業界・キーワードを入力→Claude API（Web検索ツール`web_search_20250305`）が引き合いそうな候補企業をJSON形式で5〜8社程度リストアップ（会社名+理由）。JSON解析に失敗した場合は生の応答テキストをフォールバック表示。各候補の「+ パイプラインに追加」でワンクリックで新規案件を作成し、理由を`researchNotes`に自動保存
- **個別下調べ**: 会社名またはURLを入力→Claude API（Web検索`web_search_20250305`+Web取得`web_fetch_20250910`、入力にURLが含まれる場合は該当ページを直接取得）が事業内容・課題・営業上の接点を要約。既存案件を選択して「この案件のリサーチメモに保存」すると、選択案件の`researchNotes`に日付区切りで追記（上書きしない）
- Web検索・Web取得はユーザーのAnthropic APIキー側で従量課金される機能（トークン費用とは別に検索回数に応じて課金）
- 営業文作成タブの生成プロンプトには、選択中の案件の`researchNotes`も自動的に含まれる（メモと同様、空なら該当セクションを省略）

計画していた3カテゴリ（案件パイプライン・案件リサーチ・営業文作成）はすべて実装済み。今後の機能追加はユーザーの指示ベースで検討する。
```

を、以下に置き換える:

```markdown
### 営業文作成タブ
- ヘッダーの「営業文作成」タブ（現在は「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成）。タブ切替はページリロードでリセットされ、選択状態は保存しない
- 右上の「⚙️ 設定」からGemini APIキー・使用モデル（プリセット3種: Gemini Flash[デフォルト]/Gemini Flash-Lite/Gemini Pro + カスタム入力）を設定（localStorageのみ保存、未設定時はボタン無効化＋赤丸バッジ）
- パイプラインの案件を選択（または会社名を直接入力）→文章種別（提案・アプローチメール/見積もり・提案書/フォローアップ・返信文）を選択→トーン・要望を自由テキストで入力（任意）→「生成」でGemini APIを呼び出し、営業文を生成
- 案件を選択している場合、その案件のメモとリサーチメモ、パイプライン内の受注/失注案件の傾向をプロンプトに含める（勝率アドバイスの材料）
- 生成結果は本文（編集可能）と改善アドバイス（プロンプト内で固定見出し「### 改善アドバイス」により分離）の2エリアに分けて表示
- 「この案件の履歴に保存」で、選択中の案件の`history`配列に生成結果を追記。案件選択時、その案件の過去の生成履歴を一覧表示

### 案件リサーチタブ
- ヘッダーに「案件パイプライン」「案件リサーチ」「営業文作成」の3タブ構成（案件リサーチは中央）。タブ内に「リード発掘」「個別下調べ」の2サブモードを切替ボタンで表示
- **検索機能なし**: WebSearch/Web取得は行わない。AIの学習知識のみに基づく推測であり、画面上に警告バナーを常時表示している。情報が古い・不正確、候補企業が実在しない可能性がある点をユーザーに明示（2026-08-23、Claude→Gemini移行時にWeb検索機能ごと削除。Gemini側のWeb検索連携仕様が調査時点で確認できなかったため）
- **リード発掘**: 業界・キーワードを入力→Gemini APIが学習知識の範囲で候補企業を5〜8社程度リストアップ（会社名+理由）。構造化出力（`responseSchema`）でJSON配列として取得。パース失敗時は生の応答テキストをフォールバック表示。各候補の「+ パイプラインに追加」でワンクリックで新規案件を作成し、理由を`researchNotes`に自動保存
- **個別下調べ**: 会社名またはURLを入力→Gemini APIが学習知識の範囲で事業内容・課題・営業上の接点を要約。既存案件を選択して「この案件のリサーチメモに保存」すると、選択案件の`researchNotes`に日付区切りで追記（上書きしない）
- 営業文作成タブの生成プロンプトには、選択中の案件の`researchNotes`も自動的に含まれる（メモと同様、空なら該当セクションを省略）

計画していた3カテゴリ（案件パイプライン・案件リサーチ・営業文作成）はすべて実装済み。今後の機能追加はユーザーの指示ベースで検討する。
```

- [ ] **Step 2: コミット**

```bash
git add "営業AI社員/CLAUDE.md"
git commit -m "営業AI社員: CLAUDE.mdをGemini移行後の内容に更新"
```
