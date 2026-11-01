export type SystemId = "republic" | "authoritarian" | "military" | "concord";

export type Terrain = "plain" | "highland" | "coast";

export type Relation = "neutral" | "allied" | "war";

export interface Nation {
  id: number;
  name: string;
  system: SystemId;
  human: boolean;
  alive: boolean;
  pop: number;
  army: number;
  navy: number;
  air: number;
  reserve: number;
  admin: number;
  legis: number;
  judicial: number;
  stability: number;
}

export interface HexCell {
  id: number;
  q: number;
  r: number;
  owner: number | null;
  terrain: Terrain;
  yield: number;
  capital: boolean;
}

export interface Buy {
  army: number;
  navy: number;
  air: number;
  pop: number;
  admin: number;
  legis: number;
  judicial: number;
}

export interface LogEntry {
  id: number;
  text: string;
}

export type Action =
  | { type: "claim"; hexId: number }
  | { type: "land"; hexId: number }
  | { type: "war"; targetId: number }
  | { type: "ally"; targetId: number }
  | { type: "break"; targetId: number }
  | { type: "navy"; targetId: number }
  | { type: "air"; targetId: number };

export interface PendingAction {
  action: Action;
  chance?: number;
  title: string;
  detail: string;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  year: number;
  season: number;
  order: number[];
  cursor: number;
  nations: Nation[];
  hexes: HexCell[];
  relations: Record<string, Relation>;
  log: LogEntry[];
  logSeq: number;
  budget: number;
  buys: Buy;
  actionsLeft: number;
  phase: "play" | "handoff" | "ended";
  winnerId: number | null;
  endReason: string;
  pending: PendingAction | null;
  lastHuman: number | null;
}

export interface SeatSetup {
  name: string;
  system: SystemId;
}
