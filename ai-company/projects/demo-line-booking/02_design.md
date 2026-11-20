# 設計書：demo-line-booking（ダミー）
- 構成: LINE公式 → Googleフォーム → GAS → スプレッドシート + サロンへメール通知
- GASトリガー: フォーム送信時（onFormSubmit）/ 前日リマインド用の日次トリガー（毎日 18:00）
- 実装は動作確認の対象外（line-architect / compliance-checker / maintainer の確認が目的）
