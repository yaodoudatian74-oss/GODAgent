// Per-bot pub/sub so SSE clients receive streaming tokens, card updates,
// state changes, routine runs and computer frames in real time.
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export const bus = {
  // channel is a botId, or '*' for global (routine list changes, settings...)
  emit(channel, event, payload) {
    emitter.emit(channel, { event, payload });
    if (channel !== '*') emitter.emit('*', { event, payload, channel });
  },
  on(channel, fn) {
    emitter.on(channel, fn);
    return () => emitter.off(channel, fn);
  },
};
