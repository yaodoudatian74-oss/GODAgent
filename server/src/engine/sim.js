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
    await T.saveMemory('instruction', userText.replace(/^(remember|always)[:,\s]*/i, '').trim());
    await T.reply('Got it — I’ll keep that in mind from now on.', { signal });
    T.done(); return;
  }

  // 2) questions back to the user when the ask is ambiguous
  if (has(t, 'which', 'should i', 'option', 'choose') && bot.kind !== 'group') {
    const ans = await T.askQuestion({
      question: 'A couple of ways I could take this — which do you prefer?',
      options: ['Move fast, ask forgiveness', 'Draft everything for your review first', 'Just the highest-impact items'],
    });
    await T.reply(`Understood — I’ll go with: ${ans}. Starting now.`, { signal });
    T.done(); return;
  }

  // 3) group handoff
  if (bot.kind === 'group') {
    const members = (bot.members || []).map((id) => db.getBot(id)).filter(Boolean);
    await T.reply('On it — let me pull in the right people.', { signal });
    if (members[1]) {
      await T.handoff(members[1].id, userText.slice(0, 120));
      await sleep(400);
      const sub = makeTools(members[1]);
      await sub.reply(`Picking this up — I’ll handle "${userText.slice(0, 60)}" and report back.`, { signal });
      sub.done();
    }
    T.done(); return;
  }

  // 4) computer + outbound work (sign in, browse, draft, send)
  if (has(t, 'sign in', 'log in', 'login', 'salesforce', 'crm', 'accounts', 'サインイン', 'ログイン')) {
    await T.reply('Checking what’s connected. Hex, Gmail, and LinkedIn are already signed in. Salesforce isn’t.', { signal });
    await T.computerOpen('salesforce', 'Sign in to Salesforce so I can see the accounts you own.');
    await T.reply('Signed in. I can see 6 accounts you own. Want me to start outreach drafts?', { signal });
    T.done(); return;
  }

  if (has(t, 'research', 'prospect', 'pipeline', 'outbound', 'outreach', 'web', 'search', 'リサーチ', '調べ')) {
    await T.reply('Starting. I’ll pull eligible prospects, grab context from the web, and draft outreach in your voice.', { signal });
    await T.computerOpen('sheet', 'Reading eligible prospects from the sheet.');
    await T.computerOpen('web', 'Grabbing context on contacts and accounts.');
    await T.draftEmail({ to: 'vicky@globex.example', subject: 'Quick intro + next steps', body: 'Hi Vicky,\n\nFollowing up — I’d love 20 minutes this week. Does Thursday work?\n\nBest,' });
    const d = await T.requestApproval({ action: 'send email', detail: 'Send 1 drafted email to vicky@globex.example', risk: 'high' });
    if (d.decision === 'allow') await T.reply('Sent. I’ll park the rest as drafts for your review. Done.', { signal });
    else await T.reply('Held it. All drafts are parked for your review instead.', { signal });
    T.done(); return;
  }

  if (has(t, 'send', 'post', 'email', 'メール', '送信', '投稿')) {
    await T.reply('Drafted. This one goes outside, so I’ll check before sending.', { signal });
    await T.draftEmail({ to: 'team@company.example', subject: 'Update', body: userText.slice(0, 200) });
    const d = await T.requestApproval({ action: 'send email', detail: userText.slice(0, 120), risk: 'high' });
    await T.reply(d.decision === 'allow' ? 'Sent. Done.' : 'Kept it as a draft.', { signal });
    T.done(); return;
  }

  if (has(t, 'delete', 'remove', 'purchase', 'buy', 'pay', '削除', '購入', '支払')) {
    await T.reply('That’s a sensitive action, so I’ll confirm first.', { signal });
    const d = await T.requestApproval({ action: 'destructive action', detail: userText.slice(0, 140), risk: 'high', autoReviewable: false });
    await T.reply(d.decision === 'allow' ? 'Done.' : 'Cancelled — nothing changed.', { signal });
    T.done(); return;
  }

  // 5) default conversational reply, shaped by the bot's role
  const role = (bot.title || '').toLowerCase();
  let reply;
  if (role.includes('recruit') || bot.name.includes('Talent')) reply = 'I can source candidates, draft intros in your voice, and keep every thread warm. Want me to start a search?';
  else if (role.includes('finance') || bot.name.includes('Expense')) reply = 'I’ll keep expenses filed and flag anything out of policy. Point me at the receipts and I’ll take it from here.';
  else if (role.includes('email') || bot.name.includes('Inbox')) reply = 'I can get your inbox to zero, draft replies, and park anything that needs you. Should I start a pass now?';
  else reply = `Hey — good to meet you. What do you want me around for? Anything concrete, or more of a general sidekick?`;
  await T.reply(reply, { signal });
  T.done();
}
