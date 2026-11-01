import { useEffect, useMemo, useState } from "react";
import {
  Flag,
  Landmark,
  Plane,
  RotateCcw,
  Scale,
  ScrollText,
  Ship,
  Swords,
  Users,
} from "lucide-react";
import {
  SEASONS,
  SYSTEMS,
  activeNation,
  describe,
  hasCoast,
  hexesOf,
  incomeOf,
  nationalPower,
  neighborNations,
  neighborsOf,
  outlook,
  relationOf,
} from "@/game/logic";
import { useGame } from "@/game/store";
import type { Action, Buy, GameState, HexCell, Nation, Relation, SystemId } from "@/game/types";
import type { BuyKind } from "@/game/logic";

const SIZE = 30;
const NATION_COLOR = ["", "var(--color-n1)", "var(--color-n2)", "var(--color-n3)", "var(--color-n4)", "var(--color-n5)", "var(--color-n6)"];

function tone(freq = 240) {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = tone.ctx ?? new Ctx();
  tone.ctx = ctx;
  if (ctx.state === "suspended") void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  osc.stop(ctx.currentTime + 0.12);
}
tone.ctx = null as AudioContext | null;

function relLabel(rel: Relation) {
  if (rel === "war") return "交戰";
  if (rel === "allied") return "同盟";
  return "中立";
}

function terrainLabel(terrain: HexCell["terrain"]) {
  if (terrain === "highland") return "高地";
  if (terrain === "coast") return "沿岸";
  return "平原";
}

function center(q: number, r: number) {
  return {
    x: SIZE * Math.sqrt(3) * (q + r / 2),
    y: SIZE * 1.5 * r,
  };
}

function hexPoints(cx: number, cy: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + SIZE * Math.cos(angle)},${cy + SIZE * Math.sin(angle)}`;
  }).join(" ");
}

export function IronMandate() {
  const hydrated = useGame((s) => s.hydrated);
  const game = useGame((s) => s.game);
  const hydrate = useGame((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <main className="grid h-dvh place-items-center">
        <p className="font-serif text-2xl text-ink">鐵策</p>
      </main>
    );
  }

  if (!game) return <SetupScreen />;
  return <Table game={game} />;
}

function SetupScreen() {
  const start = useGame((s) => s.start);
  const [count, setCount] = useState(1);
  const [seats, setSeats] = useState([
    { name: "自由邦", system: "republic" as SystemId },
    { name: "第二邦", system: "concord" as SystemId },
    { name: "第三邦", system: "military" as SystemId },
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-brass">同室國勢</p>
          <h1 className="font-serif text-4xl text-ink">鐵策</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            一張隨機地圖，一個房間。自訂國名與制度，把生產分給三軍和行政、立法、司法，再決定宣戰、結盟或出兵。空位由 AI 補上。
          </p>
        </div>
        <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-seal font-serif text-2xl text-parchment">策</div>
      </header>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl">房間席位</h2>
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={`btn min-w-11 ${count === n ? "btn-seal" : ""}`}
                onClick={() => setCount(n)}
              >
                {n} 人
              </button>
            ))}
          </div>
        </div>
        <p className="mb-4 text-sm text-muted">其餘國家由 AI 執政。兩人以上會在換手時遮住桌面，把裝置交給下一位。</p>
        <div className="grid gap-3">
          {seats.slice(0, count).map((seat, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-line bg-parchment p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">國名</span>
                <input
                  value={seat.name}
                  maxLength={8}
                  onChange={(event) =>
                    setSeats((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                  }
                  className="min-h-11 rounded-md border border-line bg-panel px-3 text-ink"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SYSTEMS) as SystemId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn ${seat.system === id ? "btn-seal" : ""}`}
                    onClick={() => setSeats((current) => current.map((item, i) => (i === index ? { ...item, system: id } : item)))}
                  >
                    {SYSTEMS[id].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted sm:col-span-2">{SYSTEMS[seat.system].blurb}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-seal mt-4 w-full"
          onClick={() => {
            tone(196);
            start(seats.slice(0, count));
          }}
        >
          開局
        </button>
      </section>

      <section className="grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
        <article className="panel p-3">
          <h3 className="font-serif text-base text-ink">生產</h3>
          <p>每季依照領地產出、行政與制度獲得生產點，分給陸軍、海軍、空軍、人口或三個部門。</p>
        </article>
        <article className="panel p-3">
          <h3 className="font-serif text-base text-ink">行動</h3>
          <p>每季兩次。可佔領接壤空地、宣戰、結盟，或以陸戰、海戰、空襲爭奪已開戰的鄰國。</p>
        </article>
        <article className="panel p-3">
          <h3 className="font-serif text-base text-ink">終局</h3>
          <p>控制約四成領土、只剩一國，或曆元八年冬盡時以國力最高者勝。</p>
        </article>
      </section>
    </main>
  );
}

function Table({ game }: { game: GameState }) {
  const [tab, setTab] = useState<"nation" | "make" | "act" | "log">("act");
  const [armNew, setArmNew] = useState(false);
  const actor = activeNation(game);
  const selectedHex = useGame((s) => s.selectedHex);
  const selectedNationId = useGame((s) => s.selectedNation);
  const banner = useGame((s) => s.banner);
  const pulse = useGame((s) => s.pulse);
  const selectHex = useGame((s) => s.selectHex);
  const selectNation = useGame((s) => s.selectNation);
  const abandon = useGame((s) => s.abandon);

  useEffect(() => {
    selectNation(actor.id);
  }, [actor.id, game.phase, selectNation]);

  const selected = game.nations.find((item) => item.id === selectedNationId) ?? actor;
  const hex = game.hexes.find((item) => item.id === selectedHex) ?? null;

  return (
    <main className="mx-auto flex h-dvh max-w-7xl flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-3 py-2">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-seal font-serif text-lg text-parchment">策</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="font-serif text-xl">鐵策</h1>
            <p className="truncate text-sm text-muted">
              曆元 {game.year} 年{SEASONS[game.season]} · {actor.name}執政
            </p>
          </div>
          <p className="truncate text-xs text-ink-soft">{banner || `本季尚可行動 ${game.actionsLeft} 次`}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!armNew) {
              setArmNew(true);
              return;
            }
            abandon();
          }}
        >
          <RotateCcw className="size-4" />
          {armNew ? "確認離開" : "新局"}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="hidden h-full lg:flex">
          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line p-3">
            <NationCard game={game} nation={actor} self />
            <DeptCard game={game} />
            <ProduceCard game={game} />
          </aside>
          <section className="flex min-w-0 flex-1 flex-col p-3">
            <MapBoard game={game} selectedHex={selectedHex} selectedNation={selected.id} pulse={pulse} onHex={selectHex} onNation={selectNation} />
            <HexNote game={game} hex={hex} actor={actor} />
          </section>
          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line p-3">
            <WarCard game={game} selectedId={selected.id} onSelect={selectNation} />
            <ActionCard game={game} actor={actor} hex={hex} target={selected} />
          </aside>
        </div>

        <div className="flex h-full flex-col lg:hidden">
          <div className="h-80 shrink-0 p-2">
            <MapBoard game={game} selectedHex={selectedHex} selectedNation={selected.id} pulse={pulse} onHex={selectHex} onNation={selectNation} />
          </div>
          <HexNote game={game} hex={hex} actor={actor} />
          <div className="flex gap-2 overflow-x-auto px-2 py-2">
            {(
              [
                ["nation", "國家"],
                ["make", "生產"],
                ["act", "行動"],
                ["log", "戰況"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={`btn shrink-0 ${tab === id ? "btn-seal" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {tab === "nation" && (
              <div className="grid gap-3">
                <NationCard game={game} nation={actor} self />
                <DeptCard game={game} />
              </div>
            )}
            {tab === "make" && <ProduceCard game={game} />}
            {tab === "act" && <ActionCard game={game} actor={actor} hex={hex} target={selected} />}
            {tab === "log" && <WarCard game={game} selectedId={selected.id} onSelect={selectNation} />}
          </div>
        </div>

        {game.phase === "handoff" && <Handoff nation={actor} />}
        {game.phase === "ended" && <Ending game={game} />}
      </div>
    </main>
  );
}

function HexNote({ game, hex, actor }: { game: GameState; hex: HexCell | null; actor: Nation }) {
  if (!hex) return <p className="px-2 pb-1 text-xs text-muted">點選地圖上的區域。</p>;
  const owner = hex.owner ? game.nations.find((item) => item.id === hex.owner) : null;
  const near = neighborsOf(game.hexes, hex).some((item) => item.owner === actor.id);
  return (
    <p className="px-2 pb-1 text-xs text-ink-soft">
      區域 {hex.id} · {terrainLabel(hex.terrain)} · 產出 {hex.yield} · {owner ? owner.name : "空白"}
      {near ? " · 與你接壤" : ""}
      {hex.capital ? " · 都城" : ""}
    </p>
  );
}

function MapBoard({
  game,
  selectedHex,
  selectedNation,
  pulse,
  onHex,
  onNation,
}: {
  game: GameState;
  selectedHex: number | null;
  selectedNation: number;
  pulse: number | null;
  onHex: (id: number) => void;
  onNation: (id: number) => void;
}) {
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const hex of game.hexes) {
      const { x, y } = center(hex.q, hex.r);
      minX = Math.min(minX, x - SIZE);
      minY = Math.min(minY, y - SIZE);
      maxX = Math.max(maxX, x + SIZE);
      maxY = Math.max(maxY, y + SIZE);
    }
    return { minX: minX - 12, minY: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24 };
  }, [game.hexes]);

  return (
    <div className="panel relative h-full min-h-64 overflow-hidden">
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        className="h-full w-full bg-sea"
        role="img"
        aria-label="隨機版圖"
      >
        {game.hexes.map((hex) => {
          const { x, y } = center(hex.q, hex.r);
          const owned = hex.owner !== null;
          const selected = hex.id === selectedHex;
          const focused = hex.owner === selectedNation;
          return (
            <g key={hex.id}>
              <polygon
                points={hexPoints(x, y)}
                fill={owned ? NATION_COLOR[hex.owner ?? 0] : "var(--color-unowned)"}
                fillOpacity={owned ? 0.92 : 1}
                stroke={selected ? "var(--color-brass)" : focused ? "var(--color-ink)" : "var(--color-ink-soft)"}
                strokeWidth={selected ? 3 : focused ? 1.6 : 1}
                role="button"
                aria-label={`區域 ${hex.id}${owned ? "" : " 空白"}`}
                className={`cursor-pointer ${pulse === hex.id ? "animate-pulse" : ""}`}
                onClick={() => {
                  tone(320);
                  onHex(hex.id);
                  if (hex.owner) onNation(hex.owner);
                }}
              />
              {hex.terrain === "highland" && (
                <polygon
                  points={`${x},${y - 8} ${x + 6},${y + 4} ${x - 6},${y + 4}`}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth={1}
                  pointerEvents="none"
                />
              )}
              {hex.capital && <circle cx={x} cy={y - 9} r={2.4} fill="var(--color-panel)" pointerEvents="none" />}
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="10"
                fill={owned ? "var(--color-parchment)" : "var(--color-ink)"}
                pointerEvents="none"
              >
                {hex.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-serif text-lg leading-tight">{value}</p>
    </div>
  );
}

function NationCard({ game, nation, self }: { game: GameState; nation: Nation; self?: boolean }) {
  const land = hexesOf(game, nation.id).length;
  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{self ? "執政國家" : "國家"} · {nation.human ? "玩家" : "AI"}</p>
          <h2 className="font-serif text-2xl">{nation.name}</h2>
        </div>
        <span className="rounded-md px-2 py-1 text-xs text-parchment" style={{ background: NATION_COLOR[nation.id] }}>
          {SYSTEMS[nation.system].label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="人口" value={nation.pop} />
        <Stat label="國力" value={nationalPower(game, nation)} />
        <Stat label="區域" value={land} />
        <Stat label="陸軍" value={nation.army} />
        <Stat label="海軍" value={nation.navy} />
        <Stat label="空軍" value={nation.air} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>穩定 {nation.stability}</span>
          <span>儲備 {nation.reserve}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-parchment-deep">
          <div className="h-full bg-brass" style={{ width: `${nation.stability}%` }} />
        </div>
      </div>
    </section>
  );
}

function DeptCard({ game }: { game: GameState }) {
  const me = activeNation(game);
  const rows = [
    { icon: Landmark, label: "行政", value: me.admin, hint: "提高生產與進攻組織" },
    { icon: ScrollText, label: "立法", value: me.legis, hint: "較易結盟，滿 4 慢慢回穩" },
    { icon: Scale, label: "司法", value: me.judicial, hint: "提高防禦、減少損耗" },
  ];
  return (
    <section className="panel p-3">
      <h3 className="mb-2 font-serif text-lg">部門人員</h3>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <row.icon className="size-4 shrink-0 text-brass" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-sm">
                <span>{row.label}</span>
                <span className="font-serif">{row.value}</span>
              </div>
              <p className="text-xs text-muted">{row.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProduceCard({ game }: { game: GameState }) {
  const buy = useGame((s) => s.buy);
  const unbuy = useGame((s) => s.unbuy);
  const me = activeNation(game);
  const locked = game.phase !== "play" || !me.human;
  const rows: { kind: BuyKind; label: string; hint: string }[] = [
    { kind: "army", label: "陸軍", hint: `+${SYSTEMS[me.system].armyStep}` },
    { kind: "navy", label: "海軍", hint: "+2" },
    { kind: "air", label: "空軍", hint: "+2" },
    { kind: "pop", label: "人口", hint: `+${SYSTEMS[me.system].popStep}` },
    { kind: "admin", label: "行政", hint: "+1 / 2點" },
    { kind: "legis", label: "立法", hint: "+1 / 2點" },
    { kind: "judicial", label: "司法", hint: "+1 / 2點" },
  ];
  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-end justify-between">
        <h3 className="font-serif text-lg">生產</h3>
        <p className="text-sm text-brass">剩餘 {game.budget}</p>
      </div>
      <p className="mb-2 text-xs text-muted">本季收入 {incomeOf(game, me)}。未用的點會在季末變成雙倍儲備。</p>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-sm">
              <span>{row.label}</span>
              <span className="ml-2 text-xs text-muted">{row.hint}</span>
            </div>
            <button type="button" className="btn size-11 px-0" disabled={locked || game.buys[row.kind] <= 0} onClick={() => unbuy(row.kind)}>
              −
            </button>
            <span className="w-6 text-center font-serif">{game.buys[row.kind as keyof Buy]}</span>
            <button
              type="button"
              className="btn size-11 px-0"
              disabled={locked || game.budget < (row.kind === "admin" || row.kind === "legis" || row.kind === "judicial" ? 2 : 1) || ((row.kind === "admin" || row.kind === "legis" || row.kind === "judicial") && me[row.kind] >= 8)}
              onClick={() => {
                tone(280);
                buy(row.kind);
              }}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function WarCard({ game, selectedId, onSelect }: { game: GameState; selectedId: number; onSelect: (id: number) => void }) {
  const actor = activeNation(game);
  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-lg">時間與戰況</h3>
        <span className="text-xs text-muted">種子 {game.seed}</span>
      </div>
      <div className="mb-3 grid gap-1">
        {game.nations.map((item) => {
          const rel = relationOf(game, actor.id, item.id);
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex min-h-11 items-center gap-2 rounded-md border px-2 text-left text-sm ${active ? "border-brass bg-parchment" : "border-transparent"}`}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: NATION_COLOR[item.id] }} />
              <span className={`min-w-0 flex-1 truncate ${item.alive ? "" : "text-muted line-through"}`}>{item.name}</span>
              <span className="text-xs text-muted">{item.id === actor.id ? "我方" : relLabel(rel)}</span>
              <span className="w-10 text-right font-serif">{item.alive ? nationalPower(game, item) : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="grid max-h-48 gap-1 overflow-y-auto">
        {game.log.slice(0, 8).map((entry) => (
          <p key={entry.id} className="text-xs text-ink-soft">
            {entry.text}
          </p>
        ))}
      </div>
    </section>
  );
}

function ActionCard({ game, actor, hex, target }: { game: GameState; actor: Nation; hex: HexCell | null; target: Nation }) {
  const stage = useGame((s) => s.stage);
  const confirm = useGame((s) => s.confirm);
  const cancel = useGame((s) => s.cancel);
  const endTurn = useGame((s) => s.endTurn);
  const play = game.phase === "play";
  const actions: { action: Action; label: string; icon: typeof Swords }[] = [];
  if (hex && hex.owner === null) actions.push({ action: { type: "claim", hexId: hex.id }, label: "佔領", icon: Flag });
  if (hex && hex.owner && hex.owner !== actor.id) actions.push({ action: { type: "land", hexId: hex.id }, label: "陸戰", icon: Swords });
  if (target.id !== actor.id) {
    const rel = relationOf(game, actor.id, target.id);
    if (rel === "neutral") {
      actions.push({ action: { type: "war", targetId: target.id }, label: "宣戰", icon: Flag });
      actions.push({ action: { type: "ally", targetId: target.id }, label: "結盟", icon: Users });
    }
    if (rel === "allied") actions.push({ action: { type: "break", targetId: target.id }, label: "解盟", icon: Users });
    if (rel === "war") {
      actions.push({ action: { type: "navy", targetId: target.id }, label: "海戰", icon: Ship });
      actions.push({ action: { type: "air", targetId: target.id }, label: "空襲", icon: Plane });
    }
  }

  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-lg">行動</h3>
        <span className="text-sm text-brass">{game.actionsLeft} 次</span>
      </div>
      <p className="mb-2 text-xs text-muted">
        前提是軍隊與國力。陸戰看接壤與勝算，海戰需要雙方都有沿岸，空襲直接打擊敵國。
        {hasCoast(game, actor.id) ? "" : " 你目前沒有沿岸。"}
      </p>
      {target.id !== actor.id && (
        <p className="mb-2 text-sm">
          目標 {target.name} · {relLabel(relationOf(game, actor.id, target.id))}
          {neighborNations(game, actor.id).some((item) => item.id === target.id) ? " · 接壤" : " · 未接壤"}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {actions.map((item) => {
          const preview = describe(game, item.action);
          return (
            <button
              key={item.label}
              type="button"
              className="btn"
              disabled={!play || !preview.ok}
              title={preview.ok ? preview.detail : preview.reason}
              onClick={() => {
                tone(180);
                stage(item.action);
              }}
            >
              <item.icon className="size-4" />
              {item.label}
              {preview.chance ? ` ${outlook(preview.chance)}` : ""}
            </button>
          );
        })}
      </div>
      {actions.length === 0 && <p className="text-sm text-muted">先點一塊地，或在戰況裡點一個國家。</p>}
      {game.pending && play && (
        <div className="mt-3 rounded-md border border-brass bg-parchment p-3">
          <p className="font-serif">{game.pending.title}</p>
          <p className="mt-1 text-sm text-ink-soft">{game.pending.detail}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-seal flex-1"
              onClick={() => {
                tone(140);
                confirm();
              }}
            >
              確認
            </button>
            <button type="button" className="btn flex-1" onClick={cancel}>
              取消
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn btn-seal mt-3 w-full"
        disabled={!play}
        onClick={() => {
          tone(110);
          endTurn();
        }}
      >
        結束本季
      </button>
    </section>
  );
}

function Handoff({ nation }: { nation: Nation }) {
  const handoff = useGame((s) => s.handoff);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink p-6 text-parchment">
      <div className="w-full max-w-sm text-center">
        <p className="text-xs tracking-widest text-brass">換手</p>
        <div className="mx-auto mt-4 size-4 rounded-sm" style={{ background: NATION_COLOR[nation.id] }} />
        <h2 className="mt-3 font-serif text-4xl">{nation.name}</h2>
        <p className="mt-2 text-sm text-parchment-deep">請把裝置交給這一位。桌面會在開始執政後才打開。</p>
        <button type="button" className="btn btn-seal mt-6 w-full" onClick={handoff}>
          開始執政
        </button>
      </div>
    </div>
  );
}

function Ending({ game }: { game: GameState }) {
  const start = useGame((s) => s.start);
  const seats = useGame((s) => s.seats);
  const abandon = useGame((s) => s.abandon);
  const winner = game.nations.find((item) => item.id === game.winnerId) ?? null;
  const ranked = [...game.nations].sort((a, b) => nationalPower(game, b) - nationalPower(game, a));
  const replaySeats =
    seats.length > 0
      ? seats
      : game.nations
          .filter((item) => item.human)
          .map((item) => ({ name: item.name, system: item.system }));

  return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink p-4">
      <div className="panel max-h-full w-full max-w-md overflow-y-auto p-5 text-ink">
        <p className="text-xs tracking-widest text-brass">終局</p>
        <h2 className="mt-1 font-serif text-3xl">{winner ? `${winner.name}取得勝勢` : "無國存續"}</h2>
        <p className="mt-2 text-sm text-ink-soft">{game.endReason}</p>
        <ol className="mt-4 grid gap-1 text-sm">
          {ranked.map((item, index) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {index + 1}. {item.name}
                {!item.alive ? "（覆滅）" : ""}
              </span>
              <span className="font-serif">{nationalPower(game, item)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2">
          <button type="button" className="btn btn-seal" onClick={() => start(replaySeats)}>
            再來一局
          </button>
          <button type="button" className="btn" onClick={() => start(replaySeats, game.seed)}>
            同一張地圖
          </button>
          <button type="button" className="btn" onClick={abandon}>
            返回設置
          </button>
        </div>
      </div>
    </div>
  );
}
