import { create } from "zustand";
import {
  acceptHandoff,
  applyAction,
  describe,
  finishTurn,
  pendingFrom,
  refund,
  spend,
  startGame,
  type BuyKind,
} from "./logic";
import type { Action, GameState, SeatSetup } from "./types";

const KEY = "tiece-save-v1";

function persist(game: GameState | null) {
  if (typeof window === "undefined") return;
  if (!game) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(game));
}

interface GameStore {
  game: GameState | null;
  seats: SeatSetup[];
  selectedHex: number | null;
  selectedNation: number | null;
  banner: string;
  pulse: number | null;
  hydrated: boolean;
  hydrate: () => void;
  start: (seats: SeatSetup[], seed?: number) => void;
  abandon: () => void;
  selectHex: (id: number | null) => void;
  selectNation: (id: number | null) => void;
  buy: (kind: BuyKind) => void;
  unbuy: (kind: BuyKind) => void;
  stage: (action: Action) => void;
  confirm: () => void;
  cancel: () => void;
  endTurn: () => void;
  handoff: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  seats: [],
  selectedHex: null,
  selectedNation: null,
  banner: "",
  pulse: null,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const game = JSON.parse(raw) as GameState;
        if (game?.version === 1 && Array.isArray(game.nations) && game.nations.length > 0) {
          set({
            game,
            hydrated: true,
            selectedNation: game.order[game.cursor] ?? null,
            banner: "",
          });
          return;
        }
      }
    } catch {
      /* ignore broken saves */
    }
    set({ hydrated: true });
  },
  start: (seats, seed) => {
    const game = startGame(seats, seed);
    persist(game);
    set({
      game,
      seats,
      selectedHex: null,
      selectedNation: game.order[0] ?? null,
      banner: "版圖生成了。先看領地，再分配本季生產。",
      pulse: null,
    });
  },
  abandon: () => {
    persist(null);
    set({ game: null, selectedHex: null, selectedNation: null, banner: "", pulse: null });
  },
  selectHex: (id) => set({ selectedHex: id }),
  selectNation: (id) => set({ selectedNation: id }),
  buy: (kind) => {
    const game = get().game;
    if (!game) return;
    const next = spend(game, kind);
    persist(next);
    set({ game: next });
  },
  unbuy: (kind) => {
    const game = get().game;
    if (!game) return;
    const next = refund(game, kind);
    persist(next);
    set({ game: next });
  },
  stage: (action) => {
    const game = get().game;
    if (!game || game.phase !== "play") return;
    const pending = pendingFrom(game, action);
    if (!pending) {
      set({ banner: describe(game, action).reason });
      return;
    }
    const next = { ...game, pending };
    persist(next);
    set({ game: next, banner: "" });
  },
  confirm: () => {
    const game = get().game;
    if (!game?.pending || game.phase !== "play") return;
    const result = applyAction(game, game.pending.action);
    const cleared = result.state.phase === "play" ? { ...result.state, pending: null } : result.state;
    persist(cleared);
    set({
      game: cleared,
      banner: result.message,
      pulse: result.pulse ?? null,
      selectedHex: result.pulse ?? get().selectedHex,
    });
  },
  cancel: () => {
    const game = get().game;
    if (!game?.pending) return;
    const next = { ...game, pending: null };
    persist(next);
    set({ game: next });
  },
  endTurn: () => {
    const game = get().game;
    if (!game || game.phase !== "play") return;
    const next = finishTurn({ ...game, pending: null });
    persist(next);
    set({
      game: next,
      selectedHex: null,
      selectedNation: next.order[next.cursor] ?? null,
      banner: next.phase === "ended" ? next.endReason : "本季結束。",
      pulse: null,
    });
  },
  handoff: () => {
    const game = get().game;
    if (!game) return;
    const next = acceptHandoff(game);
    persist(next);
    set({ game: next, selectedHex: null, selectedNation: next.order[next.cursor] ?? null, banner: "" });
  },
}));
