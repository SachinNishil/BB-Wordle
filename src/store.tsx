import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, friendlyError } from './lib/api';
import { deviceId, getSlot, setSlot as saveSlot, stripLegacyInvite } from './lib/identity';
import { RoomChannel, type ChangeKind, type PresenceInfo, type Screen } from './lib/realtime';
import type { GameView, HistoryGame, Player, Slot, WordRow } from './lib/types';
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
  words: WordRow[] | null;
  history: HistoryGame[] | null;
  active: GameView | null;
  activeLoaded: boolean;
  /** Increments whenever game data may have changed; screens refetch on it. */
  pulse: number;
  online: boolean;
  realtime: boolean;
  partnerPresence: PresenceInfo[];
  toasts: Toast[];

  chooseSlot: (s: Slot) => void;
  setPlayers: (p: Player[]) => void;
  refreshWords: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshActive: () => Promise<void>;
  setActive: (g: GameView | null) => void;
  ping: (kind: ChangeKind, what?: string) => void;
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
  return (['home', 'game', 'words', 'stats', 'history', 'settings'] as Screen[]).includes(first as Screen) ? (first as Screen) : 'other';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const route = useRoute();
  useState(() => stripLegacyInvite());
  const [slot, setSlotState] = useState<Slot | null>(() => getSlot());
  const [players, setPlayersState] = useState<Record<Slot, Player>>(DEFAULT_PLAYERS);
  const [words, setWords] = useState<WordRow[] | null>(null);
  const [history, setHistory] = useState<HistoryGame[] | null>(null);
  const [active, setActiveState] = useState<GameView | null>(null);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [realtime, setRealtime] = useState(false);
  const [presence, setPresence] = useState<PresenceInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const channel = useRef<RoomChannel | null>(null);
  const toastId = useRef(0);
  const prevActive = useRef<GameView | null>(null);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
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
    } catch {
      /* offline: keep what we have */
    }
  }, [setPlayers]);

  const refreshWords = useCallback(async () => {
    try {
      setWords(await api.listWords());
    } catch (e) {
      reportError(e);
    }
  }, [reportError]);

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
      void refreshWords();
    }
  }, [active, refreshHistory, refreshWords]);

  // Just updated itself? Say so once, with a link to what's new.
  useEffect(() => {
    const seen = load<string | null>('bbw.seenVersion', null);
    save('bbw.seenVersion', APP_VERSION);
    if (seen && seen !== APP_VERSION) {
      setTimeout(() => toast(`Updated to v${APP_VERSION}`, 'win', { label: "What's new", run: () => go('/versions') }), 800);
    }
  }, [toast]);

  const ping = useCallback((kind: ChangeKind, what?: string) => channel.current?.ping(kind, what), []);

  // Initial load.
  useEffect(() => {
    void refreshRoom();
    void refreshWords();
    void refreshHistory();
  }, [refreshRoom, refreshWords, refreshHistory]);
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
            if ((p.what === 'started' || p.what === 'challenged') && p.slot && p.slot !== slot) {
              navigator.vibrate?.([30, 60, 30]);
              const from = namesRef.current[p.slot].name;
              toast(p.what === 'challenged' ? `⚔️ ${from} challenged you!` : `${from} started a game!`, 'info', {
                label: p.what === 'challenged' ? 'Pick a word' : 'Join',
                run: () => go('/game'),
              });
            }
            if (p.what === 'finished') void refreshHistory();
          }
          if (p.kind === 'words') void refreshWords();
          if (p.kind === 'room') void refreshRoom();
        },
        onPresence: (others) => setPresence(others),
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
    void ch.open();
    return () => {
      ch.close();
      channel.current = null;
      setRealtime(false);
    };
  }, [slot, refreshActive, refreshWords, refreshRoom, refreshHistory, toast]);

  // Tell the partner which screen we're on.
  const screen = screenFor(route.path);
  useEffect(() => {
    channel.current?.setPresence({ screen });
  }, [screen, realtime]);

  // Polling safety net: fast when realtime is down, slow when it's up.
  useEffect(() => {
    if (!slot) return;
    const ms = realtime ? (screen === 'game' ? 15000 : 30000) : screen === 'game' ? 2500 : 8000;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPulse((x) => x + 1);
      void refreshActive();
    }, ms);
    return () => clearInterval(t);
  }, [slot, realtime, screen, refreshActive]);

  // Coming back to the app or back online: refresh everything.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      setPulse((x) => x + 1);
      void refreshActive();
      void refreshRoom();
    };
    const up = () => {
      setOnline(true);
      wake();
    };
    const down = () => setOnline(false);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [refreshActive, refreshRoom]);

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
      words,
      history,
      active,
      activeLoaded,
      pulse,
      online,
      realtime,
      partnerPresence: presence.filter((p) => p.slot !== slot),
      toasts,
      chooseSlot,
      setPlayers,
      refreshWords,
      refreshHistory,
      refreshActive,
      setActive,
      ping,
      toast,
      dismissToast,
      reportError,
    }),
    [slot, players, words, history, active, activeLoaded, pulse, online, realtime, presence, toasts,
      chooseSlot, setPlayers, refreshWords, refreshHistory, refreshActive, setActive, ping, toast, dismissToast, reportError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
