// Hugging Face models, downloaded and run on the device with transformers.js.
// No account or token: only public models are used, fetched anonymously from
// huggingface.co. Downloaded files are kept in the browser cache
// ("transformers-cache"), so after the first download a model works offline.

type Progress = { loaded: number; total: number; pct: number; file?: string };

const REG_KEY = 'godagent.hfmodels.v1';
const HF = 'https://huggingface.co';

export interface InstalledModel { id: string; dtype: string; bytes: number; ts: number }

export const RECOMMENDED = [
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B Instruct', note: '日本語対応・おすすめ' },
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'SmolLM2 360M Instruct', note: '軽量・英語向け' },
  { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'SmolLM2 135M Instruct', note: '最軽量・英語向け' },
  { id: 'onnx-community/Llama-3.2-1B-Instruct', label: 'Llama 3.2 1B Instruct', note: '高性能・サイズ大' },
];

// ---- library (lazy) ------------------------------------------------------
let tf: any = null;
async function lib() {
  if (tf) return tf;
  tf = await import('@huggingface/transformers');
  tf.env.allowLocalModels = false;
  tf.env.allowRemoteModels = true;
  tf.env.useBrowserCache = typeof caches !== 'undefined';
  const ort = tf.env.backends?.onnx?.wasm;
  if (ort) {
    ort.numThreads = 1; // no SharedArrayBuffer in a WebView / artifact
    // ONNX Runtime's .wasm is bundled next to the app (Vite emits it). Clearing
    // wasmPaths makes ORT load that local copy instead of the jsDelivr CDN.
    // The single-file web artifact can't carry the 21 MB file, so it keeps the CDN.
    const inApk = location.hostname === 'godagent.local' || location.protocol === 'file:';
    const singleFileWeb = !!(import.meta as any).env?.VITE_SINGLEFILE && !inApk;
    if (!singleFileWeb) delete ort.wasmPaths;
  }
  return tf;
}

export function hasWebGPU() { return typeof navigator !== 'undefined' && !!(navigator as any).gpu; }
// navigator.gpu can exist without a usable adapter (common in Android WebViews).
let gpuChecked: Promise<boolean> | null = null;
function gpuUsable() {
  return gpuChecked ??= (async () => {
    try { return hasWebGPU() && !!(await (navigator as any).gpu.requestAdapter()); } catch { return false; }
  })();
}

// ---- registry of downloaded models ---------------------------------------
export function installed(): InstalledModel[] {
  try { return JSON.parse(localStorage.getItem(REG_KEY) || '[]'); } catch { return []; }
}
function saveRegistry(list: InstalledModel[]) { try { localStorage.setItem(REG_KEY, JSON.stringify(list)); } catch {} }
export function isInstalled(id: string) { return installed().some((m) => m.id === id); }

// ---- Hugging Face Hub (anonymous) ----------------------------------------
export async function search(q: string) {
  const u = `${HF}/api/models?library=transformers.js&pipeline_tag=text-generation&sort=downloads&direction=-1&limit=20` + (q ? `&search=${encodeURIComponent(q)}` : '');
  const r = await fetch(u);
  if (!r.ok) throw new Error(`検索に失敗しました (${r.status})`);
  const list = await r.json();
  return (list as any[]).map((m) => ({ id: String(m.id || m.modelId), downloads: m.downloads || 0, likes: m.likes || 0 }));
}

// Pick the smallest weights that the runtime handles, from the files the repo actually has.
const PREFERENCE = [
  { dtype: 'q4', file: 'model_q4.onnx' },
  { dtype: 'q4f16', file: 'model_q4f16.onnx' },
  { dtype: 'q8', file: 'model_quantized.onnx' },
  { dtype: 'fp16', file: 'model_fp16.onnx' },
  { dtype: 'fp32', file: 'model.onnx' },
];

export async function inspect(id: string) {
  const r = await fetch(`${HF}/api/models/${id}/tree/main/onnx`);
  if (!r.ok) throw new Error(r.status === 404 ? 'onnx フォルダが無いため、このアプリでは使えないモデルです' : `情報の取得に失敗しました (${r.status})`);
  const files: any[] = await r.json();
  const byName = new Map(files.map((f) => [String(f.path).replace(/^onnx\//, ''), f]));
  for (const p of PREFERENCE) {
    const f = byName.get(p.file);
    if (!f) continue;
    let bytes = (f.lfs?.size ?? f.size) || 0;
    for (const [name, g] of byName) if (name.startsWith(p.file + '_data')) bytes += (g.lfs?.size ?? g.size) || 0;
    return { dtype: p.dtype, bytes };
  }
  throw new Error('対応する重みファイルが見つかりません');
}

// ---- load / download ------------------------------------------------------
const pipes = new Map<string, Promise<any>>();

export function load(id: string, dtype?: string, onProgress?: (p: Progress) => void) {
  if (pipes.has(id)) return pipes.get(id)!;
  const files = new Map<string, { loaded: number; total: number }>();
  const p = (async () => {
    const t = await lib();
    const reg = installed().find((m) => m.id === id);
    const useDtype = dtype || reg?.dtype || (await inspect(id)).dtype;
    const progress_callback = (e: any) => {
        if (e.status === 'progress' && e.file) {
          files.set(e.file, { loaded: e.loaded || 0, total: e.total || 0 });
          let loaded = 0, total = 0;
          for (const f of files.values()) { loaded += f.loaded; total += f.total; }
          onProgress?.({ loaded, total, pct: total ? Math.round((loaded / total) * 100) : 0, file: e.file });
        }
    };
    let pipe: any;
    if (await gpuUsable()) {
      try { pipe = await t.pipeline('text-generation', id, { dtype: useDtype, device: 'webgpu', progress_callback }); }
      catch { pipe = null; } // fall back to WebAssembly below
    }
    if (!pipe) pipe = await t.pipeline('text-generation', id, { dtype: useDtype, device: 'wasm', progress_callback });
    if (!isInstalled(id)) {
      let bytes = 0; for (const f of files.values()) bytes += f.total;
      saveRegistry([...installed(), { id, dtype: useDtype, bytes, ts: Date.now() }]);
    }
    return pipe;
  })();
  pipes.set(id, p);
  p.catch(() => pipes.delete(id));
  return p;
}

export async function remove(id: string) {
  pipes.delete(id);
  saveRegistry(installed().filter((m) => m.id !== id));
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    for (const req of await c.keys()) if (req.url.includes(`/${id}/`)) await c.delete(req);
  }
}

// ---- generation -----------------------------------------------------------
export async function generate(
  id: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onText: (text: string) => void,
  opts: { maxNewTokens?: number; onProgress?: (p: Progress) => void } = {},
) {
  const t = await lib();
  const pipe = await load(id, undefined, opts.onProgress);
  let acc = '';
  const streamer = new t.TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (txt: string) => { acc += txt; onText(acc); },
  });
  const out = await pipe(messages, { max_new_tokens: opts.maxNewTokens ?? 256, do_sample: false, streamer });
  const gen = out?.[0]?.generated_text;
  const final = Array.isArray(gen) ? String(gen[gen.length - 1]?.content ?? acc) : acc;
  return final.trim();
}

export function fmtBytes(n: number) {
  if (!n) return '不明';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  return Math.round(n / 1e6) + ' MB';
}
