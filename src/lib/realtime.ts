// Real-time sync between the two phones, using Supabase Realtime.
//
// * Broadcast: after any change (a guess, a new game, new words) the phone
//   that made it sends a tiny "changed" ping. The ping carries no game data;
//   the other phone reacts by re-fetching its own view through the secure
//   functions. So nothing secret ever travels over the channel.
// * Presence: each open app announces which player it is and which screen it
//   is on, which powers "Menaka is on the board" and "Waiting for player".
//
// If the channel can't connect (offline, Realtime disabled), the app falls
// back to polling, so it degrades to "a few seconds late", never "stuck".
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Slot } from './types';

export type ChangeKind = 'game' | 'words' | 'room';
export type Screen = 'home' | 'game' | 'words' | 'stats' | 'history' | 'settings' | 'other';

export interface PresenceInfo {
  slot: Slot;
  screen: Screen;
  device: string;
  at: number;
}

export interface Ping {
  kind: ChangeKind;
  slot: Slot | null;
  what?: string;
}

async function topicFor(roomKey: string) {
  // The channel name is derived from the room key but doesn't reveal it.
  const bytes = new TextEncoder().encode('bb-wordle-channel:' + roomKey);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'bbw-' + [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class RoomChannel {
  private channel: RealtimeChannel | null = null;
  private me: PresenceInfo;
  private closed = false;
  connected = false;

  constructor(
    private roomKey: string,
    me: PresenceInfo,
    private handlers: {
      onPing: (p: Ping) => void;
      onPresence: (others: PresenceInfo[]) => void;
      onStatus: (connected: boolean) => void;
    },
  ) {
    this.me = me;
  }

  async open() {
    if (!supabase) return;
    const topic = await topicFor(this.roomKey);
    if (this.closed) return;
    const ch = supabase.channel(topic, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.me.device } },
    });
    ch.on('broadcast', { event: 'changed' }, ({ payload }) => this.handlers.onPing(payload as Ping));
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceInfo>();
      const all = Object.values(state).flat() as unknown as PresenceInfo[];
      this.handlers.onPresence(all.filter((p) => p.device !== this.me.device));
    });
    ch.subscribe((status) => {
      const ok = status === 'SUBSCRIBED';
      this.connected = ok;
      this.handlers.onStatus(ok);
      if (ok) void ch.track(this.me);
    });
    this.channel = ch;
  }

  setPresence(update: Partial<PresenceInfo>) {
    this.me = { ...this.me, ...update, at: Date.now() };
    if (this.channel && this.connected) void this.channel.track(this.me);
  }

  ping(kind: ChangeKind, what?: string) {
    if (!this.channel || !this.connected) return;
    void this.channel.send({ type: 'broadcast', event: 'changed', payload: { kind, slot: this.me.slot, what } satisfies Ping });
  }

  close() {
    this.closed = true;
    if (this.channel && supabase) void supabase.removeChannel(this.channel);
    this.channel = null;
  }
}
