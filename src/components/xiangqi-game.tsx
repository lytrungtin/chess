import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Undo2, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { decide, type BotKind, type Decision } from "@/lib/xiangqi/bot";
import {
  FILES,
  RANKS,
  applyMove,
  emptyGame,
  fileOf,
  findKing,
  inCheck,
  legalMoves,
  pieceChar,
  pieceName,
  rankOf,
  undoLast,
  type Side,
  type Snapshot,
} from "@/lib/xiangqi/rules";

const STORAGE_KEY = "xiangqi-ap-luc-v1";
const PACE_KEY = "xiangqi-pace-v1";

type Pace = "thegioi" | "morong" | "nhanh" | "chop";

const PACES: Record<Pace, { label: string; hint: string; base: number; inc: number }> = {
  thegioi: { label: "Thế giới", hint: "60 phút + 30 giây", base: 60 * 60_000, inc: 30_000 },
  morong: { label: "Mở rộng", hint: "40 phút + 15 giây", base: 40 * 60_000, inc: 15_000 },
  nhanh: { label: "Nhanh", hint: "10 phút + 5 giây", base: 10 * 60_000, inc: 5_000 },
  chop: { label: "Chớp", hint: "5 phút + 3 giây", base: 5 * 60_000, inc: 3_000 },
};

function isPace(value: string | null): value is Pace {
  return value === "thegioi" || value === "morong" || value === "nhanh" || value === "chop";
}

function freshBanks(pace: Pace): { r: number; b: number } {
  const base = PACES[pace].base;
  return { r: base, b: base };
}

function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 20_000) {
    const tenths = Math.ceil(safe / 100);
    const seconds = Math.floor(tenths / 10);
    const tenth = tenths % 10;
    return `0:${String(seconds).padStart(2, "0")}.${tenth}`;
  }
  const seconds = Math.ceil(safe / 1000);
  const minute = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minute}:${String(rest).padStart(2, "0")}`;
}

type RecordScore = { win: number; loss: number; draw: number };

const PRINCIPLES: { kinds: BotKind[]; title: string; body: string }[] = [
  {
    kinds: ["mate", "escape"],
    title: "Còn một bước",
    body: "Chiếu hết thì đánh. Bị chiếu thì thoát trước.",
  },
  {
    kinds: ["press"],
    title: "Ép chiếu",
    body: "Thấy đường hết thì đi tiếp, không giữ quân.",
  },
  {
    kinds: ["pressure", "capture"],
    title: "Áp lực",
    body: "Đọc sâu ở nước chính, tối đa năm giây. Xe, pháo, mã tiến về phía tướng.",
  },
  {
    kinds: ["pressure", "capture"],
    title: "Không all-in",
    body: "Không đổi xe lấy tốt nếu chưa thấy chiếu hết.",
  },
];

function tone(kind: "move" | "win", ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes = kind === "win" ? [392, 494, 587] : [440];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.04, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

function loadRecord(): RecordScore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { win: 0, loss: 0, draw: 0 };
    const parsed = JSON.parse(raw) as Partial<RecordScore>;
    return {
      win: Number(parsed.win) || 0,
      loss: Number(parsed.loss) || 0,
      draw: Number(parsed.draw) || 0,
    };
  } catch {
    return { win: 0, loss: 0, draw: 0 };
  }
}

function sideLabel(side: Side): string {
  return side === "r" ? "Đỏ" : "Đen";
}

export function XiangqiGame() {
  const [vsBot, setVsBot] = useState(true);
  const [human, setHuman] = useState<Side>("r");
  const [game, setGame] = useState<Snapshot>(emptyGame);
  const [selected, setSelected] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [sound, setSound] = useState(false);
  const [record, setRecord] = useState<RecordScore>({ win: 0, loss: 0, draw: 0 });
  const [hydrated, setHydrated] = useState(false);
  const [pace, setPace] = useState<Pace>("thegioi");
  const [banks, setBanks] = useState(() => freshBanks("thegioi"));
  const [flag, setFlag] = useState<Side | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const gameRef = useRef(game);
  const audioRef = useRef<AudioContext | null>(null);
  const banksRef = useRef(banks);
  const paceRef = useRef(pace);
  const flagRef = useRef<Side | null>(null);
  const stampRef = useRef(Date.now());
  const historyRef = useRef([freshBanks("thegioi")]);
  gameRef.current = game;
  paceRef.current = pace;
  banksRef.current = banks;

  useEffect(() => {
    setRecord(loadRecord());
    const saved = localStorage.getItem(PACE_KEY);
    if (isPace(saved) && saved !== "thegioi") {
      const fresh = freshBanks(saved);
      setPace(saved);
      paceRef.current = saved;
      banksRef.current = fresh;
      historyRef.current = [fresh];
      stampRef.current = Date.now();
      setBanks(fresh);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }, [record, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PACE_KEY, pace);
  }, [pace, hydrated]);

  useEffect(() => {
    if (game.winner || game.draw || flag) return;
    const id = window.setInterval(() => {
      const left = banksRef.current[gameRef.current.turn] - (Date.now() - stampRef.current);
      setTick(Date.now());
      if (left > 0 || flagRef.current) return;
      const loser = gameRef.current.turn;
      flagRef.current = loser;
      const next = { ...banksRef.current, [loser]: 0 };
      banksRef.current = next;
      setBanks(next);
      setFlag(loser);
      if (vsBot) {
        setRecord((current) => {
          const key = loser === human ? "loss" : "win";
          return { ...current, [key]: current[key] + 1 };
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [game.turn, game.winner, game.draw, game.gen, flag, vsBot, human]);

  const targets = useMemo(() => {
    if (selected == null || game.winner || game.draw) return new Set<number>();
    const board = game.board.slice();
    const moves = legalMoves(board, game.turn).filter((move) => move.from === selected);
    return new Set(moves.map((move) => move.to));
  }, [game, selected]);

  function playSound(next: Snapshot) {
    if (!sound) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    tone(next.winner || next.draw ? "win" : "move", ctx);
  }

  function scoreFor(prev: Snapshot, next: Snapshot, delta: 1 | -1) {
    if (!vsBot) return;
    const over = delta > 0 ? next : prev;
    if (!over.winner && !over.draw) return;
    setRecord((current) => {
      const key = over.draw ? "draw" : over.winner === human ? "win" : "loss";
      return { ...current, [key]: Math.max(0, current[key] + delta) };
    });
  }

  function charge(side: Side): boolean {
    const elapsed = Date.now() - stampRef.current;
    const left = banksRef.current[side] - elapsed;
    if (left <= 0) {
      flagRef.current = side;
      const expired = { ...banksRef.current, [side]: 0 };
      banksRef.current = expired;
      setBanks(expired);
      setFlag(side);
      if (vsBot) {
        setRecord((current) => {
          const key = side === human ? "loss" : "win";
          return { ...current, [key]: current[key] + 1 };
        });
      }
      return false;
    }
    const next = { ...banksRef.current, [side]: left + PACES[paceRef.current].inc };
    banksRef.current = next;
    historyRef.current.push(next);
    stampRef.current = Date.now();
    setBanks(next);
    return true;
  }

  function publish(prev: Snapshot, next: Snapshot) {
    if (next === prev || flagRef.current) return;
    if (!charge(prev.turn)) return;
    if (!prev.winner && !prev.draw) scoreFor(prev, next, 1);
    playSound(next);
    setSelected(null);
    setGame(next);
  }

  useEffect(() => {
    if (!vsBot || game.winner || game.draw || flag || game.turn === human) return;
    const gen = game.gen;
    const turn = game.turn;
    const timer = window.setTimeout(() => {
      if (flagRef.current) return;
      const prev = gameRef.current;
      if (prev.gen !== gen || prev.turn !== turn || prev.winner || prev.draw) return;
      const choice = decide(prev.board, turn);
      if (choice.from < 0) return;
      setDecision(choice);
      publish(prev, applyMove(prev, choice.from, choice.to));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [vsBot, human, sound, game.gen, game.turn, game.winner, game.draw, game.moves.length, flag]);

  function onPoint(index: number) {
    const prev = gameRef.current;
    if (prev.winner || prev.draw || flagRef.current) return;
    if (vsBot && prev.turn !== human) return;
    const piece = prev.board[index];
    if (selected != null && targets.has(index)) {
      publish(prev, applyMove(prev, selected, index));
      return;
    }
    if (piece && piece.side === prev.turn) setSelected(index);
    else setSelected(null);
  }

  function restart(nextHuman = human, nextVsBot = vsBot, nextPace = paceRef.current) {
    const fresh = freshBanks(nextPace);
    setHuman(nextHuman);
    setVsBot(nextVsBot);
    setPace(nextPace);
    setDecision(null);
    setSelected(null);
    flagRef.current = null;
    setFlag(null);
    banksRef.current = fresh;
    historyRef.current = [fresh];
    stampRef.current = Date.now();
    setBanks(fresh);
    setGame((prev) => ({ ...emptyGame(), gen: prev.gen + 1 }));
  }

  function onUndo() {
    const prev = gameRef.current;
    if (prev.moves.length === 0) return;
    const finished = prev.winner !== 0 || prev.draw;
    let next = undoLast(prev);
    if (
      vsBot &&
      prev.moves[prev.moves.length - 1]?.side !== human &&
      next.moves.length > 0 &&
      next.moves[next.moves.length - 1]?.side === human
    ) {
      next = undoLast(next);
    }
    if (flagRef.current) {
      if (vsBot) {
        const loser = flagRef.current;
        setRecord((current) => {
          const key = loser === human ? "loss" : "win";
          return { ...current, [key]: Math.max(0, current[key] - 1) };
        });
      }
      flagRef.current = null;
      setFlag(null);
    } else if (finished) scoreFor(prev, prev, -1);
    setDecision(null);
    setSelected(null);
    const mark = historyRef.current[next.moves.length] ?? freshBanks(paceRef.current);
    historyRef.current = historyRef.current.slice(0, next.moves.length + 1);
    banksRef.current = mark;
    stampRef.current = Date.now();
    setBanks(mark);
    setGame(next);
  }

  function toggleSound() {
    const ctx = audioRef.current ?? new AudioContext();
    audioRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    setSound((on) => !on);
  }

  const thinking = vsBot && !game.winner && !game.draw && !flag && game.turn !== human;
  const last = game.moves[game.moves.length - 1];
  const checked = !game.winner && !game.draw && !flag && inCheck(game.board, game.turn);
  const king = findKing(game.board, game.turn);
  const yourTurn = !vsBot || game.turn === human;
  const activeKind = decision?.kind;
  const over = Boolean(game.winner) || game.draw || Boolean(flag);
  const spent = Math.max(0, tick - stampRef.current);
  const shown = {
    r: !over && game.turn === "r" ? Math.max(0, banks.r - spent) : banks.r,
    b: !over && game.turn === "b" ? Math.max(0, banks.b - spent) : banks.b,
  };

  let status = yourTurn ? "Tới lượt bạn" : "Tới lượt đối thủ.";
  if (!vsBot) status = `Tới lượt ${sideLabel(game.turn).toLowerCase()}.`;
  if (checked) status = `Chiếu — ${sideLabel(game.turn).toLowerCase()} phải thoát.`;
  if (thinking) status = "Bot đang đọc bàn.";
  if (game.draw) status = "Hòa — thế cờ lặp lại.";
  if (game.winner === "r") status = "Đỏ thắng — chiếu hết.";
  if (game.winner === "b") status = "Đen thắng — chiếu hết.";
  if (flag === "r") status = "Đỏ hết giờ — đen thắng.";
  if (flag === "b") status = "Đen hết giờ — đỏ thắng.";

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <section className="min-w-0">
        <header className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-paper/60 uppercase">Bot Áp Lực</p>
            <h1 className="font-display text-4xl leading-none text-paper sm:text-5xl">Cờ Tướng</h1>
          </div>
          <p className="pb-1 text-sm text-paper/70">Nước {game.moves.length}</p>
        </header>
        <p className="mb-3 text-sm text-paper/80" aria-live="polite">
          {status}
        </p>
        {thinking ? <div className="think-bar mb-3" /> : <div className="mb-3 h-0.5" />}

        <div className="mx-auto flex max-w-[40rem] flex-col gap-2">
          <ClockFace label="Đen" ms={shown.b} active={!over && game.turn === "b"} inc={PACES[pace].inc} />
          <div className="xq-frame">
        <div className="xq-board" role="group" aria-label="Bàn cờ tướng">
          <svg viewBox="0 0 8 9" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <rect width="8" height="9" rx="0.08" fill="var(--color-paper)" />
            {Array.from({ length: RANKS }, (_, rank) => (
              <line
                key={`h${rank}`}
                x1="0"
                y1={rank}
                x2="8"
                y2={rank}
                stroke="var(--color-ink)"
                strokeWidth="0.035"
              />
            ))}
            {Array.from({ length: FILES }, (_, file) =>
              file === 0 || file === 8 ? (
                <line
                  key={`v${file}`}
                  x1={file}
                  y1="0"
                  x2={file}
                  y2="9"
                  stroke="var(--color-ink)"
                  strokeWidth="0.035"
                />
              ) : (
                <g key={`v${file}`}>
                  <line x1={file} y1="0" x2={file} y2="4" stroke="var(--color-ink)" strokeWidth="0.035" />
                  <line x1={file} y1="5" x2={file} y2="9" stroke="var(--color-ink)" strokeWidth="0.035" />
                </g>
              ),
            )}
            <line x1="3" y1="0" x2="5" y2="2" stroke="var(--color-ink)" strokeWidth="0.035" />
            <line x1="5" y1="0" x2="3" y2="2" stroke="var(--color-ink)" strokeWidth="0.035" />
            <line x1="3" y1="7" x2="5" y2="9" stroke="var(--color-ink)" strokeWidth="0.035" />
            <line x1="5" y1="7" x2="3" y2="9" stroke="var(--color-ink)" strokeWidth="0.035" />
            <text x="1.15" y="4.62" fill="var(--color-ink)" fontSize="0.38" fontFamily="Noto Serif SC, serif">
              楚河
            </text>
            <text x="5.15" y="4.62" fill="var(--color-ink)" fontSize="0.38" fontFamily="Noto Serif SC, serif">
              漢界
            </text>
          </svg>
          {Array.from({ length: FILES * RANKS }, (_, index) => {
            const piece = game.board[index];
            const file = fileOf(index);
            const rank = rankOf(index);
            const locked = Boolean(game.winner) || game.draw || thinking || Boolean(flag);
            return (
              <button
                key={index}
                type="button"
                className={clsx(
                  "xq-point",
                  selected === index && "is-selected",
                  (last?.from === index || last?.to === index) && "is-last",
                  checked && index === king && "is-check",
                )}
                style={{ left: `${(file / 8) * 100}%`, top: `${(rank / 9) * 100}%` }}
                disabled={locked}
                onClick={() => onPoint(index)}
                aria-label={
                  piece
                    ? `${pieceName(piece.kind)} ${sideLabel(piece.side)}, cột ${file + 1}, hàng ${rank + 1}`
                    : `Cột ${file + 1}, hàng ${rank + 1}, trống`
                }
              >
                {piece ? (
                  <span className={clsx("xq-disc", piece.side === "r" ? "is-red" : "is-black")}>
                    {pieceChar(piece)}
                  </span>
                ) : targets.has(index) ? (
                  <span className="xq-dot" />
                ) : null}
                {piece && targets.has(index) ? <span className="xq-ring" /> : null}
              </button>
            );
          })}
        </div>
          </div>
          <ClockFace label="Đỏ" ms={shown.r} active={!over && game.turn === "r"} inc={PACES[pace].inc} />
        </div>
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
        <section className="rounded-2xl bg-paper p-4 text-ink">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl leading-none">
              {decision ? decision.title : "Cách bot nghĩ"}
            </h2>
            <span
              className={clsx(
                "inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold",
                game.turn === "r" ? "bg-mark-x text-paper" : "bg-ink text-paper",
              )}
              aria-hidden="true"
            >
              {sideLabel(game.winner || game.turn).slice(0, 1)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-ink/80">
            {decision
              ? decision.note
              : "Đỏ đi trước. Bot nghĩ tối đa năm giây mỗi nước: đọc hết hai nước, rồi đọc sâu thêm ở các nước chính."}
          </p>
        </section>

        <section className="rounded-2xl bg-paper p-4 text-ink">
          <div className="grid grid-cols-2 gap-2">
            <Choice pressed={vsBot} onClick={() => !vsBot && restart(human, true)} label="Với bot" />
            <Choice pressed={!vsBot} onClick={() => vsBot && restart(human, false)} label="Hai người" />
            <Choice
              pressed={vsBot && human === "r"}
              disabled={!vsBot}
              onClick={() => vsBot && human !== "r" && restart("r", true)}
              label="Bạn cầm đỏ"
            />
            <Choice
              pressed={vsBot && human === "b"}
              disabled={!vsBot}
              onClick={() => vsBot && human !== "b" && restart("b", true)}
              label="Bạn cầm đen"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(Object.keys(PACES) as Pace[]).map((key) => (
              <Choice
                key={key}
                pressed={pace === key}
                onClick={() => pace !== key && restart(human, vsBot, key)}
                label={PACES[key].label}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-ink/70">
            {PACES[pace].hint}. Hết giờ là thua. Mỗi nước đi xong được cộng thêm giây, như thể lệ giải thế giới.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => restart()}
              className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mark-x text-sm font-semibold text-paper"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Ván mới
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={game.moves.length === 0}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-ink/10 text-sm font-medium text-ink disabled:opacity-40"
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Lại
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-paper/95 p-4 text-ink">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-ink/70 uppercase">Tỷ số với bot</h2>
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex size-11 items-center justify-center rounded-xl bg-ink/10 text-ink"
              aria-pressed={sound}
              aria-label={sound ? "Tắt tiếng" : "Bật tiếng"}
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Score label="Thắng" value={record.win} />
            <Score label="Thua" value={record.loss} />
            <Score label="Hòa" value={record.draw} />
          </dl>
        </section>

        <ol className="flex flex-col gap-2">
          {PRINCIPLES.map((item) => {
            const on = activeKind ? item.kinds.includes(activeKind) : false;
            return (
              <li
                key={item.title}
                className={clsx(
                  "rounded-2xl border px-3 py-2",
                  on ? "border-mark-x/80 bg-paper text-ink" : "border-paper/15 bg-transparent text-paper/80",
                )}
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-sm leading-snug">{item.body}</p>
              </li>
            );
          })}
        </ol>
      </aside>
    </main>
  );
}

function ClockFace({ label, ms, active, inc }: { label: string; ms: number; active: boolean; inc: number }) {
  const hot = ms < 30_000;
  return (
    <div
      className={clsx(
        "flex items-center justify-between rounded-2xl bg-paper px-4 py-2 text-ink",
        active && "ring-2 ring-mark-x",
      )}
    >
      <div>
        <p className="text-xs font-medium tracking-[0.14em] text-ink/60 uppercase">{label}</p>
        <p className="text-xs text-ink/50">+{inc / 1000} giây mỗi nước</p>
      </div>
      <p className={clsx("font-display text-3xl leading-none tabular-nums", hot && "text-mark-x")} aria-live="off">
        {formatClock(ms)}
      </p>
    </div>
  );
}

function Choice({
  label,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "h-11 rounded-xl text-sm font-medium disabled:opacity-40",
        pressed ? "bg-ink text-paper" : "bg-ink/10 text-ink",
      )}
    >
      {label}
    </button>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-ink/10 py-2">
      <dt className="text-xs text-ink/60">{label}</dt>
      <dd className="font-display text-2xl leading-none">{value}</dd>
    </div>
  );
}
