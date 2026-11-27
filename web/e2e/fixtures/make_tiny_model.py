#!/usr/bin/env python3
"""Build a tiny but REAL text-generation model in transformers.js format, used
to test GODAgent's Hugging Face download + on-device inference end to end
without network access (the test serves it in place of huggingface.co).

It is a "bigram" LM: logits for the next token = W[current token]. With greedy
decoding it answers every chat prompt with: こんにちは、テストです。
Layout mirrors a Hub repo: config.json, generation_config.json, tokenizer.json,
tokenizer_config.json, onnx/model_q4.onnx.
"""
import json, os, sys
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from tokenizers import Tokenizer, models, pre_tokenizers, decoders, AddedToken

out = sys.argv[1]
os.makedirs(os.path.join(out, 'onnx'), exist_ok=True)

specials = ['<pad>', '</s>', '<s>', '<|system|>', '<|user|>', '<|assistant|>', '<|end|>']
words = ['こんにちは', '、', 'テスト', 'です', '。', '[UNK]']
vocab = {t: i for i, t in enumerate(specials + words)}
V = len(vocab)
EOS = vocab['</s>']

# next-token chain after the assistant marker
chain = {
    vocab['<|assistant|>']: vocab['こんにちは'],
    vocab['こんにちは']: vocab['、'],
    vocab['、']: vocab['テスト'],
    vocab['テスト']: vocab['です'],
    vocab['です']: vocab['。'],
    vocab['。']: EOS,
}
W = np.zeros((V, V), dtype=np.float32)
for i in range(V):
    W[i, chain.get(i, EOS)] = 10.0

# ONNX graph, shaped like a real 1-layer decoder export with a KV cache:
#   logits            = Gather(W, input_ids)                         [b, s, V]
#   present.0.key/val = Concat(past.0.key/val, zeros[b,1,s,D], axis=2)  [b, 1, p+s, D]
D = 8
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
    helper.make_node('Gather', ['Z', 'input_ids'], ['kv_new3'], axis=0),        # [b, s, D]
    helper.make_node('Unsqueeze', ['kv_new3', 'ax1'], ['kv_new']),             # [b, 1, s, D]
    helper.make_node('Concat', ['past_key_values.0.key', 'kv_new'], ['present.0.key'], axis=2),
    helper.make_node('Concat', ['past_key_values.0.value', 'kv_new'], ['present.0.value'], axis=2),
]
graph = helper.make_graph(nodes, 'tiny_bigram_kv', [inp, mask, pk, pv], [logits, prk, prv], inits)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)], producer_name='godagent-test')
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, os.path.join(out, 'onnx', 'model_q4.onnx'))

# tokenizer.json (WordLevel, specials matched as added tokens, fused decoding)
tok = Tokenizer(models.WordLevel(vocab=vocab, unk_token='[UNK]'))
tok.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
tok.add_special_tokens([AddedToken(t, special=True, normalized=False) for t in specials])
tok.decoder = decoders.Fuse()
tok.save(os.path.join(out, 'tokenizer.json'))

json.dump({
    'tokenizer_class': 'PreTrainedTokenizerFast',
    'bos_token': '<s>', 'eos_token': '</s>', 'pad_token': '<pad>', 'unk_token': '[UNK]',
    'add_bos_token': False, 'model_max_length': 512,
    'chat_template': "{% for m in messages %}<|{{ m['role'] }}|> {{ m['content'] }} <|end|> {% endfor %}{% if add_generation_prompt %}<|assistant|>{% endif %}",
}, open(os.path.join(out, 'tokenizer_config.json'), 'w'), ensure_ascii=False)

json.dump({
    'architectures': ['LlamaForCausalLM'], 'model_type': 'llama',
    'vocab_size': V, 'hidden_size': 8, 'num_hidden_layers': 1, 'head_dim': 8,
    'num_attention_heads': 1, 'num_key_value_heads': 1,
    'bos_token_id': vocab['<s>'], 'eos_token_id': EOS, 'pad_token_id': vocab['<pad>'],
}, open(os.path.join(out, 'config.json'), 'w'))
json.dump({'bos_token_id': vocab['<s>'], 'eos_token_id': EOS, 'pad_token_id': vocab['<pad>']},
          open(os.path.join(out, 'generation_config.json'), 'w'))
print('tiny model ->', out, 'vocab', V)
