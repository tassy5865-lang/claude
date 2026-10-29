import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "projects", "demo-csv-summary", "src", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);

if (!scriptMatch) throw new Error("HTML内のscriptを取得できませんでした。");

const elements = new Map([
  ["calculate", { addEventListener() {} }],
  ["csvInput", { value: "" }],
  ["result", { className: "", textContent: "" }],
]);
const context = vm.createContext({
  document: { getElementById: id => elements.get(id) },
  Number,
  Error,
});
vm.runInContext(scriptMatch[1], context);

const normal = context.summarizeCsv("項目,金額\nA,100\nB,250");
if (normal.count !== 2 || normal.total !== 350) throw new Error("正常系の集計結果が不正です。");

// 空行は集計から除外し、件数・合計は空行がないときと一致する（要件 T-04）
const withBlank = context.summarizeCsv("項目,金額\nA,100\n\nB,250\n");
if (withBlank.count !== 2 || withBlank.total !== 350) throw new Error("空行を含む正常系の集計結果が不正です。");

for (const [name, input, expected] of [
  ["空入力", "", "ヘッダーと1行以上"],
  ["非数値", "項目,金額\nA,abc", "2行目"],
  // 空行を挟むと不正行は元の3行目。空行除去後のindex（2行目）ではない。
  ["空行＋非数値の行番号", "項目,金額\n\nA,abc", "3行目"],
  // 各セルは有限でも合計がInfinityに達したらエラーにする。
  ["合計オーバーフロー", "項目,金額\nA,1e308\nB,1e308", "範囲を超え"],
]) {
  let message = "";
  try {
    context.summarizeCsv(input);
  } catch (error) {
    message = error.message;
  }
  if (!message.includes(expected)) throw new Error(`${name}のエラー処理が不正です: ${message}`);
}

if (/\b(fetch|XMLHttpRequest|localStorage)\b|https?:\/\//.test(scriptMatch[1])) {
  throw new Error("外部通信または永続保存につながる実装を検出しました。");
}

console.log("PASS demo-csv-summary: normal, blank-line, empty, invalid-number, original-line-number, overflow, no-external-I/O");
