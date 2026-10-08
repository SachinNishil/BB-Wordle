import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, friendlyError } from './lib/api';
import { deviceId, getSlot, setSlot as saveSlot, stripLegacyInvite } from './lib/identity';
import { RoomChannel, type ChangeKind, type PresenceInfo, type Screen, type TypingInfo } from './lib/realtime';
import { feedTaunts } from './lib/tauntFeed';
import { serverNow } from './lib/clock';
import type { GameView, HistoryGame, Player, Slot, Taunt, WordSettings } from './lib/types';
import { load, save } from './lib/storage';
import { APP_VERSION } from './lib/versions';
import { go, useRoute } from './router';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'win' | 'error';
  action?: { label: string; run: () => void };
}

interface Store {
  slot: Slot | null;
  players: Record<Slot, Player>;
  me: Player | null;
  partner: Player | null;
  history: HistoryGame[] | null;
  active: GameView | null;
  activeLoaded: boolean;
  /** Increments whenever game data may have changed; screens refetch on it. */
  pulse: number;
  online: boolean;
  realtime: boolean;
  partnerPresence: PresenceInfo[];
  /** Partner has the app open on screen right now (green dot, v1.6). */
  partnerOnline: boolean;
  /** Settings › Classic words, shared by both phones (v1.6). */
  wordSettings: WordSettings | null;
  setWordSettingsLocal: (w: WordSettings) => void;
  /** The results screen shows its own Rematch button, so no "started a game" toast there (v1.6.1). */
  setQuietInvites: (quiet: boolean) => void;
  toasts: Toast[];
  /** What my partner is typing right now (spectator mode, v1.5). */
  partnerTyping: (TypingInfo & { at: number }) | null;

  chooseSlot: (s: Slot) => void;
  setPlayers: (p: Player[]) => void;
  refreshHistory: () => Promise<void>;
  refreshActive: () => Promise<void>;
  setActive: (g: GameView | null) => void;
  ping: (kind: ChangeKind, what?: string) => void;
  /** Push a trash talk message straight to the partner's phone. */
  pushTaunt: (game: string, t: Taunt) => void;
  /** Send the letters in my current row (only used while my partner spectates). */
  sendTyping: (game: string, row: number, text: string) => void;
  toast: (text: string, tone?: Toast['tone'], action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  reportError: (e: unknown) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

const DEFAULT_PLAYERS: Record<Slot, Player> = {
  1: { slot: 1, name: 'Sachin', photo: null },
  2: { slot: 2, name: 'Menaka', photo: null },
};

function screenFor(path: string): Screen {
  const first = path.split('/')[1] || 'home';
  return (['home', 'game', 'stats', 'history', 'settings'] as Screen[]).includes(first as Screen) ? (first as Screen) : 'other';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const route = useRoute();
  useState(() => stripLegacyInvite());
  const [slot, setSlotState] = useState<Slot | null>(() => getSlot());
  const [players, setPlayersState] = useState<Record<Slot, Player>>(DEFAULT_PLAYERS);
  const [history, setHistory] = useState<HistoryGame[] | null>(null);
  const [active, setActiveState] = useState<GameView | null>(null);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtime, setRealtime] = useState(false);
  const [presence, setPresence] = useState<PresenceInfo[]>([]);
  const [wordSettings, setWordSettings] = useState<WordSettings | null>(null);
  const [tick, setTick] = useState(0);
  const roomSeen = useRef<{ status: string | null | undefined; words: string | undefined } | null>(null);
  const screenRef = useRef<string>('home');
  const quietInvites = useRef(false);
  const setQuietInvites = useCallback((q: boolean) => { quietInvites.current = q; }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [partnerTyping, setPartnerTyping] = useState<Store['partnerTyping']>(null);
  // Bumped to rebuild the live channel after the app comes back from the background.
  const [channelGen, setChannelGen] = useState(0);
  const channel = useRef<RoomChannel | null>(null);
  const toastId = useRef(0);
  const prevActive = useRef<GameView | null>(null);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 2600);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const reportError = useCallback((e: unknown) => toast(friendlyError(e), 'error'), [toast]);

  const setPlayers = useCallback((list: Player[]) => {
    const next = { ...DEFAULT_PLAYERS };
    for (const p of list) next[p.slot] = p;
    setPlayersState(next);
  }, []);

  const refreshRoom = useCallback(async () => {
    try {
      const r = await api.getRoom();
      setPlayers(r.players);
      if (r.word_settings) setWordSettings(r.word_settings);
      // Partner news: a new speech bubble, or changed Classic words.
      const other = slot ? r.players.find((p) => p.slot !== slot) : undefined;
      const now = { status: other?.status_at ? `${other.status_at}|${other.status_text}` : null, words: r.word_settings?.changed_at };
      const before = roomSeen.current;
      roomSeen.current = now;
      if (before && other) {
        if (now.status && now.status !== before.status && other.status_text) {
          navigator.vibrate?.(20);
          if (screenRef.current !== 'home') toast(`💬 ${other.name}: ${other.status_text}`, 'info', { label: 'See', run: () => go('/') });
        }
        if (now.words && now.words !== before.words && r.word_settings?.changed_by === other.slot && screenRef.current !== 'settings') {
          toast(`${other.name} changed the Classic words`, 'info', { label: 'See', run: () => go('/settings') });
        }
      }
    } catch {
      /* offline: keep what we have */
    }
  }, [setPlayers, slot, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.getHistory());
    } catch (e) {
      reportError(e);
    }
  }, [reportError]);

  const setActive = useCallback((g: GameView | null) => {
    setActiveState(g && g.status !== 'completed' ? g : null);
    setActiveLoaded(true);
  }, []);

  const refreshActive = useCallback(async () => {
    if (!slot) return;
    try {
      const s = await api.getGameState(slot);
      setActive(s.game);
      if (s.game) feedTaunts(s.game.id, s.game.taunts, slot);
      setOnline(true);
    } catch (e) {
      if (e instanceof ApiError && e.network) setOnline(false);
    }
  }, [slot, setActive]);

  // When the active game disappears it has completed: history changed.
  useEffect(() => {
    const before = prevActive.current;
    prevActive.current = active;
    if (before && !active) {
      void refreshHistory();
    }
  }, [active, refreshHistory]);

  // Just updated itself? Say so once, with a link to what's new.
  useEffect(() => {
    const seen = load<string | null>('bbw.seenVersion', null);
    save('bbw.seenVersion', APP_VERSION);
    if (seen && seen !== APP_VERSION) {
      setTimeout(() => toast(`Updated to v${APP_VERSION}`, 'win', { label: "What's new", run: () => go('/versions') }), 800);
    }
  }, [toast]);

  const ping = useCallback((kind: ChangeKind, what?: string) => channel.current?.ping(kind, what), []);
  const pushTaunt = useCallback((game: string, taunt: Taunt) => channel.current?.taunt({ game, taunt }), []);
  const sendTyping = useCallback(
    (game: string, row: number, text: string) => {
      if (slot) channel.current?.typing({ game, slot, row, text });
    },
    [slot],
  );

  // Initial load.
  useEffect(() => {
    void refreshRoom();
    void refreshHistory();
  }, [refreshRoom, refreshHistory]);
  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  // Realtime channel for this room.
  const namesRef = useRef(players);
  namesRef.current = players;
  useEffect(() => {
    if (!slot) return;
    const ch = new RoomChannel(
      { slot, screen: screenFor(location.hash.slice(1) || '/'), device: deviceId(), at: Date.now() },
      {
        onPing: (p) => {
          if (p.kind === 'game') {
            setPulse((x) => x + 1);
            void refreshActive();
            if ((p.what === 'started' || p.what === 'challenged') && p.slot && p.slot !== slot && !quietInvites.current) {
              navigator.vibrate?.([30, 60, 30]);
              const from = namesRef.current[p.slot].name;
              toast(p.what === 'challenged' ? `⚔️ ${from} challenged you!` : `${from} started a game!`, 'info', {
                label: p.what === 'challenged' ? 'Pick a word' : 'Join',
                run: () => go('/game'),
              });
            }
            if (p.what === 'finished') void refreshHistory();
          }
          if (p.kind === 'room') void refreshRoom();
        },
        onTaunt: (p) => {
          if (p?.taunt && p.taunt.from !== slot) feedTaunts(p.game, [p.taunt], slot);
        },
        onTyping: (t) => {
          if (t && t.slot !== slot) setPartnerTyping({ ...t, at: Date.now() });
        },
        onPresence: (others) => {
          setPresence(others);
          // Partner moved screens (e.g. into a game): a cheap moment to catch up.
          void refreshActive();
        },
        onStatus: (ok) => {
          setRealtime(ok);
          if (ok) {
            // Catch up on anything missed while disconnected.
            setPulse((x) => x + 1);
            void refreshActive();
          }
        },
      },
    );
    channel.current = ch;
    ch.setVisible(document.visibilityState === 'visible');
    void ch.open();
    const beat = setInterval(() => ch.heartbeat(), 25000);
    return () => {
      clearInterval(beat);
      ch.close();
      channel.current = null;
      setRealtime(false);
    };
  }, [slot, refreshActive, refreshRoom, refreshHistory, toast, channelGen]);

  // Tell the partner which screen we're on.
  const screen = screenFor(route.path);
  screenRef.current = screen;
  useEffect(() => {
    channel.current?.setPresence({ screen });
  }, [screen, realtime]);

  // Polling safety net: fast when realtime is down, slow when it's up.
  useEffect(() => {
    if (!slot) return;
    // While one of you has finished and the other is still going, trash talk
    // and spectating need to feel live even if the channel has quietly dropped.
    const done = (x?: string) => x === 'solved' || x === 'failed';
    const hot = !!active && done(active.me.status) !== done(active.partner.status);
    const watching = hot && (active!.me.status === 'solved' || active!.me.status === 'failed') && screen === 'game';
    const ms = watching ? 2000 : hot ? 3000 : realtime ? (screen === 'game' ? 10000 : 15000) : screen === 'game' ? 2500 : 8000;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPulse((x) => x + 1);
      void refreshActive();
    }, ms);
    return () => clearInterval(t);
  }, [slot, realtime, screen, refreshActive, active?.me.status, active?.partner.status]); // eslint-disable-line

  // Coming back to the app or back online: refresh everything.
  useEffect(() => {
    let hiddenAt = 0;
    const wake = () => {
      const visible = document.visibilityState === 'visible';
      channel.current?.setVisible(visible);
      if (!visible) {
        hiddenAt = Date.now();
        return;
      }
      // Back after a while: the old connection may look alive but be dead
      // (common on iPhones), so start a fresh one.
      if (hiddenAt && Date.now() - hiddenAt > 4000) setChannelGen((x) => x + 1);
      hiddenAt = 0;
      setPulse((x) => x + 1);
      void refreshActive();
      void refreshRoom();
    };
    const up = () => {
      setOnline(true);
      setChannelGen((x) => x + 1);
      wake();
    };
    const down = () => setOnline(false);
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setChannelGen((x) => x + 1);
        setPulse((x) => x + 1);
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', shown);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', shown);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [refreshActive, refreshRoom]);

  // Re-check the online dot every 10 s (presence goes stale if a phone just vanishes).
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10000);
    return () => clearInterval(t);
  }, []);
  const partnerOnline = useMemo(
    () => presence.some((p) => p.slot !== slot && serverNow() - (p.at ?? 0) < 70000),
    [presence, slot, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const chooseSlot = useCallback((s: Slot) => {
    saveSlot(s);
    setSlotState(s);
    setActiveLoaded(false);
  }, []);

  const value = useMemo<Store>(
    () => ({
      slot,
      players,
      me: slot ? players[slot] : null,
      partner: slot ? players[(3 - slot) as Slot] : null,
      history,
      active,
      activeLoaded,
      pulse,
      online,
      realtime,
      partnerPresence: presence.filter((p) => p.slot !== slot),
      partnerOnline,
      wordSettings,
      setWordSettingsLocal: setWordSettings,
      setQuietInvites,
      toasts,
      chooseSlot,
      setPlayers,
      refreshHistory,
      refreshActive,
      setActive,
      ping,
      pushTaunt,
      sendTyping,
      partnerTyping,
      toast,
      dismissToast,
      reportError,
    }),
    [slot, players, history, active, activeLoaded, pulse, online, realtime, presence, toasts, partnerOnline, wordSettings,
      chooseSlot, setPlayers, refreshHistory, refreshActive, setActive, ping, pushTaunt, sendTyping, partnerTyping, toast, dismissToast, reportError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
