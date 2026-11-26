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
  else reply = 'はじめまして。どのような役割でお役に立てばよいでしょう。具体的なご依頼でも、全般的なサポートでも対応します。';
  await T.reply(reply, { signal });
  T.done();
}
