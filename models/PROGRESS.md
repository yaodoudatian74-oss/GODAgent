# GODAgent オリジナル小型モデル群 — 進捗 (PROGRESS)

社長のご指示により、GODAgentの4つのAI社員チーム向けに「役割特化のオリジナル小型AIモデル群」を
一から制作する。毎日 00:50 JST に、この PROGRESS.md と git の状態を見て**続きから**少しずつ進める。

## 方針・制約（確定）
- すべて自作のオリジナル。オフライン・ログイン不要で端末上（transformers.js / ONNX Runtime WASM）で動く。
- 既存の HFモデル・UI・37人社員機能・既存挙動は壊さない（追加のみ）。
- 第12章厳守：偽の生成・偽の進捗・ダミー禁止。能力の限界は正直に明記する。

## 正直な能力説明（重要）
本環境は実機・GPU・大規模学習基盤が無いため、ここで作るのは**小型の統計的言語モデル
（bigram マルコフ連鎖 LM）**です。役割ごとの小さな日本語コーパスから次トークン遷移を学習し、
ONNX 形式（transformers.js 互換）で出力します。
- できること：役割に沿った短い語の並び（アイデア/プロンプト/台本の種）を**実際に生成**する。
  温度付きサンプリングで出力が変化する。完全オフライン・ログイン不要・軽量（数十KB〜）。
- できないこと：文脈理解・推論・長文の一貫性は持たない（大規模LLMの代替ではない）。
  この限界はアプリUIにも明記する。

## 技術メモ
- 生成器：`models/build_models.py`（`web/e2e/fixtures/make_tiny_model.py` の方式を一般化）。
  コーパス `models/corpus/<role>.txt`（空白区切りトークンの文、各文の先頭に `<|assistant|>` を補う）
  から bigram を数え、`logits = Gather(logW, input_ids)` の ONNX を構築。KVキャッシュ形状は
  transformers.js 互換（past/present key|value）。tokenizer は WordLevel。
- 検証：`onnxruntime` で貪欲デコードを数ステップ回し、復号テキストを確認（ブラウザ不要）。
- 出力先：`models/dist/<model-id>/`（config.json, tokenizer.json, generation_config.json, onnx/model_q4.onnx）。

## モデル計画（4チーム役割特化 + 共有1）
| ID | 役割 | 対象チーム | 状態 |
|----|------|-----------|------|
| godagent-game-idea   | ゲームのアイデア/コンセプトの種を生成 | ゲーム開発 | 生成・推論検証済（統合待ち） |
| godagent-image-prompt| 画像生成プロンプトの種を生成         | 画像作成   | 生成・推論検証済（統合待ち） |
| godagent-video-script| 動画の台本/絵コンテの種を生成         | 動画作成   | 生成・推論検証済（統合待ち） |
| godagent-edit-plan   | 動画編集プランの語彙を生成           | 本格動画編集 | 生成・推論検証済（統合待ち） |
| godagent-router      | 依頼をチームに振り分ける語を生成（補助）| 共有       | 生成・推論検証済（統合待ち） |

## 作業ログ
- (初回・2026-11-28 00:50 JST) models/ 基盤を作成。build_models.py と game コーパスを用意。
  1つ目 `godagent-game-idea`（語彙82・ONNX 30KB）を生成し、onnxruntime で貪欲デコードを実行して
  実推論を確認：生成結果「かわいい動物を集める収集ゲーム。」（モデルが生成、ハードコードではない）。
- (初回・続き) 残り4モデルも同じ手法で生成・onnxruntime検証：
  - image-prompt（語彙86）: 「幻想的な夜空と輝く星、やわらかい光…」（貪欲だと語の繰り返しが出る）
  - video-script（語彙89）: 「オープニングで始める。」
  - edit-plan（語彙70）: 「不要な部分を入れる。」
  - router（語彙43）: 「ゲームや遊べるものの依頼はゲーム開発チームに任せる。」
  → 生成フェーズ（5/5）完了。貪欲デコードでは繰り返し/短文になりやすい（bigramの限界）。
  → 次回はアプリ統合：hf.ts に内蔵モデル読込＋温度サンプリング＋繰り返し抑制
     （repetition penalty / no_repeat_ngram）を追加して出力品質を上げ、各チームに配線する。

## 残作業（次回以降）
1. 残りのモデル（image-prompt / video-script / edit-plan / router）のコーパス作成と生成・検証。
2. アプリ統合：`web/src/localai/` に「GODAgent専用（内蔵）モデル」を追加し、
   allowLocalModels 経由でバンドル読込。各チームから利用（大量同時ロード回避＝キュー/共有）。
   生成は温度付きサンプリング対応を hf.ts に追加（既存のHF生成は非破壊）。
3. ModelsPane にオリジナルモデルの表示（能力の限界を明記）。
4. 標準＋難読化ビルドで動作検証（ページエラー0、実推論）。dist-standalone/dist-artifact/APK 再ビルド。
5. 全完成で本予約（trig...「毎日・続きから」）を enabled=false にして完了報告。
