import { db } from './db.js';
import { uid, now } from './util.js';

function bot(partial) {
  const t = now();
  return {
    id: uid('bot_'),
    kind: 'bot',          // 'bot' | 'group'
    name: 'New Bot',
    title: '',
    shape: 'blob',
    color: '#777777',
    avatarImage: null,     // data URL when uploaded/generated
    state: 'idle',
    pinned: false,
    hidden: false,
    members: [],           // for groups: [botId]
    apps: [],              // connected app ids this bot uses
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

const SEED_BOTS = [
  { name: 'チーフ', title: 'プライマリBot', shape: 'circle', color: '#01C971', pinned: true,
    last: '会場を予約し、確認メールを送信しました。' },
  { name: '営業アウトバウンド', title: 'パイプライン＆アウトバウンド', shape: 'capsule', color: '#F4B400',
    last: '完了です。' },
  { name: '受信トレイ管理', title: 'メール整理', shape: 'blob', color: '#7C5CFF',
    last: '送信済み。受信トレイはゼロ、下書き5件を保留中です。' },
  { name: 'アカウント管理', title: 'カスタマーサクセス', shape: 'circle', color: '#8E44AD',
    last: 'Vicky に招待を送付、Globex のメモを追加しました。' },
  { name: '採用スカウト', title: '採用', shape: 'teardrop', color: '#1183FF',
    last: 'あなたの文体で紹介文を3件下書きし、確認用に保留しています。' },
  { name: '経費管理', title: '財務オペ', shape: 'circle', color: '#FF6702',
    last: 'レポートを提出。領収書9件、規定外はありません。' },
];

export function ensureSeed() {
  if (db.listBots().length > 0) return;

  const created = SEED_BOTS.map((s) => {
    const b = db.putBot(bot({ name: s.name, title: s.title, shape: s.shape, color: s.color, pinned: !!s.pinned }));
    db.addMessage(b.id, {
      id: uid('m_'), role: 'bot', type: 'text', text: greeting(s.name),
      ts: now() - 86400000 + Math.random() * 3600000,
    });
    db.addMessage(b.id, {
      id: uid('m_'), role: 'bot', type: 'text', text: s.last,
      ts: now() - Math.floor(Math.random() * 7200000),
    });
    // a little seed memory
    db.addMemory(b.id, { id: uid('mem_'), kind: 'instruction', text: `${s.title}。返信は短く、完了したら報告すること。`, ts: now() });
    return b;
  });

  // a group chat ("Offsite crew") with 3 members
  const group = db.putBot(bot({
    kind: 'group', name: '合宿チーム', title: 'グループ', shape: 'flower', color: '#93643A',
    members: created.slice(0, 3).map(b => b.id),
  }));
  db.addMessage(group.id, { id: uid('m_'), role: 'bot', botId: created[0].id, type: 'text',
    text: '残るはパイプラインですね。フォローアップ用に専任のBotを立ち上げます。', ts: now() - 3600000 });

  // primary bot = Chief
  db.setSettings({ primaryBotId: created[0].id });

  // one account-level skill
  db.putSkill({
    id: uid('skill_'), name: '週次ステータスまとめ',
    description: '各プロジェクトの今週の進捗をまとめ、ダイジェストを投稿する。',
    steps: ['接続済みアプリから更新を収集', 'プロジェクトごとに分類', '短いダイジェストを下書き', '投稿前に承認を仰ぐ'],
    inputs: ['week'], scope: 'account', ts: now(),
  });

  // one routine on the primary bot
  db.putRoutine({
    id: uid('rtn_'), botId: created[0].id, name: '朝のブリーフィング',
    trigger: { kind: 'daily', at: '08:30' }, skillId: null,
    prompt: '短い朝のブリーフィングをください。予定、最優先の3件、滞っている事項。',
    enabled: true, lastRun: null, runs: [], ts: now(),
  });
}

function greeting(name) {
  return `はじめまして、${name}です。任せたい役割を教えてください。会話の合間も作業を続けます。まず何から着手しましょうか？`;
}
