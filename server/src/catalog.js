// Shared catalogs: avatar shapes, palette, connectable apps, bot states.
// Avatar geometry itself lives in the web client (original abstract blobs).

export const SHAPES = [
  'blob', 'circle', 'capsule', 'triangle', 'teardrop', 'flower',
  'square', 'sparkle', 'clover', 'heart', 'house', 'star',
];

// Palette sampled from the reference line-up (original abstract colours).
export const PALETTE = [
  '#777777', // gray
  '#1183FF', // blue
  '#FF6702', // orange
  '#111111', // black
  '#01C971', // green
  '#93643A', // brown
  '#7C5CFF', // violet
  '#E0245E', // pink
  '#00B5C9', // teal
  '#F4B400', // amber
  '#8E44AD', // purple
  '#2E7D32', // forest
];

export const STATES = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'];

// Connectable apps (mirrors the real product's marketplace surface).
export const APPS = [
  { id: 'gmail', name: 'Gmail', category: 'Email', desc: 'Read, draft, and send email; search threads and manage labels.', tools: ['search_mail', 'draft_email', 'send_email'] },
  { id: 'outlook', name: 'Outlook', category: 'Email', desc: 'Microsoft 365 mail and calendar.', tools: ['search_mail', 'draft_email', 'send_email'] },
  { id: 'gdrive', name: 'Google Drive', category: 'Files', desc: 'Browse, read, and create documents and files.', tools: ['list_files', 'read_file', 'create_doc'] },
  { id: 'slack', name: 'Slack', category: 'Messaging', desc: 'Read channels and send messages on your behalf.', tools: ['read_channel', 'post_message'] },
  { id: 'github', name: 'GitHub', category: 'Dev', desc: 'Issues, pull requests, and repository files.', tools: ['list_issues', 'open_pr', 'read_repo'] },
  { id: 'linear', name: 'Linear', category: 'Dev', desc: 'Create and update issues and projects.', tools: ['list_issues', 'create_issue'] },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', desc: 'Accounts, contacts, and opportunities.', tools: ['query_accounts', 'update_record'] },
  { id: 'notion', name: 'Notion', category: 'Docs', desc: 'Pages and databases.', tools: ['search_pages', 'create_page'] },
  { id: 'gcal', name: 'Google Calendar', category: 'Calendar', desc: 'Read and create events; send invites.', tools: ['list_events', 'create_event'] },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', desc: 'Contacts, deals, and marketing.', tools: ['query_contacts', 'update_deal'] },
];

export const APP_BY_ID = Object.fromEntries(APPS.map(a => [a.id, a]));

// Trigger kinds a routine can use.
export const TRIGGER_KINDS = ['time', 'daily', 'weekly', 'monthly', 'interval', 'webhook', 'email', 'github', 'slack'];
