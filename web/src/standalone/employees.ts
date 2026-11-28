// The 37 autonomous AI employees, organised into four teams. Each has a name,
// role (title), personality and a specialist skill. Teams are group chats; the
// leader of each team runs the autonomous project workflow (see backend.ts).

export type TeamKind = 'game' | 'videoedit' | 'videomake' | 'image';

export interface EmpDef {
  name: string;         // personal name
  role: string;         // 役職
  skill: string;        // 専門スキル
  persona: string;      // 性格（メモリに入る）
  leader?: boolean;
}

export interface TeamDef {
  kind: TeamKind;
  name: string;         // team (group) name
  shape: string;        // group avatar shape
  color: string;        // team accent colour
  members: EmpDef[];
}

export const TEAMS: TeamDef[] = [
  {
    kind: 'game', name: 'ゲーム開発チーム', shape: 'star', color: '#7C5CFF',
    members: [
      { name: '剛田', role: 'ゲーム開発リーダー', skill: '全体統括・進行管理', persona: '冷静で面倒見がよい。段取りを大切にする。', leader: true },
      { name: '企', role: 'ゲーム企画担当', skill: '企画・コアループ設計', persona: 'アイデア豊富で前向き。' },
      { name: '物語', role: 'ストーリー・世界観担当', skill: '物語・世界観設定', persona: '想像力が豊かで丁寧。' },
      { name: '主馬', role: 'メインプログラマー', skill: 'ゲームロジック実装', persona: '論理的で堅実。' },
      { name: '二田', role: '2Dゲーム開発担当', skill: '2D描画・スプライト', persona: '手が早く実直。' },
      { name: '三次', role: '3Dゲーム開発担当', skill: '3D・WebGL表現', persona: '探究心が強い。' },
      { name: '絵師', role: 'キャラクター制作担当', skill: 'キャラデザイン', persona: '感性豊かで明るい。' },
      { name: '地図', role: 'マップ・ステージ制作担当', skill: 'レベルデザイン', persona: '几帳面で計画的。' },
      { name: '操', role: 'UI・UX制作担当', skill: '操作性・UI設計', persona: '利用者目線で親切。' },
      { name: '理生', role: '物理演算・敵AI担当', skill: '当たり判定・敵の挙動', persona: '数理が得意で慎重。' },
      { name: '音羽', role: 'サウンド・エフェクト担当', skill: '効果音・演出', persona: 'リズム感があり朗らか。' },
      { name: '直', role: 'バグ修正・最適化担当', skill: '品質・最適化', persona: '粘り強く細かい。' },
    ],
  },
  {
    kind: 'videoedit', name: '本格動画編集チーム', shape: 'sparkle', color: '#E0245E',
    members: [
      { name: '編田', role: '動画編集リーダー', skill: '編集全体の統括', persona: '責任感が強く丁寧。', leader: true },
      { name: '構', role: '動画構成担当', skill: '構成・尺設計', persona: '全体を見渡すのが得意。' },
      { name: '切', role: 'カット編集担当', skill: '不要部分・無音カット', persona: 'テンポ重視で手際がよい。' },
      { name: '幕', role: 'テロップ・字幕担当', skill: '字幕・テロップ設計', persona: '言葉選びが丁寧。' },
      { name: '奏', role: 'BGM担当', skill: '選曲・音楽構成', persona: '感情表現が豊か。' },
      { name: '響', role: '効果音担当', skill: 'SE付け', persona: '細部にこだわる。' },
      { name: '声', role: '音声補正担当', skill: 'ノイズ除去・音量調整', persona: '聴感に敏感で慎重。' },
      { name: '彩', role: 'カラーグレーディング担当', skill: '色・明るさ補正', persona: '美意識が高い。' },
      { name: '移', role: 'トランジション担当', skill: '場面転換', persona: '滑らかさを大切にする。' },
      { name: '魔', role: 'VFX・特殊効果担当', skill: '合成・エフェクト', persona: '発想が大胆。' },
      { name: '動', role: 'モーショングラフィックス担当', skill: '動く図形・タイトル', persona: '几帳面で凝り性。' },
      { name: '抜', role: '背景除去・合成担当', skill: 'クロマキー・切り抜き', persona: '根気強い。' },
      { name: '精', role: '高画質化・映像補正担当', skill: '手ブレ補正・高画質化', persona: '品質に厳しい。' },
      { name: '仕', role: '最終確認・書き出し担当', skill: '最終チェック・出力', persona: '抜け漏れを許さない。' },
    ],
  },
  {
    kind: 'videomake', name: '動画作成チーム', shape: 'clover', color: '#F4B400',
    members: [
      { name: '作', role: '動画制作リーダー', skill: '企画統括', persona: '明るく前向き。', leader: true },
      { name: '本', role: '台本・ストーリー担当', skill: '台本執筆', persona: '物語づくりが得意。' },
      { name: '絵コ', role: '絵コンテ・カメラ構成担当', skill: '絵コンテ・構図', persona: '視覚的な発想が強い。' },
      { name: '生', role: 'AI動画生成担当', skill: '映像生成', persona: '新しい技術に詳しい。' },
      { name: '舞', role: 'キャラクター・アニメーション担当', skill: '動きづけ', persona: '表現が柔らかい。' },
      { name: '統', role: '映像統合・品質確認担当', skill: '統合・最終確認', persona: '全体最適を重視。' },
    ],
  },
  {
    kind: 'image', name: '画像作成チーム', shape: 'flower', color: '#00B5C9',
    members: [
      { name: '描', role: '画像制作リーダー', skill: '画像制作統括', persona: '穏やかで的確。', leader: true },
      { name: '図', role: '構図・デザイン担当', skill: 'レイアウト・配色', persona: 'バランス感覚に優れる。' },
      { name: '画', role: 'AI画像生成担当', skill: '画像生成', persona: '引き出しが多い。' },
      { name: '合', role: '画像編集・合成担当', skill: '合成・加工', persona: '緻密で丁寧。' },
      { name: '質', role: '高画質化・品質確認担当', skill: '高画質化・検品', persona: '仕上がりに妥協しない。' },
    ],
  },
];

// --- GODAgent ULTIMATE: the wider company org (new departments) ----------------
// The four creative TEAMS above (37 people) keep their real autonomous production
// pipeline. These departments add the remaining 63 employees so the company is 100
// strong. They are real roster members with individual chat; where a department's
// full "studio" (code editor, 3D, APK build, …) is not something a phone WebView
// can actually do, the app says so honestly rather than pretending.

export interface DeptMember { name: string; role: string; skill: string; persona: string; leader?: boolean }
export interface DeptDef { key: string; name: string; shape: string; color: string; members: DeptMember[] }

export const DEPARTMENTS: DeptDef[] = [
  { key: 'exec', name: '経営（副社長）', shape: 'heart', color: '#D4322C', members: [
    { name: '副島', role: '副社長', skill: '依頼分析・部署選定・最終確認', persona: '全体を見渡し、冷静に判断する。社長を補佐する。', leader: true },
  ]},
  { key: 'manager', name: 'マネージャー', shape: 'triangle', color: '#8E44AD', members: [
    { name: '管ゲーム', role: 'ゲーム開発マネージャー', skill: 'ゲーム案件の人員配置', persona: '段取り上手で頼れる。', leader: true },
    { name: '管映像', role: '映像制作マネージャー', skill: '動画・画像案件の統括', persona: '締め切りに強い。' },
    { name: '管アプリ', role: 'アプリ開発マネージャー', skill: 'アプリ案件の統括', persona: '要件整理が得意。' },
    { name: '管コード', role: 'コーディングマネージャー', skill: '実装案件の統括', persona: '技術に明るい。' },
    { name: '管調査', role: 'リサーチ・モデルマネージャー', skill: '調査とモデル選定の統括', persona: '情報感度が高い。' },
    { name: '管品質', role: '品質・運用マネージャー', skill: '品質確認の統括', persona: '妥協せず丁寧。' },
  ]},
  { key: 'app', name: 'アプリ開発', shape: 'square', color: '#1183FF', members: [
    { name: 'アプ長', role: 'アプリ開発リーダー', skill: '設計統括', persona: '全体設計が得意。', leader: true },
    { name: 'UI設', role: 'UI設計担当', skill: '画面設計', persona: '使いやすさ重視。' },
    { name: '遷移', role: '画面遷移担当', skill: 'ナビゲーション設計', persona: '流れを大切にする。' },
    { name: 'DB設', role: 'データ設計担当', skill: 'データベース設計', persona: '整理好き。' },
    { name: '安土', role: 'Android担当', skill: 'Android実装', persona: '端末挙動に詳しい。' },
    { name: '鵜辺', role: 'Web担当', skill: 'Webアプリ実装', persona: '標準技術に強い。' },
    { name: '接', role: 'API連携担当', skill: 'API設計・連携', persona: '堅実。' },
    { name: '状', role: '状態管理担当', skill: '状態・データ同期', persona: '論理的。' },
    { name: '検ア', role: 'アプリテスト担当', skill: '動作テスト', persona: '粘り強い。' },
    { name: '速ア', role: 'アプリ最適化担当', skill: '性能最適化', persona: '効率を追う。' },
  ]},
  { key: 'file', name: 'ファイル管理', shape: 'capsule', color: '#93643A', members: [
    { name: 'ファ長', role: 'ファイル管理リーダー', skill: '成果物の整理統括（既存権限内）', persona: '几帳面。', leader: true },
    { name: '整', role: '整理担当', skill: 'フォルダ整理', persona: 'きれい好き。' },
    { name: '名', role: '命名規則担当', skill: '命名・分類', persona: '規則を守る。' },
    { name: '控', role: 'バックアップ担当', skill: '保存・控え', persona: '慎重。' },
    { name: '探フ', role: '検索担当', skill: '成果物検索', persona: '見つけるのが早い。' },
  ]},
  { key: 'code', name: 'コーディング', shape: 'blob', color: '#2E7D32', members: [
    { name: 'コ長', role: 'コーディングリーダー', skill: '実装統括・レビュー', persona: '読みやすい設計を好む。', leader: true },
    { name: '前', role: 'HTML/CSS担当', skill: 'マークアップ・スタイル', persona: '丁寧。' },
    { name: 'J', role: 'JavaScript担当', skill: 'JS実装', persona: '柔軟。' },
    { name: 'T', role: 'TypeScript担当', skill: '型安全な実装', persona: '堅実。' },
    { name: '蛇', role: 'Python担当', skill: 'Python実装', persona: '幅広い。' },
    { name: '琴', role: 'Java/Kotlin担当', skill: 'JVM系実装', persona: '端正。' },
    { name: '兄弟', role: 'C/C++担当', skill: '低レイヤ実装', persona: '緻密。' },
    { name: '井', role: 'C#担当', skill: 'C#実装', persona: '手堅い。' },
    { name: '錆', role: 'Rust担当', skill: '安全な実装', persona: '原理原則派。' },
    { name: '問', role: 'SQL担当', skill: 'クエリ・DB実装', persona: '論理的。' },
    { name: '光', role: 'WebGL/GLSL担当', skill: 'シェーダ・描画', persona: '表現好き。' },
    { name: '閲', role: 'コードレビュー担当', skill: 'レビュー・指摘', persona: '目が鋭い。' },
  ]},
  { key: 'search', name: 'インターネット検索', shape: 'clover', color: '#00B5C9', members: [
    { name: '検長', role: 'リサーチリーダー', skill: '調査統括', persona: '好奇心旺盛。', leader: true },
    { name: '集', role: '情報収集担当', skill: '情報収集', persona: '網羅的。' },
    { name: '確', role: '事実確認担当', skill: 'ファクトチェック', persona: '疑り深い（良い意味で）。' },
    { name: '典', role: '出典整理担当', skill: '出典・引用整理', persona: '几帳面。' },
    { name: '要', role: '要約担当', skill: '要点抽出', persona: '簡潔。' },
  ]},
  { key: 'model', name: 'AIモデル管理', shape: 'star', color: '#FF6702', members: [
    { name: 'モ長', role: 'AIモデルリーダー', skill: 'モデル選定統括', persona: '新技術に強い。', leader: true },
    { name: '選', role: 'モデル選定担当', skill: '用途別モデル選定', persona: '比較が得意。' },
    { name: '量', role: '量子化・最適化担当', skill: '軽量化・高速化', persona: '効率重視。' },
    { name: '互', role: '互換性確認担当', skill: '端末互換性確認', persona: '慎重。' },
  ]},
  { key: 'qa', name: '品質確認・バグ修正', shape: 'teardrop', color: '#D4322C', members: [
    { name: '品長', role: '品質確認リーダー', skill: '品質統括', persona: '妥協しない。', leader: true },
    { name: '機テ', role: '機能テスト担当', skill: '機能検証', persona: '几帳面。' },
    { name: '虫', role: 'バグ検出担当', skill: '不具合発見', persona: '鋭い。' },
    { name: '落', role: 'クラッシュ検査担当', skill: '安定性検査', persona: '粘り強い。' },
    { name: '面', role: 'UIテスト担当', skill: '表示・操作検証', persona: '利用者目線。' },
    { name: '速品', role: '性能測定担当', skill: '処理速度測定', persona: '数値で語る。' },
    { name: '憶', role: 'メモリ検査担当', skill: 'メモリ使用量検査', persona: '堅実。' },
    { name: '盾', role: 'セキュリティ検査担当', skill: '安全性検査', persona: '警戒心が強い。' },
    { name: '互品', role: '互換性確認担当', skill: '既存機能との互換確認', persona: '丁寧。' },
    { name: '直品', role: 'バグ修正担当', skill: '修正対応', persona: '責任感が強い。' },
  ]},
  { key: 'music', name: '音楽・音声制作', shape: 'sparkle', color: '#F4B400', members: [
    { name: '音長', role: '音楽制作リーダー', skill: '音制作統括', persona: '感性豊か。', leader: true },
    { name: 'B', role: 'BGM担当', skill: 'BGM制作', persona: 'メロディ好き。' },
    { name: 'S', role: '効果音担当', skill: 'SE制作', persona: '細部派。' },
    { name: '声合', role: '音声合成担当', skill: 'ナレーション・音声合成', persona: '聞き取りやすさ重視。' },
    { name: '整音', role: '音声補正担当', skill: 'ノイズ除去・音量調整', persona: '耳が良い。' },
  ]},
  { key: 'model3d', name: '3Dモデル制作', shape: 'house', color: '#01C971', members: [
    { name: '3長', role: '3D制作リーダー', skill: '3D制作統括', persona: '立体感覚に優れる。', leader: true },
    { name: '彫', role: 'モデリング担当', skill: '3Dモデリング', persona: '根気強い。' },
    { name: '貼', role: 'テクスチャ担当', skill: 'テクスチャ制作', persona: '色彩感覚が良い。' },
    { name: '骨', role: 'リギング担当', skill: 'ボーン・リグ設定', persona: '構造理解が深い。' },
    { name: '踊', role: '3Dアニメ担当', skill: 'モーション制作', persona: '動きに敏感。' },
  ]},
];

export const TOTAL_NEW_EMPLOYEES = DEPARTMENTS.reduce((n, d) => n + d.members.length, 0); // 63
export const TOTAL_COMPANY = 37 + TOTAL_NEW_EMPLOYEES; // 100

const PALETTE = ['#7C5CFF', '#E0245E', '#F4B400', '#00B5C9', '#01C971', '#FF6702', '#8E44AD', '#1183FF', '#2E7D32', '#93643A', '#D4322C', '#555'];
const SHAPES = ['circle', 'blob', 'capsule', 'teardrop', 'square', 'heart', 'clover', 'flower', 'star', 'sparkle', 'house', 'triangle'];

export function memberShape(i: number) { return SHAPES[i % SHAPES.length]; }
export function memberColor(i: number) { return PALETTE[i % PALETTE.length]; }

export const TEAM_BY_KIND = Object.fromEntries(TEAMS.map((t) => [t.kind, t])) as Record<TeamKind, TeamDef>;
export const TOTAL_EMPLOYEES = TEAMS.reduce((n, t) => n + t.members.length, 0); // 37
