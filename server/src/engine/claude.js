// Real agent loop, used when ANTHROPIC_API_KEY is set. Streams responses and
// drives the same tools the simulation engine uses (real browser, approvals,
// memory). Falls back to the simulation engine on any API error.
import Anthropic from '@anthropic-ai/sdk';
import { makeTools } from '../tools.js';
import { db } from '../db.js';
import { runSimTurn } from './sim.js';

const MODEL = process.env.GODAGENT_MODEL || 'claude-opus-4-8';
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const TOOL_DEFS = [
  { name: 'computer_open', description: 'Open a URL or app on the shared computer (e.g. "salesforce", "web", "sheet", "mail", or a https URL). Use when the task needs browsing, sign-in, or reading a web app.',
    input_schema: { type: 'object', additionalProperties: false, required: ['target'], properties: { target: { type: 'string' }, note: { type: 'string' } } } },
  { name: 'request_approval', description: 'Ask the user to approve a consequential action (sending email, posting, deleting, buying). Blocks until they decide.',
    input_schema: { type: 'object', additionalProperties: false, required: ['action', 'detail'], properties: { action: { type: 'string' }, detail: { type: 'string' }, risk: { type: 'string', enum: ['normal', 'high'] } } } },
  { name: 'ask_question', description: 'Ask the user a clarifying question. Optionally provide choices.',
    input_schema: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } } } },
  { name: 'save_memory', description: 'Persist a durable fact, preference, or standing instruction for this bot.',
    input_schema: { type: 'object', additionalProperties: false, required: ['kind', 'text'], properties: { kind: { type: 'string', enum: ['instruction', 'fact', 'preference'] }, text: { type: 'string' } } } },
  { name: 'draft_email', description: 'Create an email draft shown as a card. Does not send.',
    input_schema: { type: 'object', additionalProperties: false, required: ['to', 'subject', 'body'], properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } } },
  { name: 'finish', description: 'Signal the task for this turn is complete.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} } },
];

function systemPrompt(bot) {
  const mem = db.memory(bot.id).map((m) => `- (${m.kind}) ${m.text}`).join('\n') || '- (none yet)';
  return `You are "${bot.name}", a persistent AI teammate${bot.title ? ` — ${bot.title}` : ''}.
You keep working on tasks across sessions and report back concisely. Keep replies short and human. Reply in Japanese (日本語で返信).
Use the computer for anything that needs browsing or sign-in. Always request approval before sending email, posting, deleting, or buying.
Your long-term memory for this user:
${mem}`;
}

export async function runClaudeTurn(bot, userText, { signal } = {}) {
  const T = makeTools(bot);
  const history = db.messages(bot.id)
    .filter((m) => m.type === 'text' && m.text)
    .slice(-16)
    .map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
  const messages = [...history, { role: 'user', content: userText }];

  try {
    T.setState('thinking');
    for (let step = 0; step < 10; step++) {
      if (signal?.aborted) break;
      const stream = getClient().messages.stream({
        model: MODEL, max_tokens: 2048, system: systemPrompt(bot),
        thinking: { type: 'adaptive' }, tools: TOOL_DEFS, messages,
      });
      const res = await stream.finalMessage();
      const textBlocks = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (textBlocks) await T.reply(textBlocks, { signal });

      const toolUses = res.content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0 || res.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const tu of toolUses) {
        const out = await execTool(T, tu.name, tu.input);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
        if (tu.name === 'finish') { T.done(); return; }
      }
      messages.push({ role: 'user', content: results });
    }
    T.done();
  } catch (e) {
    // Any API/credential/network failure → fall back to the simulation engine.
    T.error(`オフラインモードに切り替えます（${e.message || e}）。`);
    await runSimTurn(bot, userText, { signal });
  }
}

async function execTool(T, name, input) {
  switch (name) {
    case 'computer_open': { const r = await T.computerOpen(input.target, input.note); return { ok: r.ok, url: r.url }; }
    case 'request_approval': { const d = await T.requestApproval({ action: input.action, detail: input.detail, risk: input.risk }); return { decision: d.decision }; }
    case 'ask_question': { const a = await T.askQuestion({ question: input.question, options: input.options }); return { answer: a }; }
    case 'save_memory': { await T.saveMemory(input.kind, input.text); return { ok: true }; }
    case 'draft_email': { await T.draftEmail(input); return { ok: true, drafted: true }; }
    case 'finish': return { ok: true };
    default: return { error: 'unknown tool' };
  }
}
