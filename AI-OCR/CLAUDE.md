# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## プロジェクト概要

画像・PDFファイルをアップロードし、AI（Claude等）でOCR・文字起こしを行うWebツール。

## 技術スタック

単一HTML（index.html）だが、CDN経由でReact 18 + Babel Standalone（JSXをブラウザ内変換）+ Tailwind CSS + Lucide Icons + PDF.js を使用。OCRはGoogle Gemini API（gemini-2.5-flash-preview-09-2025）を直接呼び出す方式。

※旧方針（APIキー不要・プロンプト生成してAIチャットに手動貼り付け）から全面移行済み。Gemini APIキーはユーザーがブラウザ内で入力し、localStorageにのみ保存する（サーバー送信なし）。

## 現在の状態

領域指定OCR方式で実装済み。
- PDF/画像アップロード、PDFはページごとにcanvasへ画像化
- 複数ページ帳票の「1レコード＝Nページ」構成をAIが自動判定
- プレビュー画像上でドラッグして抽出領域（バウンディングボックス）を作成・移動・リサイズ
- 「AI自動特定」ボタンで抽出領域そのものをAIに検出させることも可能
- 領域ごとにテキスト／チェックボックス／丸囲みの3種の読み取りタイプを指定可能
- 抽出結果はレコード単位で確認・手動修正でき、CSV一括出力
- 抽出領域の設定はGoogle Apps Script（GAS）のWebアプリ経由でテンプレートとしてクラウド保存・再利用可能（任意設定）
- Gemini APIキー・GAS URLは画面右上の設定アイコンから入力（未設定時は赤丸バッジ表示）
- 使用するGeminiモデルは設定画面でプリセット（Flash/Flash-Lite/Pro）から選択、またはカスタムのモデル名を直接入力可能。選択中のモデル名はヘッダーにバッジ表示

## 進め方の注意

機能は一気に全部作らず、ユーザーが指定した1カテゴリずつ進める。
