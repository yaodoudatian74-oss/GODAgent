// Honest implementation-status map for the GODAgent ULTIMATE spec (spec rule 17:
// clearly show what is not implemented). Status: done / todo / blocked(device).

type S = 'done' | 'todo' | 'blocked';
const GROUPS: { title: string; items: [string, S, string?][] }[] = [
  { title: '土台・基本', items: [
    ['既存GODAgent（37人・4チーム自律制作）', 'done'],
    ['遊べるゲーム／画像／動画の実生成', 'done'],
    ['Hugging Faceモデルのダウンロード・端末推論', 'done', 'wasm読込の不具合を修正済み'],
    ['バックグラウンドのゆっくり動作＋再開時に続きから', 'done'],
  ]},
  { title: '組織（フェーズ2）', items: [
    ['AI社員100人体制（既存37＋新63）', 'done'],
    ['14部署・組織表示・個別チャット', 'done'],
    ['社員番号・役職・専門・レベル/経験値', 'done'],
  ]},
  { title: '高度思考・協力（フェーズ4）', items: [
    ['複数案→相互評価→結論＋信頼度（根拠つき）', 'done'],
    ['思考モード 専門/高度/深度/超深度', 'done'],
    ['導入済みモデルでの実推論', 'done', '未導入時は簡易整理と明示'],
  ]},
  { title: 'コードスタジオ（フェーズ5）', items: [
    ['HTML/CSS/JSの実行・プレビュー（アーティファクト）', 'done'],
    ['AIコード生成・テンプレート挿入', 'done'],
    ['コードの保存（ダウンロード）', 'done'],
    ['複数言語の閲覧・保存', 'done', 'Web以外は実行不可＝理由表示'],
    ['本格エディタ（補完・デバッグ・Git）', 'todo'],
    ['アプリ内でのAPK/EXEビルド', 'blocked', '端末のWebViewでは不可'],
  ]},
  { title: '育成（フェーズ12）', items: [
    ['依頼完了・熟考で経験値→レベルアップ', 'done'],
    ['習熟度・昇進・資格・能力テスト', 'todo'],
  ]},
  { title: 'AIモデル（フェーズ3・6章・11章）', items: [
    ['モデル共有（都度読込・使い回し）', 'done'],
    ['各チームがモデルで制作文を生成', 'done', '未導入時はテンプレ'],
    ['モデル研究所（性能比較・速度測定）', 'todo'],
    ['LoRA追加学習・大規模学習', 'blocked', '端末では不可＝必要環境を表示'],
  ]},
  { title: '制作スタジオ（画像/動画/音楽/3D）', items: [
    ['オリジナル画像（SVG）生成', 'done'],
    ['WebM動画の録画生成', 'done', '端末対応時のみ'],
    ['音楽・音声（手続き的合成→WAV）', 'done', 'スタジオ'],
    ['基本形状の3Dモデル（OBJ生成）', 'done', 'スタジオ・立方体/ピラミッド/地形'],
    ['テキスト→本物の動画生成', 'blocked', '端末では不可'],
    ['テキスト/画像→本格3Dモデル生成', 'blocked', '端末では不可'],
    ['WebView内でのMP4編集・書き出し', 'blocked', '端末では不可'],
    ['AI作曲モデル（text→音楽）', 'blocked', '端末では不可'],
  ]},
  { title: 'ゲーム/アプリ開発エンジン（6・13章）', items: [
    ['2Dゲームの自動生成（遊べる）', 'done'],
    ['3Dワールド/各種エディタ', 'todo'],
    ['ドラッグ&ドロップUI制作', 'todo'],
  ]},
  { title: 'バーチャル会社・UI（21章）', items: [
    ['組織図・社員状況・個別指示', 'done', '一覧表示として'],
    ['3Dアバター・3Dバーチャルオフィス', 'todo'],
  ]},
  { title: 'プラグイン・最適化・品質（14・26・27章）', items: [
    ['性能モード（端末負荷の調整）', 'done', 'スタジオ・超軽量〜ULTIMATE'],
    ['品質確認チームの検査フロー', 'todo', '一部は制作に内蔵済み'],
    ['プラグインストア', 'todo'],
  ]},
];

const BADGE: Record<S, { t: string; c: string }> = {
  done: { t: '✅ 実装', c: 'var(--done,#1a7f4b)' },
  todo: { t: '🔜 未実装', c: 'var(--dim,#888)' },
  blocked: { t: '⛔ 端末制約', c: 'var(--danger,#d4322c)' },
};

export function FeaturesPane() {
  let done = 0, total = 0;
  GROUPS.forEach((g) => g.items.forEach(([, s]) => { total++; if (s === 'done') done++; }));
  return (
    <>
      <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        GODAgent ULTIMATE 指示書の実装状況です（正直に表示）。全体は非常に大規模で、実際に動く部分から順に追加しています。<b>⛔端末制約</b>の項目はスマホのWebViewでは実行できないため、「できるフリ」はせず理由を示します。
      </div>
      <div className="list-item" style={{ marginBottom: 12 }}>
        <div className="grow"><b>実装済み（代表項目）</b><div className="muted">{done} / {total} の代表機能が実際に動作</div></div>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 10 }}>
          <div className="section-label" style={{ padding: '4px 0' }}>{g.title}</div>
          {g.items.map(([name, s, note], i) => (
            <div key={i} className="row-between" style={{ fontSize: 13, padding: '3px 0' }}>
              <span className="grow">{name}{note ? <span className="muted"> — {note}</span> : null}</span>
              <span style={{ color: BADGE[s].c, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{BADGE[s].t}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
