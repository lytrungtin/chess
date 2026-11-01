import { useEffect, useRef, useState } from "react";
import { RotateCcw, Undo2, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { decide, type Decision, type Kind } from "@/lib/caro/bot";
import {
  SIZE,
  colOf,
  emptyGame,
  playAt,
  rowOf,
  undoLast,
  type Side,
  type Snapshot,
} from "@/lib/caro/rules";

const STORAGE_KEY = "caro-ap-luc-v1";

type RecordScore = { win: number; loss: number; draw: number };

const PRINCIPLES: { kinds: Kind[]; title: string; body: string }[] = [
  {
    kinds: ["win", "block"],
    title: "Còn một bước",
    body: "Có năm thì đánh. Họ có năm thì chặn đúng ô đó.",
  },
  {
    kinds: ["fork", "block-fork"],
    title: "Quyền khi hòa",
    body: "Song ba hoặc tứ hai đầu: họ chỉ đáp được một đòn.",
  },
  {
    kinds: ["pressure"],
    title: "Áp lực tỷ lệ",
    body: "Ô nào gần năm hơn thì đáng đi hơn.",
  },
  {
    kinds: ["pressure"],
    title: "Không all-in",
    body: "Không đuổi hàng yếu khi đối thủ đang gần thắng hơn.",
  },
];

function Mark({ side, className }: { side: Side; className?: string }) {
  if (side === 1) {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <path
          d="M24 24 L76 76 M76 24 L24 76"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="12" />
    </svg>
  );
}

function tone(kind: "x" | "o" | "win", ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes = kind === "win" ? [523, 659, 784] : [kind === "x" ? 620 : 440];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
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

export function CaroGame() {
  const [vsBot, setVsBot] = useState(true);
  const [human, setHuman] = useState<Side>(1);
  const [game, setGame] = useState<Snapshot>(emptyGame);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [sound, setSound] = useState(false);
  const [record, setRecord] = useState<RecordScore>({ win: 0, loss: 0, draw: 0 });
  const [hydrated, setHydrated] = useState(false);
  const gameRef = useRef(game);
  const audioRef = useRef<AudioContext | null>(null);
  gameRef.current = game;

  useEffect(() => {
    setRecord(loadRecord());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }, [record, hydrated]);

  function playSound(next: Snapshot) {
    if (!sound) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (next.winner || next.draw) tone("win", ctx);
    else tone(next.moves[next.moves.length - 1]?.side === 1 ? "x" : "o", ctx);
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

  function publish(prev: Snapshot, next: Snapshot) {
    if (next === prev) return;
    if (!prev.winner && !prev.draw) scoreFor(prev, next, 1);
    playSound(next);
    setGame(next);
  }

  useEffect(() => {
    if (!vsBot || game.winner || game.draw || game.turn === human) return;
    const gen = game.gen;
    const turn = game.turn;
    const timer = window.setTimeout(() => {
      const prev = gameRef.current;
      if (prev.gen !== gen || prev.turn !== turn || prev.winner || prev.draw) return;
      const choice = decide(prev.board, turn);
      if (choice.index < 0) return;
      setDecision(choice);
      publish(prev, playAt(prev, choice.index));
    }, 420);
    return () => window.clearTimeout(timer);
    // publish closes over sound/vsBot/human; those are listed so a change reschedules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsBot, human, sound, game.gen, game.turn, game.winner, game.draw, game.moves.length]);

  function onCell(index: number) {
    const prev = gameRef.current;
    if (prev.winner || prev.draw) return;
    if (vsBot && prev.turn !== human) return;
    if (prev.board[index] !== 0) return;
    publish(prev, playAt(prev, index));
  }

  function restart(nextHuman = human, nextVsBot = vsBot) {
    setHuman(nextHuman);
    setVsBot(nextVsBot);
    setDecision(null);
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
    if (finished) scoreFor(prev, prev, -1);
    setDecision(null);
    setGame(next);
  }

  function toggleSound() {
    const ctx = audioRef.current ?? new AudioContext();
    audioRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    setSound((on) => !on);
  }

  const thinking = vsBot && !game.winner && !game.draw && game.turn !== human;
  const last = game.moves[game.moves.length - 1]?.index ?? -1;
  const win = new Set(game.line);
  const toMove: Side = game.turn;
  const yourTurn = !vsBot || toMove === human;

  let status = "Tới lượt bạn";
  if (game.draw) status = "Hòa — bàn đã kín.";
  else if (game.winner === 1) status = "X thắng — năm quân liên tiếp.";
  else if (game.winner === 2) status = "O thắng — năm quân liên tiếp.";
  else if (thinking) status = "Bot đang đọc bàn.";
  else if (!yourTurn) status = "Tới lượt đối thủ.";
  else if (!vsBot) status = toMove === 1 ? "Tới lượt X." : "Tới lượt O.";

  const activeKind = decision?.kind;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <section className="min-w-0">
        <header className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-paper/60 uppercase">Bot Áp Lực</p>
            <h1 className="font-display text-4xl leading-none text-paper sm:text-5xl">Cờ Caro</h1>
          </div>
          <p className="pb-1 text-sm text-paper/70">Nước {game.moves.length}</p>
        </header>

        <p className="mb-3 text-sm text-paper/80" aria-live="polite">
          {status}
        </p>
        {thinking ? <div className="think-bar mb-3" /> : <div className="mb-3 h-0.5" />}

        <div
          className="caro-board"
          role="group"
          aria-label="Bàn cờ caro 15 nhân 15"
          style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
        >
          {Array.from({ length: SIZE * SIZE }, (_, index) => {
            const value = game.board[index] as 0 | Side;
            const locked = Boolean(game.winner) || game.draw || (vsBot && game.turn !== human);
            const row = rowOf(index) + 1;
            const col = colOf(index) + 1;
            return (
              <button
                key={index}
                type="button"
                className={clsx("caro-cell", win.has(index) && "is-win")}
                disabled={locked || value !== 0}
                onClick={() => onCell(index)}
                aria-label={
                  value === 0
                    ? `Hàng ${row}, cột ${col}, trống`
                    : `Hàng ${row}, cột ${col}, ${value === 1 ? "X" : "O"}`
                }
              >
                {value !== 0 ? (
                  <Mark
                    side={value}
                    className={clsx("caro-mark", value === 1 ? "text-mark-x" : "text-mark-o")}
                  />
                ) : !locked ? (
                  <Mark
                    side={toMove}
                    className={clsx("caro-ghost", toMove === 1 ? "text-mark-x" : "text-mark-o")}
                  />
                ) : null}
                {index === last ? <span className="caro-last" /> : null}
              </button>
            );
          })}
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
                "inline-flex size-9 items-center justify-center rounded-full",
                toMove === 1 ? "bg-mark-x text-paper" : "bg-mark-o text-paper",
              )}
              aria-hidden="true"
            >
              <Mark side={game.winner || toMove} className="size-5" />
            </span>
          </div>
          <p className="text-sm leading-relaxed text-ink/80">
            {decision
              ? decision.note
              : "X đi trước. Bot đọc bàn như đọc ngân sách: ai gần năm quân hơn thì nước đó đáng hơn."}
          </p>
        </section>

        <section className="rounded-2xl bg-paper p-4 text-ink">
          <div className="grid grid-cols-2 gap-2">
            <Choice
              pressed={vsBot}
              onClick={() => {
                if (!vsBot) restart(human, true);
              }}
              label="Với bot"
            />
            <Choice
              pressed={!vsBot}
              onClick={() => {
                if (vsBot) restart(human, false);
              }}
              label="Hai người"
            />
            <Choice
              pressed={vsBot && human === 1}
              disabled={!vsBot}
              onClick={() => {
                if (vsBot && human !== 1) restart(1, true);
              }}
              label="Bạn cầm X"
            />
            <Choice
              pressed={human === 2 && vsBot}
              disabled={!vsBot}
              onClick={() => {
                if (vsBot && human !== 2) restart(2, true);
              }}
              label="Bạn cầm O"
            />
          </div>
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
