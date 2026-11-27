#!/usr/bin/env python3
"""Build GODAgent's original small role-specialised models.

Each model is a REAL (if small) statistical language model: a bigram Markov LM
learned from a tiny role-specific corpus and exported in transformers.js format
(config.json, tokenizer.json, generation_config.json, onnx/model_q4.onnx) so the
app can run it fully on-device via transformers.js / ONNX Runtime WASM — offline,
no login. It is NOT a large reasoning LLM; it generates short, role-flavoured
token sequences (idea / prompt / script seeds). With temperature sampling the
output varies; with greedy decoding it follows the most frequent transitions.

Usage:
  python3 build_models.py <role>            # e.g. game  -> dist/godagent-game-idea
  python3 build_models.py <role> --verify   # also run a few greedy steps in onnxruntime

Mechanism mirrors web/e2e/fixtures/make_tiny_model.py:
  logits            = Gather(W, input_ids)                          [b, s, V]
  present.0.key/val = Concat(past.0.key/val, zeros[b,1,s,D], axis=2) [b, 1, p+s, D]
W[i] are the next-token logits after token i (log of smoothed bigram counts).
"""
import json, os, sys, math
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from tokenizers import Tokenizer, models, pre_tokenizers, decoders, AddedToken

HERE = os.path.dirname(os.path.abspath(__file__))

# role -> (model id, corpus file, one-line honest description)
ROLES = {
    'game':   ('godagent-game-idea',    'game.txt',   'ゲームのアイデア/コンセプトの種を生成する小型モデル'),
    'image':  ('godagent-image-prompt', 'image.txt',  '画像生成プロンプトの種を生成する小型モデル'),
    'video':  ('godagent-video-script', 'video.txt',  '動画の台本/絵コンテの種を生成する小型モデル'),
    'edit':   ('godagent-edit-plan',    'edit.txt',   '動画編集プランの語を生成する小型モデル'),
    'router': ('godagent-router',       'router.txt', '依頼をチームへ振り分ける語を生成する補助モデル'),
}

SPECIALS = ['<pad>', '</s>', '<s>', '<|system|>', '<|user|>', '<|assistant|>', '<|end|>']
D = 8          # kv head dim (shape only; model has no real attention)
NEG = -30.0    # logit floor for unobserved transitions
ALPHA = 4.0    # sharpness of the learned distribution (higher = more deterministic)


def build(role, verify=False):
    if role not in ROLES:
        raise SystemExit(f'unknown role {role}; choose from {list(ROLES)}')
    model_id, corpus_file, desc = ROLES[role]
    corpus_path = os.path.join(HERE, 'corpus', corpus_file)
    out = os.path.join(HERE, 'dist', model_id)
    os.makedirs(os.path.join(out, 'onnx'), exist_ok=True)

    # ---- vocab from corpus (whitespace tokens) + specials + [UNK] ----
    lines = [ln.split() for ln in open(corpus_path, encoding='utf-8').read().splitlines() if ln.strip()]
    seen = []
    for toks in lines:
        for t in toks:
            if t not in seen:
                seen.append(t)
    words = seen + ['[UNK]']
    vocab = {t: i for i, t in enumerate(SPECIALS + words)}
    V = len(vocab)
    EOS = vocab['</s>']
    ASSIST = vocab['<|assistant|>']

    # ---- learn bigram counts: each line = <|assistant|> ... </s> ----
    counts = np.zeros((V, V), dtype=np.float64)
    for toks in lines:
        seq = [ASSIST] + [vocab.get(t, vocab['[UNK]']) for t in toks] + [EOS]
        for a, b in zip(seq[:-1], seq[1:]):
            counts[a, b] += 1.0

    # ---- logits W = ALPHA * log(count) ; unseen = NEG ; empty rows -> EOS ----
    W = np.full((V, V), NEG, dtype=np.float32)
    for i in range(V):
        row = counts[i]
        if row.sum() == 0:
            W[i, EOS] = 0.0
            continue
        for j in np.nonzero(row)[0]:
            W[i, j] = ALPHA * math.log(row[j] + 1e-9)

    # ---- ONNX graph (same shape as a 1-layer decoder export with KV cache) ----
    inp = helper.make_tensor_value_info('input_ids', TensorProto.INT64, ['batch', 'seq'])
    mask = helper.make_tensor_value_info('attention_mask', TensorProto.INT64, ['batch', 'total'])
    pk = helper.make_tensor_value_info('past_key_values.0.key', TensorProto.FLOAT, ['batch', 1, 'past', D])
    pv = helper.make_tensor_value_info('past_key_values.0.value', TensorProto.FLOAT, ['batch', 1, 'past', D])
    logits = helper.make_tensor_value_info('logits', TensorProto.FLOAT, ['batch', 'seq', V])
    prk = helper.make_tensor_value_info('present.0.key', TensorProto.FLOAT, ['batch', 1, 'total', D])
    prv = helper.make_tensor_value_info('present.0.value', TensorProto.FLOAT, ['batch', 1, 'total', D])
    inits = [numpy_helper.from_array(W, name='W'),
             numpy_helper.from_array(np.zeros((V, D), dtype=np.float32), name='Z'),
             numpy_helper.from_array(np.array([1], dtype=np.int64), name='ax1')]
    nodes = [
        helper.make_node('Gather', ['W', 'input_ids'], ['logits'], axis=0),
        helper.make_node('Gather', ['Z', 'input_ids'], ['kv_new3'], axis=0),
        helper.make_node('Unsqueeze', ['kv_new3', 'ax1'], ['kv_new']),
        helper.make_node('Concat', ['past_key_values.0.key', 'kv_new'], ['present.0.key'], axis=2),
        helper.make_node('Concat', ['past_key_values.0.value', 'kv_new'], ['present.0.value'], axis=2),
    ]
    graph = helper.make_graph(nodes, f'{model_id}_bigram_kv', [inp, mask, pk, pv], [logits, prk, prv], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)], producer_name='godagent')
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, os.path.join(out, 'onnx', 'model_q4.onnx'))

    # ---- tokenizer + configs (transformers.js format) ----
    tok = Tokenizer(models.WordLevel(vocab=vocab, unk_token='[UNK]'))
    tok.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
    tok.add_special_tokens([AddedToken(t, special=True, normalized=False) for t in SPECIALS])
    tok.decoder = decoders.Fuse()
    tok.save(os.path.join(out, 'tokenizer.json'))

    json.dump({
        'tokenizer_class': 'PreTrainedTokenizerFast',
        'bos_token': '<s>', 'eos_token': '</s>', 'pad_token': '<pad>', 'unk_token': '[UNK]',
        'add_bos_token': False, 'model_max_length': 256,
        'chat_template': "{% for m in messages %}<|{{ m['role'] }}|> {{ m['content'] }} <|end|> {% endfor %}{% if add_generation_prompt %}<|assistant|>{% endif %}",
    }, open(os.path.join(out, 'tokenizer_config.json'), 'w'), ensure_ascii=False)

    json.dump({
        'architectures': ['LlamaForCausalLM'], 'model_type': 'llama',
        'vocab_size': V, 'hidden_size': D, 'num_hidden_layers': 1, 'head_dim': D,
        'num_attention_heads': 1, 'num_key_value_heads': 1,
        'bos_token_id': vocab['<s>'], 'eos_token_id': EOS, 'pad_token_id': vocab['<pad>'],
        '_godagent': {'kind': 'bigram-markov', 'role': role, 'description': desc},
    }, open(os.path.join(out, 'config.json'), 'w'))
    json.dump({'bos_token_id': vocab['<s>'], 'eos_token_id': EOS, 'pad_token_id': vocab['<pad>']},
              open(os.path.join(out, 'generation_config.json'), 'w'))

    size = os.path.getsize(os.path.join(out, 'onnx', 'model_q4.onnx'))
    print(f'[{model_id}] vocab={V} onnx={size} bytes -> {out}')

    if verify:
        _verify(out, vocab, EOS, ASSIST)
    return out


def _verify(out, vocab, EOS, ASSIST, steps=16):
    import onnxruntime as ort
    inv = {i: t for t, i in vocab.items()}
    sess = ort.InferenceSession(os.path.join(out, 'onnx', 'model_q4.onnx'),
                                providers=['CPUExecutionProvider'])
    # greedy walk from <|assistant|>
    cur = ASSIST
    produced = []
    pk = np.zeros((1, 1, 0, D), dtype=np.float32)
    pv = np.zeros((1, 1, 0, D), dtype=np.float32)
    total = 0
    for _ in range(steps):
        ids = np.array([[cur]], dtype=np.int64)
        total += 1
        am = np.ones((1, total), dtype=np.int64)
        o = sess.run(None, {'input_ids': ids, 'attention_mask': am,
                            'past_key_values.0.key': pk, 'past_key_values.0.value': pv})
        logits, pk, pv = o
        nxt = int(np.argmax(logits[0, -1]))
        if nxt == EOS:
            break
        produced.append(inv.get(nxt, '?'))
        cur = nxt
    txt = ''.join(w for w in produced if not w.startswith('<'))
    print('  greedy sample:', txt)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('usage: build_models.py <role> [--verify]')
    build(sys.argv[1], verify='--verify' in sys.argv[2:])
