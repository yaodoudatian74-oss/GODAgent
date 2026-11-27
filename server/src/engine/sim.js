// Simulation engine: drives the full experience with no API key required.
// It inspects the user's message and the bot's role, then runs a realistic
// sequence of tool calls. Not a mock of the UI — it exercises the real tools
// (real browser, real approvals, real memory), just with a heuristic planner.
import { makeTools } from '../tools.js';
import { db } from '../db.js';
import { sleep } from '../util.js';

const has = (t, ...k) => k.some((w) => t.includes(w));

export async function runSimTurn(bot, userText, { signal } = {}) {
  const T = makeTools(bot);
  const t = userText.toLowerCase();

  // 1) memory capture
  if (has(t, 'remember', 'always', 'from now on', '覚え', '今後', 'いつも')) {
    await T.saveMemory('instruction', userText.replace(/^(remember|always|覚えて|今後は?)[:,、\s]*/i, '').trim());
    await T.reply('承知しました。今後はそのようにいたします。', { signal });
    T.done(); return;
  }

  // 2) questions back to the user when the ask is ambiguous
  if (has(t, 'which', 'should i', 'option', 'choose', 'どっち', 'どちら', 'どれ', 'べき') && bot.kind !== 'group') {
    const ans = await T.askQuestion({
      question: '進め方がいくつか考えられます。どれがよろしいですか？',
      options: ['まず動いて、必要なら後で調整', 'すべて下書きしてから確認を仰ぐ', '最も効果の大きい項目だけ'],
    });
    await T.reply(`承知しました。「${ans}」で進めます。開始いたします。`, { signal });
    T.done(); return;
  }

  // 3) group handoff
  if (bot.kind === 'group') {
    const members = (bot.members || []).map((id) => db.getBot(id)).filter(Boolean);
    await T.reply('承知しました。適任のメンバーに引き継ぎます。', { signal });
    if (members[1]) {
      await T.handoff(members[1].id, userText.slice(0, 120));
      await sleep(400);
      const sub = makeTools(members[1]);
      await sub.reply(`引き継ぎました。「${userText.slice(0, 60)}」を担当し、完了後にご報告します。`, { signal });
      sub.done();
    }
    T.done(); return;
  }

  // 3.5) creative teams + DeepResearch
  if (has(t, '画像', 'image', 'イラスト', 'ロゴ', 'ビジュアル', 'アイコン', 'icon', '壁紙')) {
    await T.reply('承知しました。要件に合わせてオリジナルのキービジュアルを生成します。', { signal });
    await T.genImage(userText.slice(0, 40), userText.slice(0, 40));
    await T.reply('生成しました。配色違いや構図違いのバリエーションも出せます。方向性はいかがですか？', { signal });
    T.done(); return;
  }
  if (has(t, '動画', 'video', 'ビデオ', '映像', 'ムービー')) {
    await T.reply('承知しました。まず絵コンテとナレーション案を用意します。', { signal });
    await T.computerOpen('web', '参考となる映像表現をリサーチします。');
    await T.reply('絵コンテ（6カット）\n1. タイトルロゴ\n2. 課題の提示\n3. 解決の提案\n4. 主要機能のデモ\n5. 利用シーン\n6. CTA・締め\n\n尺は30秒想定です。実際の書き出しは本ビルドでは未接続のため、構成案までを提供します。この方向で進めますか？', { signal });
    T.done(); return;
  }
  if (has(t, 'ゲーム', 'game')) {
    await T.reply('承知しました。企画からプロトタイプ方針までまとめます。', { signal });
    await T.genImage('game key visual ' + userText.slice(0, 24), 'コンセプトアート（自動生成）');
    await T.reply('企画概要\n・コアループ：操作→挑戦→報酬→強化の反復\n・操作：タッチ主体、片手で完結\n・プロト範囲：1ステージ＋基本操作\n\nオリジナル要素のみで構成し、既存作品のキャラクター・名称・ロゴは使いません。プロトタイプに進めてよろしいですか？', { signal });
    T.done(); return;
  }
  if (has(t, 'アプリ', 'app', 'webアプリ')) {
    await T.reply('承知しました。要件と画面構成をまとめ、開発に着手できる状態にします。', { signal });
    await T.computerOpen('web', '類似サービスと技術選定をリサーチします。');
    await T.reply('要件サマリ\n・主要画面：一覧／詳細／作成／設定\n・技術：React + TypeScript、必要に応じてPWA/APK化\n・データ：まずは端末内保存、拡張でクラウド\n\nリポジトリ準備まで想定しています。優先順位を決めて着手しますか？', { signal });
    T.done(); return;
  }
  if (has(t, 'ディープ', 'deep research', 'deepresearch', '徹底的', '詳しく調べ', '深掘り', '徹底調査', '調査して')) {
    await T.reply('DeepResearch を開始します。複数の情報源を横断し、出典つきで要点をまとめます。', { signal });
    await T.computerOpen('web', '一次情報と信頼できる情報源を収集します。');
    await T.computerOpen('web', '異なる情報源を照合・検証します。');
    await T.reply(`調査レポート：${userText.slice(0, 40)}\n\n要点\n1. 全体像：主要な論点を整理。\n2. 根拠：複数の情報源で裏付けの取れた事実を優先。\n3. 相違点：食い違う箇所は注記。\n\n出典（例）：acme-research.example / marketpulse.example / contextwire.example\n\n※サンドボックスのため実際の外部Web取得は行わず、調査フローを再現しています。`, { signal });
    T.done(); return;
  }

  // 4) computer + outbound work (sign in, browse, draft, send)
  if (has(t, 'sign in', 'log in', 'login', 'salesforce', 'crm', 'accounts', 'サインイン', 'ログイン', '顧客')) {
    await T.reply('接続状況を確認します。Hex・Gmail・LinkedIn はサインイン済みですが、Salesforce は未サインインです。', { signal });
    await T.computerOpen('salesforce', '担当アカウントを確認するため、Salesforce にサインインします。');
    await T.reply('サインインしました。担当アカウントが6件あります。アウトリーチの下書きを始めますか？', { signal });
    T.done(); return;
  }

  if (has(t, 'research', 'prospect', 'pipeline', 'outbound', 'outreach', 'web', 'search', 'リサーチ', '調べ', '営業', 'パイプライン')) {
    await T.reply('開始します。対象の見込み客を抽出し、Webで背景を収集して、あなたの文体で下書きします。', { signal });
    await T.computerOpen('sheet', 'シートから対象の見込み客を読み込みます。');
    await T.computerOpen('web', '連絡先とアカウントの背景情報を収集します。');
    await T.draftEmail({ to: 'vicky@globex.example', subject: 'ご挨拶と次のステップ', body: 'Vicky 様\n\n先日の件のフォローです。今週20分ほどお時間をいただけませんか。木曜はいかがでしょう。\n\nよろしくお願いいたします。' });
    const d = await T.requestApproval({ action: 'メールを送信', detail: 'vicky@globex.example 宛に下書き1通を送信', risk: 'high' });
    if (d.decision === 'allow') await T.reply('送信しました。残りは下書きとして保存しておきます。完了です。', { signal });
    else await T.reply('送信は保留しました。すべて下書きとして保存しています。', { signal });
    T.done(); return;
  }

  if (has(t, 'send', 'post', 'email', 'メール', '送信', '投稿')) {
    await T.reply('下書きしました。外部への送信になるため、送信前に確認します。', { signal });
    await T.draftEmail({ to: 'team@company.example', subject: 'ご連絡', body: userText.slice(0, 200) });
    const d = await T.requestApproval({ action: 'メールを送信', detail: userText.slice(0, 120), risk: 'high' });
    await T.reply(d.decision === 'allow' ? '送信しました。完了です。' : '下書きとして保存しました。', { signal });
    T.done(); return;
  }

  if (has(t, 'delete', 'remove', 'purchase', 'buy', 'pay', '削除', '購入', '支払')) {
    await T.reply('影響の大きい操作のため、先に確認いたします。', { signal });
    const d = await T.requestApproval({ action: '重要な操作', detail: userText.slice(0, 140), risk: 'high', autoReviewable: false });
    await T.reply(d.decision === 'allow' ? '実行しました。' : '中止しました。変更はありません。', { signal });
    T.done(); return;
  }

  // 5) default conversational reply, shaped by the bot's role
  const role = (bot.title || '').toLowerCase();
  let reply;
  if (role.includes('recruit') || role.includes('採用') || bot.name.includes('Talent') || bot.name.includes('採用')) reply = '候補者の探索、あなたの文体での紹介文の下書き、各やり取りのフォローまで対応できます。探索を始めましょうか？';
  else if (role.includes('finance') || role.includes('経費') || bot.name.includes('Expense') || bot.name.includes('経費')) reply = '経費の申請を管理し、規定外のものがあれば指摘します。領収書をお預けいただければ、こちらで進めます。';
  else if (role.includes('email') || role.includes('メール') || bot.name.includes('Inbox') || bot.name.includes('受信')) reply = '受信トレイをゼロにし、返信を下書きし、要対応のものは保留できます。いま一巡しましょうか？';
  else if (bot.name.includes('ゲーム')) reply = 'ゲーム制作チームです。企画・コアループ設計・操作仕様・プロトタイプまで対応します（すべてオリジナルで制作します）。作りたいゲームのジャンルやテーマを教えてください。';
  else if (bot.name.includes('動画')) reply = '動画制作チームです。絵コンテ・ナレーション案・構成までまとめます。尺・用途・雰囲気を教えてください。';
  else if (bot.name.includes('画像')) reply = '画像制作です。説明からオリジナルのキービジュアルを生成します。作りたい画像の内容・配色・用途を教えてください。';
  else if (bot.name.includes('アプリ')) reply = 'アプリ制作チームです。要件定義・画面構成・技術選定・リポジトリ準備まで対応します。作りたいアプリの概要を教えてください。';
  else if (role.includes('deepresearch') || bot.name.includes('リサーチ')) reply = 'DeepResearch です。複数の情報源を横断し、出典つきで要点をまとめます。調べたいテーマを教えてください。';
  else reply = 'はじめまして。どのような役割でお役に立てばよいでしょう。具体的なご依頼でも、全般的なサポートでも対応します。';
  await T.reply(reply, { signal });
  T.done();
}
