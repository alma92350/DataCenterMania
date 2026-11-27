import { fastForward, type WakeUp } from './fastforward';
import type { GameState } from './types';

export interface FastForwardRequest {
  id: number;
  state: GameState;
  maxMinutes: number;
}
export interface FastForwardReply {
  id: number;
  state: GameState;
  woke: WakeUp | null;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<FastForwardRequest>) => void) | null; postMessage(m: FastForwardReply): void };
scope.onmessage = (e) => {
  const { id, state, maxMinutes } = e.data;
  const woke = fastForward(state, maxMinutes);
  scope.postMessage({ id, state, woke });
};
