import type {
  Action,
  Buy,
  GameState,
  HexCell,
  Nation,
  PendingAction,
  Relation,
  SeatSetup,
  SystemId,
  Terrain,
} from "./types";

export const SEASONS = ["春", "夏", "秋", "冬"] as const;
export const YEAR_CAP = 8;
export const MAJORITY = 0.42;

export const SYSTEMS: Record<
  SystemId,
  {
    label: string;
    blurb: string;
    admin: number;
    legis: number;
    judicial: number;
    armyMul: number;
    prod: number;
    ally: number;
    def: number;
    popStep: number;
    armyStep: number;
  }
> = {
  republic: {
    label: "共和",
    blurb: "立法較強，較易結盟，擴軍較穩。",
    admin: 0,
    legis: 2,
    judicial: 1,
    armyMul: 0.92,
    prod: 1,
    ally: 0.16,
    def: 0,
    popStep: 5,
    armyStep: 3,
  },
  authoritarian: {
    label: "威權",
    blurb: "行政高效，生產較多，外交較冷。",
    admin: 2,
    legis: 0,
    judicial: 1,
    armyMul: 1,
    prod: 2,
    ally: -0.14,
    def: 0.02,
    popStep: 4,
    armyStep: 3,
  },
  military: {
    label: "軍政",
    blurb: "三軍起始較厚，人口成長較慢。",
    admin: 1,
    legis: 0,
    judicial: 0,
    armyMul: 1.18,
    prod: 0,
    ally: -0.04,
    def: 0,
    popStep: 2,
    armyStep: 4,
  },
  concord: {
    label: "共治",
    blurb: "部門均衡，防禦與穩定較好。",
    admin: 1,
    legis: 1,
    judicial: 2,
    armyMul: 1,
    prod: 1,
    ally: 0.06,
    def: 0.08,
    popStep: 4,
    armyStep: 3,
  },
};

const STEMS = ["北嶺", "蒼海", "赤原", "霜港", "金穗", "雲嶺", "鹽澤", "青浦", "黑松", "白磯", "銅川", "長灘"];
const SUFFIX = ["聯邦", "公國", "共和國", "同盟", "王國", "軍府"];
const SYSTEM_IDS: SystemId[] = ["republic", "authoritarian", "military", "concord"];
const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function emptyBuy(): Buy {
  return { army: 0, navy: 0, air: 0, pop: 0, admin: 0, legis: 0, judicial: 0 };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function roll(rng: number): { value: number; rng: number } {
  let a = rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: a };
}

function cubeDist(q: number, r: number) {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

function axialDist(a: HexCell, b: HexCell) {
  return cubeDist(a.q - b.q, a.r - b.r);
}

export function pairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    order: [...state.order],
    nations: state.nations.map((n) => ({ ...n })),
    hexes: state.hexes.map((h) => ({ ...h })),
    relations: { ...state.relations },
    log: state.log.map((entry) => ({ ...entry })),
    buys: { ...state.buys },
    pending: state.pending ? { ...state.pending, action: { ...state.pending.action } } : null,
  };
}

export function nation(state: GameState, id: number): Nation {
  const found = state.nations.find((n) => n.id === id);
  if (!found) throw new Error(`missing nation ${id}`);
  return found;
}

export function activeId(state: GameState) {
  return state.order[state.cursor] ?? state.nations[0]?.id ?? 1;
}

export function activeNation(state: GameState) {
  return nation(state, activeId(state));
}

export function relationOf(state: GameState, a: number, b: number): Relation {
  if (a === b) return "neutral";
  return state.relations[pairKey(a, b)] ?? "neutral";
}

function setRelation(state: GameState, a: number, b: number, rel: Relation) {
  const key = pairKey(a, b);
  if (rel === "neutral") delete state.relations[key];
  else state.relations[key] = rel;
}

function pushLog(state: GameState, text: string) {
  state.logSeq += 1;
  state.log = [{ id: state.logSeq, text }, ...state.log].slice(0, 48);
}

export function neighborsOf(hexes: HexCell[], hex: HexCell) {
  const want = new Set(DIRS.map(([dq, dr]) => `${hex.q + dq},${hex.r + dr}`));
  return hexes.filter((h) => want.has(`${h.q},${h.r}`));
}

export function hexesOf(state: GameState, id: number) {
  return state.hexes.filter((h) => h.owner === id);
}

export function neighborNations(state: GameState, id: number) {
  const ids = new Set<number>();
  for (const hex of state.hexes) {
    if (hex.owner !== id) continue;
    for (const near of neighborsOf(state.hexes, hex)) {
      if (near.owner && near.owner !== id) ids.add(near.owner);
    }
  }
  return [...ids].map((nid) => nation(state, nid)).filter((n) => n.alive);
}

export function hasCoast(state: GameState, id: number) {
  return state.hexes.some((h) => h.owner === id && h.terrain === "coast");
}

export function nationalPower(state: GameState, n: Nation) {
  const land = hexesOf(state, n.id);
  const yieldSum = land.reduce((sum, hex) => sum + hex.yield, 0);
  return Math.round(
    n.pop * 0.15 +
      n.army * 0.55 +
      n.navy * 0.6 +
      n.air * 0.65 +
      n.reserve * 0.35 +
      (n.admin + n.legis + n.judicial) * 4 +
      yieldSum * 3 +
      n.stability * 0.15,
  );
}

export function incomeOf(state: GameState, n: Nation) {
  const yieldSum = hexesOf(state, n.id).reduce((sum, hex) => sum + hex.yield, 0);
  const stable = n.stability >= 60 ? 1 : n.stability < 30 ? -1 : 0;
  return Math.max(2, 3 + yieldSum + Math.floor(n.admin * 0.7) + SYSTEMS[n.system].prod + stable);
}

export function outlook(chance: number) {
  if (chance >= 0.62) return "可行";
  if (chance >= 0.45) return "勉強";
  return "不利";
}

function terrainName(terrain: Terrain) {
  if (terrain === "highland") return "高地";
  if (terrain === "coast") return "沿岸";
  return "平原";
}

export function landChance(attacker: Nation, defender: Nation, hex: HexCell) {
  const terrain = hex.terrain === "highland" ? 1.28 : hex.terrain === "coast" ? 1.08 : 1;
  const atk =
    attacker.army * (0.46 + attacker.admin * 0.028) * (0.78 + attacker.stability / 450);
  const def =
    defender.army *
    (0.58 + defender.judicial * 0.03) *
    terrain *
    (1 + SYSTEMS[defender.system].def) *
    (0.88 + defender.stability / 500);
  const air = (attacker.air - defender.air) * 0.16;
  const raw = 0.5 + (atk - def + air) / (atk + def + 28);
  return clamp(raw, 0.08, 0.9);
}

export function navyChance(attacker: Nation, defender: Nation) {
  const atk = attacker.navy * (0.62 + attacker.admin * 0.025) + attacker.air * 0.12;
  const def = defender.navy * (0.55 + defender.judicial * 0.02) + defender.air * 0.1;
  return clamp(0.5 + (atk - def) / (atk + def + 14), 0.1, 0.88);
}

export function airChance(attacker: Nation, defender: Nation) {
  const atk = attacker.air * (0.7 + attacker.admin * 0.02) + attacker.army * 0.05;
  const def = defender.air * 0.62 + defender.judicial * 1.4;
  return clamp(0.5 + (atk - def) / (atk + def + 12), 0.12, 0.9);
}

export function willAcceptAlliance(state: GameState, fromId: number, toId: number) {
  const from = nation(state, fromId);
  const to = nation(state, toId);
  if (!from.alive || !to.alive) return false;
  if (relationOf(state, fromId, toId) !== "neutral") return false;
  if (!neighborNations(state, fromId).some((n) => n.id === toId)) return false;
  const pf = nationalPower(state, from);
  const pt = nationalPower(state, to);
  const neighbors = neighborNations(state, toId);
  const threatened = neighbors.some(
    (n) => n.id !== fromId && nationalPower(state, n) > pt * 1.18 && relationOf(state, toId, n.id) !== "allied",
  );
  const bias = SYSTEMS[from.system].ally + SYSTEMS[to.system].ally;
  if (bias < -0.12 && !threatened) return false;
  if (from.legis + to.legis < 2 && !threatened && bias < 0.1) return false;
  if (pf > pt * 2.1 && !threatened) return false;
  if (threatened) return true;
  return pf < pt * 1.75 && pf > pt * 0.42;
}

function generateLand(seed: number): { hexes: HexCell[]; rng: number } {
  let rng = seed || 1;
  const radius = 4;
  const coords: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (cubeDist(q, r) <= radius) coords.push({ q, r });
    }
  }
  const land = new Set<string>();
  for (const coord of coords) {
    const dist = cubeDist(coord.q, coord.r);
    const gate = dist <= 2 ? 1 : dist === 3 ? 0.78 : 0.4;
    const next = roll(rng);
    rng = next.rng;
    if (next.value < gate) land.add(`${coord.q},${coord.r}`);
  }
  if (land.size < 36) {
    for (const coord of coords) {
      if (cubeDist(coord.q, coord.r) <= 3) land.add(`${coord.q},${coord.r}`);
    }
  }
  const hexes: HexCell[] = [];
  let id = 1;
  for (const coord of coords) {
    if (!land.has(`${coord.q},${coord.r}`)) continue;
    const seaEdge = DIRS.some(([dq, dr]) => !land.has(`${coord.q + dq},${coord.r + dr}`));
    const next = roll(rng);
    rng = next.rng;
    const terrain: Terrain = seaEdge ? "coast" : next.value < 0.22 ? "highland" : "plain";
    const yieldRoll = roll(rng);
    rng = yieldRoll.rng;
    const yieldValue = terrain === "highland" ? 2 : yieldRoll.value < 0.28 ? 2 : 1;
    hexes.push({
      id: id++,
      q: coord.q,
      r: coord.r,
      owner: null,
      terrain,
      yield: yieldValue,
      capital: false,
    });
  }
  return { hexes, rng };
}

function pickCapitals(hexes: HexCell[], count: number, rng: number) {
  let local = rng;
  let chosen: number[] = [];
  for (const minDist of [3, 2, 1]) {
    const order = hexes.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const next = roll(local);
      local = next.rng;
      const j = Math.floor(next.value * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    chosen = [];
    for (const index of order) {
      const hex = hexes[index]!;
      if (chosen.every((other) => axialDist(hex, hexes[other]!) >= minDist)) chosen.push(index);
      if (chosen.length === count) return { indexes: chosen, rng: local };
    }
  }
  return { indexes: chosen, rng: local };
}

function assignStarts(hexes: HexCell[], capitals: number[], rng: number) {
  const owner = hexes.map(() => null as number | null);
  capitals.forEach((index, nationIndex) => {
    owner[index] = nationIndex + 1;
    hexes[index]!.capital = true;
    hexes[index]!.owner = nationIndex + 1;
  });
  const counts = capitals.map(() => 1);
  const target = 4;
  let local = rng;
  let guard = 0;
  while (guard++ < 80 && counts.some((count, index) => count < target && capitals[index] !== undefined)) {
    let grew = false;
    const next = roll(local);
    local = next.rng;
    const start = Math.floor(next.value * capitals.length);
    for (let step = 0; step < capitals.length; step++) {
      const index = (start + step) % capitals.length;
      if ((counts[index] ?? 0) >= target) continue;
      let best: number | null = null;
      let bestScore = -1;
      for (let hexIndex = 0; hexIndex < hexes.length; hexIndex++) {
        if (owner[hexIndex] !== index + 1) continue;
        for (const near of neighborsOf(hexes, hexes[hexIndex]!)) {
          const nearIndex = hexes.findIndex((hex) => hex.id === near.id);
          if (nearIndex < 0 || owner[nearIndex] != null) continue;
          const score = near.yield + (near.terrain === "plain" ? 0.3 : 0) + (near.terrain === "coast" ? 0.15 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = nearIndex;
          }
        }
      }
      if (best != null) {
        owner[best] = index + 1;
        hexes[best]!.owner = index + 1;
        counts[index] = (counts[index] ?? 0) + 1;
        grew = true;
      }
    }
    if (!grew) break;
  }
  return local;
}

function uniqueName(rng: number, taken: Set<string>) {
  let local = rng;
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = roll(local);
    local = a.rng;
    const b = roll(local);
    local = b.rng;
    const name = `${STEMS[Math.floor(a.value * STEMS.length)]}${SUFFIX[Math.floor(b.value * SUFFIX.length)]}`;
    if (!taken.has(name)) {
      taken.add(name);
      return { name, rng: local };
    }
  }
  const name = `邊地${taken.size + 1}`;
  taken.add(name);
  return { name, rng: local };
}

function makeNation(
  id: number,
  name: string,
  system: SystemId,
  human: boolean,
  hexes: HexCell[],
  rng: number,
): { nation: Nation; rng: number } {
  const spec = SYSTEMS[system];
  const next = roll(rng);
  const coastal = hexes.some((hex) => hex.owner === id && hex.terrain === "coast");
  return {
    rng: next.rng,
    nation: {
      id,
      name,
      system,
      human,
      alive: true,
      pop: 76 + Math.floor(next.value * 22),
      army: Math.round(28 * spec.armyMul) + (human ? 8 : 0),
      navy: Math.round((coastal ? 16 : 8) * spec.armyMul),
      air: Math.round(10 * spec.armyMul),
      reserve: 10,
      admin: spec.admin,
      legis: spec.legis,
      judicial: spec.judicial,
      stability: 70,
    },
  };
}

export function startGame(seats: SeatSetup[], seed?: number): GameState {
  const cleanSeats = seats
    .map((seat) => ({ name: seat.name.trim().slice(0, 8) || "未名邦", system: seat.system }))
    .slice(0, 3);
  const actualSeed = seed && seed > 0 ? seed : Math.floor(Math.random() * 999983) + 1;
  const land = generateLand(actualSeed);
  let rng = land.rng;
  const picked = pickCapitals(land.hexes, 6, rng);
  rng = picked.rng;
  const indexes = picked.indexes.slice(0, 6);
  while (indexes.length < 6) indexes.push(indexes.length % land.hexes.length);
  rng = assignStarts(land.hexes, indexes, rng);
  const taken = new Set(cleanSeats.map((seat) => seat.name));
  const nations: Nation[] = [];
  cleanSeats.forEach((seat, index) => {
    const made = makeNation(index + 1, seat.name, seat.system, true, land.hexes, rng);
    rng = made.rng;
    nations.push(made.nation);
  });
  for (let id = cleanSeats.length + 1; id <= 6; id++) {
    const named = uniqueName(rng, taken);
    rng = named.rng;
    const sysRoll = roll(rng);
    rng = sysRoll.rng;
    const system = SYSTEM_IDS[Math.floor(sysRoll.value * SYSTEM_IDS.length)]!;
    const made = makeNation(id, named.name, system, false, land.hexes, rng);
    rng = made.rng;
    nations.push(made.nation);
  }
  const state: GameState = {
    version: 1,
    seed: actualSeed,
    rng,
    year: 1,
    season: 0,
    order: nations.map((item) => item.id),
    cursor: 0,
    nations,
    hexes: land.hexes,
    relations: {},
    log: [],
    logSeq: 0,
    budget: 0,
    buys: emptyBuy(),
    actionsLeft: 2,
    phase: "play",
    winnerId: null,
    endReason: "",
    pending: null,
    lastHuman: null,
  };
  pushLog(state, "版圖已劃定。各國進入第一年春。");
  return openTurn(state);
}

function conclude(state: GameState, winnerId: number | null, reason: string): GameState {
  state.phase = "ended";
  state.winnerId = winnerId;
  state.endReason = reason;
  state.pending = null;
  pushLog(state, reason);
  return state;
}

function markDeaths(state: GameState) {
  for (const item of state.nations) {
    if (!item.alive) continue;
    if (!state.hexes.some((hex) => hex.owner === item.id)) {
      item.alive = false;
      item.army = 0;
      pushLog(state, `${item.name}失去全部領土，國家覆滅。`);
    }
  }
}

function checkVictory(state: GameState): GameState | null {
  markDeaths(state);
  const alive = state.nations.filter((item) => item.alive);
  if (alive.length <= 1) {
    return conclude(state, alive[0]?.id ?? null, alive[0] ? `${alive[0].name}統一了版圖。` : "版圖上再無國家。");
  }
  const total = state.hexes.length;
  for (const item of alive) {
    const count = state.hexes.filter((hex) => hex.owner === item.id).length;
    if (count >= Math.ceil(total * MAJORITY)) {
      return conclude(state, item.id, `${item.name}控制過半可居之地。`);
    }
  }
  if (!state.nations.some((item) => item.human && item.alive)) {
    const best = [...alive].sort((a, b) => nationalPower(state, b) - nationalPower(state, a))[0];
    return conclude(state, best?.id ?? null, "玩家國家皆已覆滅。");
  }
  return null;
}

function endByPower(state: GameState, reason: string) {
  const alive = state.nations.filter((item) => item.alive);
  const best = [...alive].sort((a, b) => nationalPower(state, b) - nationalPower(state, a))[0];
  return conclude(state, best?.id ?? null, reason);
}

function openTurn(state: GameState): GameState {
  const ended = checkVictory(state);
  if (ended) return ended;
  const current = activeNation(state);
  if (!current.alive) return finishTurn(state);
  const next = cloneState(state);
  const actor = nation(next, current.id);
  next.actionsLeft = 2;
  next.budget = incomeOf(next, actor);
  next.buys = emptyBuy();
  next.pending = null;
  if (!actor.human) {
    const acted = aiAct(next);
    if (acted.phase === "ended") return acted;
    return finishTurn(acted);
  }
  const humans = next.nations.filter((item) => item.human && item.alive);
  next.phase =
    humans.length > 1 && next.lastHuman !== null && next.lastHuman !== actor.id ? "handoff" : "play";
  return next;
}

export function finishTurn(state: GameState): GameState {
  if (state.phase === "ended") return state;
  const next = cloneState(state);
  const me = nation(next, activeId(next));
  me.reserve += next.budget * 2;
  next.budget = 0;
  if (me.legis >= 4) me.stability = clamp(me.stability + 1, 0, 100);
  const wars = next.nations.filter(
    (item) => item.alive && item.id !== me.id && relationOf(next, me.id, item.id) === "war",
  ).length;
  if (wars) me.stability = clamp(me.stability - wars, 0, 100);
  if (me.human) next.lastHuman = me.id;
  next.pending = null;

  if (next.year >= YEAR_CAP && next.season === 3 && next.cursor >= next.order.length - 1) {
    return endByPower(next, "曆元八年冬盡，以國力定勝負。");
  }

  for (let guard = 0; guard < 48; guard++) {
    next.cursor += 1;
    if (next.cursor >= next.order.length) {
      next.season += 1;
      if (next.season > 3) {
        next.season = 0;
        next.year += 1;
      }
      next.order = next.nations.filter((item) => item.alive).map((item) => item.id);
      next.order.sort((a, b) => {
        const left = nation(next, a);
        const right = nation(next, b);
        if (left.human !== right.human) return left.human ? -1 : 1;
        return a - b;
      });
      next.cursor = 0;
      if (next.year > 1 || next.season > 0) {
        pushLog(next, `進入曆元${next.year}年${SEASONS[next.season]}。`);
      }
    }
    if (next.order.length === 0) return endByPower(next, "再無國家存續。");
    const actor = nation(next, next.order[next.cursor]!);
    if (!actor.alive) continue;
    return openTurn(next);
  }
  return next;
}

export type BuyKind = keyof Buy;

const COST: Record<BuyKind, number> = {
  army: 1,
  navy: 1,
  air: 1,
  pop: 1,
  admin: 2,
  legis: 2,
  judicial: 2,
};

export function spend(state: GameState, kind: BuyKind): GameState {
  if (state.phase !== "play") return state;
  const actor = activeNation(state);
  if (!actor.human) return state;
  const cost = COST[kind];
  if (state.budget < cost) return state;
  if ((kind === "admin" || kind === "legis" || kind === "judicial") && actor[kind] >= 8) return state;
  const next = cloneState(state);
  const me = nation(next, actor.id);
  const spec = SYSTEMS[me.system];
  if (kind === "army") me.army += spec.armyStep;
  if (kind === "navy") me.navy += 2;
  if (kind === "air") me.air += 2;
  if (kind === "pop") me.pop += spec.popStep;
  if (kind === "admin" || kind === "legis" || kind === "judicial") me[kind] += 1;
  next.budget -= cost;
  next.buys[kind] += 1;
  return next;
}

export function refund(state: GameState, kind: BuyKind): GameState {
  if (state.phase !== "play") return state;
  if (state.buys[kind] <= 0) return state;
  const actor = activeNation(state);
  const next = cloneState(state);
  const me = nation(next, actor.id);
  const spec = SYSTEMS[me.system];
  if (kind === "army") me.army = Math.max(0, me.army - spec.armyStep);
  if (kind === "navy") me.navy = Math.max(0, me.navy - 2);
  if (kind === "air") me.air = Math.max(0, me.air - 2);
  if (kind === "pop") me.pop = Math.max(20, me.pop - spec.popStep);
  if (kind === "admin" || kind === "legis" || kind === "judicial") me[kind] = Math.max(0, me[kind] - 1);
  next.budget += COST[kind];
  next.buys[kind] -= 1;
  return next;
}

function loss(value: number, ratio: number) {
  return Math.max(0, Math.round(value * (1 - ratio)));
}

export function describe(state: GameState, action: Action): { ok: boolean; reason: string; chance?: number; detail: string } {
  const me = activeNation(state);
  if (state.actionsLeft <= 0) return { ok: false, reason: "本季行動已用完。", detail: "" };
  if (action.type === "claim") {
    const hex = state.hexes.find((item) => item.id === action.hexId);
    if (!hex || hex.owner !== null) return { ok: false, reason: "這塊地不能佔領。", detail: "" };
    const adjacent = neighborsOf(state.hexes, hex).some((near) => near.owner === me.id);
    const naval = !adjacent && hex.terrain === "coast" && hasCoast(state, me.id);
    if (!adjacent && !naval) return { ok: false, reason: "需要與本國接壤，或由沿岸艦隊跨海。", detail: "" };
    if (adjacent && me.army < (hex.terrain === "highland" ? 8 : 6)) {
      return { ok: false, reason: "陸軍不足，無法推進。", detail: "" };
    }
    if (naval && (me.navy < 8 || me.army < 4)) return { ok: false, reason: "跨海需要海軍 8 與少量陸軍。", detail: "" };
    const cost = adjacent ? (hex.terrain === "highland" ? "消耗陸軍 5" : "消耗陸軍 3") : "消耗海軍 4、陸軍 2";
    return {
      ok: true,
      reason: "可佔領",
      detail: `區域 ${hex.id} · ${terrainName(hex.terrain)} · 產出 ${hex.yield}。${adjacent ? "陸路" : "跨海"}，${cost}。`,
    };
  }
  if (action.type === "land") {
    const hex = state.hexes.find((item) => item.id === action.hexId);
    if (!hex || hex.owner === null || hex.owner === me.id) return { ok: false, reason: "沒有可進攻的區域。", detail: "" };
    const defender = nation(state, hex.owner);
    if (!defender.alive) return { ok: false, reason: "對方已覆滅。", detail: "" };
    if (relationOf(state, me.id, defender.id) !== "war") return { ok: false, reason: "尚未宣戰。", detail: "" };
    if (!neighborsOf(state.hexes, hex).some((near) => near.owner === me.id)) {
      return { ok: false, reason: "陸軍只能進入接壤區域。", detail: "" };
    }
    if (me.army < 8) return { ok: false, reason: "陸軍不足。", detail: "" };
    const chance = landChance(me, defender, hex);
    return {
      ok: true,
      reason: outlook(chance),
      chance,
      detail: `進攻區域 ${hex.id}（${terrainName(hex.terrain)}），守方 ${defender.name}。我方陸軍 ${me.army}，對方 ${defender.army}。`,
    };
  }
  const targetId =
    action.type === "war" || action.type === "ally" || action.type === "break" || action.type === "navy" || action.type === "air"
      ? action.targetId
      : 0;
  const target = state.nations.find((item) => item.id === targetId);
  if (!target || !target.alive || target.id === me.id) return { ok: false, reason: "沒有這個國家。", detail: "" };
  const rel = relationOf(state, me.id, target.id);
  const adjacent = neighborNations(state, me.id).some((item) => item.id === target.id);
  if (action.type === "war") {
    if (rel === "war") return { ok: false, reason: "已經處於戰爭。", detail: "" };
    if (rel === "allied") return { ok: false, reason: "先解除同盟。", detail: "" };
    if (!adjacent) return { ok: false, reason: "只能向接壤國家宣戰。", detail: "" };
    if (me.reserve < 6 && me.army < 12) return { ok: false, reason: "國力與軍隊都不足以宣戰。", detail: "" };
    return { ok: true, reason: "可宣戰", detail: `向 ${target.name} 宣戰。消耗儲備 6，穩定下降。` };
  }
  if (action.type === "ally") {
    if (rel !== "neutral") return { ok: false, reason: "目前不能結盟。", detail: "" };
    if (!adjacent) return { ok: false, reason: "只能與接壤國家結盟。", detail: "" };
    const accept = target.human ? true : willAcceptAlliance(state, me.id, target.id);
    return {
      ok: true,
      reason: target.human ? "同室可結盟" : accept ? "對方很可能接受" : "對方可能拒絕",
      detail: target.human
        ? `${target.name} 與你同在此室，結盟會立即生效。`
        : accept
          ? `${target.name} 的國力與制度讓結盟說得通。`
          : `${target.name} 未必願意結盟，失敗不消耗行動。`,
    };
  }
  if (action.type === "break") {
    if (rel !== "allied") return { ok: false, reason: "雙方並非同盟。", detail: "" };
    return { ok: true, reason: "可解盟", detail: `解除與 ${target.name} 的同盟，雙方穩定下降。` };
  }
  if (rel !== "war") return { ok: false, reason: "只能對交戰國發動。", detail: "" };
  if (action.type === "navy") {
    if (!hasCoast(state, me.id) || !hasCoast(state, target.id)) return { ok: false, reason: "雙方都要有沿岸領土。", detail: "" };
    if (me.navy < 4 || target.navy < 1) return { ok: false, reason: "海軍不足。", detail: "" };
    const chance = navyChance(me, target);
    return {
      ok: true,
      reason: outlook(chance),
      chance,
      detail: `海戰對 ${target.name}。我方海軍 ${me.navy}，對方 ${target.navy}。大勝有機會奪下一塊沿岸。`,
    };
  }
  if (me.air < 4) return { ok: false, reason: "空軍不足。", detail: "" };
  const chance = airChance(me, target);
  return {
    ok: true,
    reason: outlook(chance),
    chance,
    detail: `空襲 ${target.name}。我方空軍 ${me.air}，對方 ${target.air}。成功會打擊對方陸軍與儲備。`,
  };
}

function takeHex(state: GameState, hex: HexCell, owner: number) {
  const found = state.hexes.find((item) => item.id === hex.id);
  if (found) found.owner = owner;
}

function randomOwnedCoast(state: GameState, owner: number, rng: number, adjacentTo?: number) {
  let pool = state.hexes.filter((hex) => hex.owner === owner && hex.terrain === "coast");
  if (adjacentTo) {
    const touching = pool.filter((hex) => neighborsOf(state.hexes, hex).some((near) => near.owner === adjacentTo));
    if (touching.length) pool = touching;
    else return { hex: null, rng };
  }
  if (!pool.length) return { hex: null, rng };
  const next = roll(rng);
  const hex = pool[Math.floor(next.value * pool.length)] ?? null;
  return { hex, rng: next.rng };
}

export function applyAction(state: GameState, action: Action): { state: GameState; message: string; pulse?: number } {
  const preview = describe(state, action);
  if (!preview.ok) return { state, message: preview.reason };
  const next = cloneState(state);
  const me = nation(next, activeId(next));

  if (action.type === "claim") {
    const hex = next.hexes.find((item) => item.id === action.hexId)!;
    const adjacent = neighborsOf(next.hexes, hex).some((near) => near.owner === me.id);
    if (adjacent) me.army = Math.max(0, me.army - (hex.terrain === "highland" ? 5 : 3));
    else {
      me.navy = Math.max(0, me.navy - 4);
      me.army = Math.max(0, me.army - 2);
    }
    takeHex(next, hex, me.id);
    next.actionsLeft -= 1;
    pushLog(next, `${me.name}${adjacent ? "佔領" : "渡海佔領"}區域 ${hex.id}。`);
    const ended = checkVictory(next);
    return { state: ended ?? next, message: `區域 ${hex.id} 已納入版圖。`, pulse: hex.id };
  }

  if (action.type === "land") {
    const hex = next.hexes.find((item) => item.id === action.hexId)!;
    const defender = nation(next, hex.owner!);
    const chance = landChance(me, defender, hex);
    const swung = roll(next.rng);
    next.rng = swung.rng;
    const success = swung.value < chance;
    const aLoss = success ? 0.06 + swung.value * 0.05 : 0.14 + swung.value * 0.08;
    const dLoss = success ? 0.16 + swung.value * 0.08 : 0.05 + swung.value * 0.04;
    me.army = Math.max(0, loss(me.army, aLoss) - (success ? 4 : 0));
    defender.army = loss(defender.army, dLoss);
    me.stability = clamp(me.stability + (success ? 1 : -3), 0, 100);
    defender.stability = clamp(defender.stability + (success ? -4 : 1), 0, 100);
    if (success) takeHex(next, hex, me.id);
    next.actionsLeft -= 1;
    pushLog(
      next,
      success
        ? `${me.name}陸戰奪下區域 ${hex.id}（${outlook(chance)} ${Math.round(chance * 100)}%）。`
        : `${me.name}進攻區域 ${hex.id} 受阻（${outlook(chance)} ${Math.round(chance * 100)}%）。`,
    );
    const ended = checkVictory(next);
    return { state: ended ?? next, message: success ? `陸戰得手，拿下區域 ${hex.id}。` : "陸戰失利，前線沒有推進。", pulse: hex.id };
  }

  if (action.type === "war") {
    const target = nation(next, action.targetId);
    me.reserve = Math.max(0, me.reserve - 6);
    me.stability = clamp(me.stability - 8, 0, 100);
    target.stability = clamp(target.stability - 4, 0, 100);
    setRelation(next, me.id, target.id, "war");
    next.actionsLeft -= 1;
    pushLog(next, `${me.name}向 ${target.name} 宣戰。`);
    return { state: next, message: `已向 ${target.name} 宣戰。` };
  }

  if (action.type === "ally") {
    const target = nation(next, action.targetId);
    const accept = target.human || willAcceptAlliance(next, me.id, target.id);
    if (!accept) {
      pushLog(next, `${target.name}拒絕了 ${me.name} 的結盟。`);
      return { state: next, message: `${target.name}拒絕結盟。` };
    }
    setRelation(next, me.id, target.id, "allied");
    me.stability = clamp(me.stability + 2, 0, 100);
    target.stability = clamp(target.stability + 2, 0, 100);
    next.actionsLeft -= 1;
    pushLog(next, `${me.name}與 ${target.name} 結盟。`);
    return { state: next, message: `與 ${target.name} 結成同盟。` };
  }

  if (action.type === "break") {
    const target = nation(next, action.targetId);
    setRelation(next, me.id, target.id, "neutral");
    me.stability = clamp(me.stability - 4, 0, 100);
    target.stability = clamp(target.stability - 4, 0, 100);
    next.actionsLeft -= 1;
    pushLog(next, `${me.name}解除與 ${target.name} 的同盟。`);
    return { state: next, message: `已與 ${target.name} 解盟。` };
  }

  if (action.type === "navy") {
    const target = nation(next, action.targetId);
    const chance = navyChance(me, target);
    const swung = roll(next.rng);
    next.rng = swung.rng;
    const success = swung.value < chance;
    if (success) {
      target.navy = loss(target.navy, 0.28);
      me.navy = loss(me.navy, 0.1);
      target.army = loss(target.army, 0.08);
      target.reserve = Math.max(0, target.reserve - 4);
      const seized = randomOwnedCoast(next, target.id, next.rng, me.id);
      next.rng = seized.rng;
      if (seized.hex && neighborsOf(next.hexes, seized.hex).some((near) => near.owner === me.id)) {
        takeHex(next, seized.hex, me.id);
        pushLog(next, `${me.name}海戰擊敗 ${target.name}，並奪下沿岸區域 ${seized.hex.id}。`);
      } else {
        pushLog(next, `${me.name}海戰壓過 ${target.name}，對方艦隊與沿岸受創。`);
      }
    } else {
      me.navy = loss(me.navy, 0.22);
      target.navy = loss(target.navy, 0.08);
      pushLog(next, `${me.name}的艦隊在對 ${target.name} 海戰中撤退。`);
    }
    next.actionsLeft -= 1;
    const ended = checkVictory(next);
    return { state: ended ?? next, message: success ? "海戰得手。" : "海戰失利。", pulse: undefined };
  }

  const target = nation(next, action.targetId);
  const chance = airChance(me, target);
  const swung = roll(next.rng);
  next.rng = swung.rng;
  const success = swung.value < chance;
  if (success) {
    target.army = loss(target.army, 0.1);
    target.reserve = Math.max(0, target.reserve - 3);
    target.air = loss(target.air, 0.12);
    me.air = loss(me.air, 0.07);
    me.stability = clamp(me.stability + 1, 0, 100);
    pushLog(next, `${me.name}空襲 ${target.name} 得手。`);
  } else {
    me.air = loss(me.air, 0.16);
    target.air = loss(target.air, 0.05);
    pushLog(next, `${me.name}空襲 ${target.name} 被攔截。`);
  }
  next.actionsLeft -= 1;
  return { state: next, message: success ? "空襲得手。" : "空襲被攔截。" };
}

export function pendingFrom(state: GameState, action: Action): PendingAction | null {
  const preview = describe(state, action);
  if (!preview.ok && action.type !== "ally") return null;
  if (!preview.ok) return null;
  const titles: Record<Action["type"], string> = {
    claim: "確認佔領",
    land: "確認陸戰",
    war: "確認宣戰",
    ally: "確認結盟",
    break: "確認解盟",
    navy: "確認海戰",
    air: "確認空襲",
  };
  return {
    action,
    chance: preview.chance,
    title: titles[action.type],
    detail: preview.chance
      ? `${preview.detail}勝算 ${Math.round(preview.chance * 100)}%，判斷為${preview.reason}。`
      : `${preview.detail}`,
  };
}

function aiAct(state: GameState): GameState {
  let next = autoSpend(state);
  for (let step = 0; step < 2; step++) {
    const action = chooseAi(next);
    if (!action) break;
    const result = applyAction(next, action);
    next = result.state;
    if (next.phase === "ended") return next;
  }
  return next;
}

function autoSpend(state: GameState): GameState {
  let next = state;
  const id = activeId(next);
  for (let guard = 0; guard < 16 && next.budget > 0; guard++) {
    const me = nation(next, id);
    const atWar = next.nations.some((item) => item.alive && item.id !== id && relationOf(next, id, item.id) === "war");
    const coast = hasCoast(next, id);
    let kind: BuyKind = "army";
    if (atWar) {
      if (me.army < 36) kind = "army";
      else if (me.air < 16) kind = "air";
      else if (coast && me.navy < 18) kind = "navy";
      else if (me.admin < 4 && next.budget >= 2) kind = "admin";
      else kind = "army";
    } else if (me.admin < 3 && next.budget >= 2) kind = "admin";
    else if (me.army < 32) kind = "army";
    else if (coast && me.navy < 12) kind = "navy";
    else if (me.pop < 110) kind = "pop";
    else if (me.judicial < 3 && next.budget >= 2) kind = "judicial";
    else kind = "army";
    const before = next.budget;
    const updated = spendAs(next, id, kind);
    if (updated.budget === before) break;
    next = updated;
  }
  return next;
}

function spendAs(state: GameState, id: number, kind: BuyKind): GameState {
  const actor = nation(state, id);
  const cost = COST[kind];
  if (state.budget < cost) return state;
  if ((kind === "admin" || kind === "legis" || kind === "judicial") && actor[kind] >= 8) return state;
  const next = cloneState(state);
  const me = nation(next, id);
  const spec = SYSTEMS[me.system];
  if (kind === "army") me.army += spec.armyStep;
  if (kind === "navy") me.navy += 2;
  if (kind === "air") me.air += 2;
  if (kind === "pop") me.pop += spec.popStep;
  if (kind === "admin" || kind === "legis" || kind === "judicial") me[kind] += 1;
  next.budget -= cost;
  next.buys[kind] += 1;
  return next;
}

function chooseAi(state: GameState): Action | null {
  const me = activeNation(state);
  if (state.actionsLeft <= 0 || !me.alive) return null;
  const mine = hexesOf(state, me.id);
  const empty: HexCell[] = [];
  const enemyHexes: HexCell[] = [];
  for (const hex of mine) {
    for (const near of neighborsOf(state.hexes, hex)) {
      if (near.owner === null && !empty.some((item) => item.id === near.id)) empty.push(near);
      if (near.owner && near.owner !== me.id) {
        const rel = relationOf(state, me.id, near.owner);
        if (rel === "war" && !enemyHexes.some((item) => item.id === near.id)) enemyHexes.push(near);
      }
    }
  }
  let bestLand: { hex: HexCell; chance: number } | null = null;
  for (const hex of enemyHexes) {
    const defender = nation(state, hex.owner!);
    const chance = landChance(me, defender, hex);
    const need = defender.human ? 0.6 : state.actionsLeft < 2 ? 0.62 : 0.5;
    if (me.army >= 12 && chance >= need && (!bestLand || chance > bestLand.chance)) bestLand = { hex, chance };
  }
  if (bestLand) return { type: "land", hexId: bestLand.hex.id };

  const claimable = empty.filter((hex) => me.army >= (hex.terrain === "highland" ? 8 : 6));
  if (claimable.length) {
    claimable.sort((a, b) => b.yield - a.yield);
    return { type: "claim", hexId: claimable[0]!.id };
  }

  const wars = state.nations.filter((item) => item.alive && relationOf(state, me.id, item.id) === "war");
  let bestAir: { id: number; chance: number } | null = null;
  for (const foe of wars) {
    if (me.air >= 6) {
      const chance = airChance(me, foe);
      if (chance >= 0.5 && (!bestAir || chance > bestAir.chance)) bestAir = { id: foe.id, chance };
    }
    if (me.navy >= 8 && foe.navy >= 4 && hasCoast(state, me.id) && hasCoast(state, foe.id)) {
      const chance = navyChance(me, foe);
      if (chance >= 0.52) return { type: "navy", targetId: foe.id };
    }
  }
  if (bestAir) return { type: "air", targetId: bestAir.id };

  const rivals = neighborNations(state, me.id).filter((item) => relationOf(state, me.id, item.id) === "neutral");
  if ((state.year > 1 || state.season >= 2) && me.army >= 24 && wars.length === 0) {
    const prey = rivals
      .filter((item) => {
        const ratio = nationalPower(state, me) / Math.max(1, nationalPower(state, item));
        return ratio > (item.human ? 1.6 : 1.24);
      })
      .sort((a, b) => nationalPower(state, a) - nationalPower(state, b))[0];
    if (prey) return { type: "war", targetId: prey.id };
  }

  const threat = neighborNations(state, me.id)
    .filter((item) => relationOf(state, me.id, item.id) === "neutral")
    .sort((a, b) => nationalPower(state, b) - nationalPower(state, a))[0];
  if (threat && nationalPower(state, threat) > nationalPower(state, me) * 1.05 && willAcceptAlliance(state, me.id, threat.id)) {
    return { type: "ally", targetId: threat.id };
  }
  return null;
}

export function acceptHandoff(state: GameState): GameState {
  if (state.phase !== "handoff") return state;
  const next = cloneState(state);
  next.phase = "play";
  return next;
}
