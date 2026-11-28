// GODAgent's own small role-specialised models, bundled inside the app
// (web/public/models → served at ./models/). They are tiny bigram Markov LMs
// (tens of KB) that run on-device via transformers.js / ONNX Runtime WASM, with
// no download and no login: they are "pre-installed" the moment the app opens.
// They are not large reasoning LLMs — they generate short, role-flavoured text
// (idea / prompt / script / edit-plan seeds). Each AI team uses its own model.

export interface BuiltinModel { id: string; role: string; label: string; note: string }

export const BUILTIN: BuiltinModel[] = [
  { id: 'godagent-game-idea',    role: 'game',  label: 'ゲームアイデア（内蔵）',   note: 'ゲーム開発チーム用' },
  { id: 'godagent-image-prompt', role: 'image', label: '画像プロンプト（内蔵）',   note: '画像作成チーム用' },
  { id: 'godagent-video-script', role: 'video', label: '動画台本（内蔵）',         note: '動画作成チーム用' },
  { id: 'godagent-edit-plan',    role: 'edit',  label: '編集プラン（内蔵）',       note: '本格動画編集チーム用' },
  { id: 'godagent-router',       role: 'router',label: '振り分け（内蔵・補助）',   note: '依頼の振り分け補助' },
];

export const BUILTIN_BY_ROLE: Record<string, string> = Object.fromEntries(BUILTIN.map((b) => [b.role, b.id]));

let tf: any = null;
const pipes = new Map<string, Promise<any>>();

async function lib() {
  if (tf) return tf;
  tf = await import('@huggingface/transformers');
  const ort = tf.env.backends?.onnx?.wasm;
  if (ort) {
    ort.numThreads = 1; // no SharedArrayBuffer in a WebView / artifact
    const inApk = location.hostname === 'godagent.local' || location.protocol === 'file:';
    const singleFileWeb = !!(import.meta as any).env?.VITE_SINGLEFILE && !inApk;
    if (!singleFileWeb) delete ort.wasmPaths; // use the locally bundled ORT .wasm
  }
  return tf;
}

// Resolve ./models/ against the document base so it works at /, under a sub-path,
// and from the APK's https://godagent.local/ origin.
function modelsBase() {
  try { return new URL('models/', document.baseURI).href; } catch { return 'models/'; }
}

export function load(id: string) {
  if (pipes.has(id)) return pipes.get(id)!;
  const p = (async () => {
    const t = await lib();
    // Built-ins are local-only; point transformers.js at the bundled copy.
    t.env.allowLocalModels = true;
    t.env.allowRemoteModels = false;
    t.env.localModelPath = modelsBase();
    t.env.useBrowserCache = typeof caches !== 'undefined';
    const pipe = await t.pipeline('text-generation', id, { dtype: 'q4', device: 'wasm' });
    return pipe;
  })();
  pipes.set(id, p);
  p.catch(() => pipes.delete(id));
  return p;
}

// Generate role-flavoured text. Sampling + repetition suppression keep the tiny
// bigram model from looping (greedy decoding repeats); falls back to '' on error
// so callers can use a template instead — never a fake/hardcoded "model" output.
export async function generate(
  id: string,
  prompt: string,
  opts: { maxNewTokens?: number; temperature?: number } = {},
): Promise<string> {
  try {
    const t = await lib();
    const pipe = await load(id);
    const messages = [{ role: 'user', content: prompt || '' }];
    const out = await pipe(messages, {
      max_new_tokens: opts.maxNewTokens ?? 48,
      do_sample: true,
      temperature: opts.temperature ?? 0.9,
      top_k: 40,
      repetition_penalty: 1.3,
      no_repeat_ngram_size: 2,
    });
    const gen = out?.[0]?.generated_text;
    const text = Array.isArray(gen) ? String(gen[gen.length - 1]?.content ?? '') : String(gen ?? '');
    return text.trim();
  } catch {
    return '';
  }
}

export async function generateForRole(role: string, prompt: string, opts?: { maxNewTokens?: number }) {
  const id = BUILTIN_BY_ROLE[role];
  return id ? generate(id, prompt, opts) : '';
}

// Dev/QA hook so a headless browser can verify on-device loading + inference.
try { if (typeof window !== 'undefined') (window as any).__godagentBuiltin = { load, generate, generateForRole, BUILTIN }; } catch {}
