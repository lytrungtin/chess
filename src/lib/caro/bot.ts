import {
  SIZE,
  WIN,
  createsWinAt,
  opponent,
  rowOf,
  colOf,
  type Side,
} from "./rules";

export type Kind = "win" | "block" | "fork" | "block-fork" | "pressure";

export type Decision = {
  index: number;
  kind: Kind;
  title: string;
  note: string;
};

export type Level = "de" | "vua" | "kho" | "expert";

type Profile = {
  forceMoves: number;
  forceMs: number;
  forceNodes: number;
  forceBeam: number;
  pressure: number;
  replies: number;
  follows: number;
  pressureMs: number;
  pressureNodes: number;
  read: string;
};

const PROFILES: Record<Level, Profile> = {
  de: {
    forceMoves: 2,
    forceMs: 180,
    forceNodes: 4000,
    forceBeam: 8,
    pressure: 4,
    replies: 1,
    follows: 1,
    pressureMs: 240,
    pressureNodes: 6000,
    read: "một nước đáp",
  },
  vua: {
    forceMoves: 4,
    forceMs: 420,
    forceNodes: 14000,
    forceBeam: 14,
    pressure: 8,
    replies: 3,
    follows: 3,
    pressureMs: 520,
    pressureNodes: 18000,
    read: "ba nước đáp",
  },
  kho: {
    forceMoves: 5,
    forceMs: 620,
    forceNodes: 24000,
    forceBeam: 18,
    pressure: 12,
    replies: 4,
    follows: 3,
    pressureMs: 720,
    pressureNodes: 30000,
    read: "bốn nước đáp",
  },
  expert: {
    forceMoves: 6,
    forceMs: 820,
    forceNodes: 36000,
    forceBeam: 24,
    pressure: 16,
    replies: 5,
    follows: 4,
    pressureMs: 920,
    pressureNodes: 44000,
    read: "năm nước đáp",
  },
};

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Best shape in one direction, highest first so a five is not scored as a four. */
const SHAPES: ReadonlyArray<{ re: RegExp; score: number }> = [
  { re: /MMMMM/, score: 1_000_000_000 },
  { re: /\.MMMM\./, score: 80_000_000 },
  { re: /MMM\.M|M\.MMM|MM\.MM/, score: 8_000_000 },
  { re: /MMMM\.|\.MMMM/, score: 8_000_000 },
  { re: /\.MMM\./, score: 800_000 },
  { re: /\.MM\.M\.|\.M\.MM\./, score: 400_000 },
  { re: /MMM\.\.|\.\.MMM/, score: 50_000 },
  { re: /\.MM\.M|\.M\.MM/, score: 40_000 },
  { re: /\.MM\./, score: 8_000 },
  { re: /\.M\.M\./, score: 6_000 },
  { re: /MM\.\.|\.\.MM/, score: 1_500 },
  { re: /\.M\./, score: 500 },
];

const DEFENSE = 1.15;

function inBounds(row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < SIZE && col < SIZE;
}

/** Empty cells within two steps of a stone. Immediate wins always fall inside this. */
export function candidates(board: Uint8Array): number[] {
  const seen = new Uint8Array(SIZE * SIZE);
  const out: number[] = [];
  let any = false;
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === 0) continue;
    any = true;
    const row = rowOf(index);
    const col = colOf(index);
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const j = r * SIZE + c;
        if (board[j] !== 0 || seen[j]) continue;
        seen[j] = 1;
        out.push(j);
      }
    }
  }
  if (!any) out.push(Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2));
  return out;
}

function lineString(board: Uint8Array, index: number, dr: number, dc: number, side: Side): string {
  const row = rowOf(index);
  const col = colOf(index);
  let text = "";
  for (let k = -5; k <= 5; k += 1) {
    const r = row + dr * k;
    const c = col + dc * k;
    if (!inBounds(r, c)) {
      text += "W";
    } else if (k === 0) {
      text += "M";
    } else {
      const value = board[r * SIZE + c];
      text += value === 0 ? "." : value === side ? "M" : "O";
    }
  }
  return text;
}

function shapeScore(board: Uint8Array, index: number, side: Side): number {
  let total = 0;
  for (const [dr, dc] of DIRS) {
    const text = lineString(board, index, dr, dc, side);
    let best = 0;
    for (const shape of SHAPES) {
      if (shape.re.test(text)) {
        best = shape.score;
        break;
      }
    }
    total += best;
  }
  return total;
}

function band(score: number): string {
  if (score >= 1_000_000_000) return "năm";
  if (score >= 8_000_000) return "tứ";
  if (score >= 400_000) return "ba hở";
  if (score >= 40_000) return "ba";
  if (score >= 6_000) return "hai hở";
  if (score >= 500) return "mở";
  return "yếu";
}

type Fork = { wins: number; openThrees: number };

function directionClass(text: string): "five" | "four" | "open3" | "other" {
  if (/MMMMM/.test(text)) return "five";
  if (/MMMM\.|\.MMMM|MMM\.M|M\.MMM|MM\.MM/.test(text)) return "four";
  if (/\.MMM\.|\.MM\.M\.|\.M\.MM\./.test(text)) return "open3";
  return "other";
}

function openThreeCount(board: Uint8Array, index: number, side: Side): number {
  let count = 0;
  for (const [dr, dc] of DIRS) {
    if (directionClass(lineString(board, index, dr, dc, side)) === "open3") count += 1;
  }
  return count;
}

/** A move that leaves two winning squares, or two open threes. */
function forkAt(board: Uint8Array, index: number, side: Side): Fork | null {
  if (board[index] !== 0) return null;
  board[index] = side;
  let wins = 0;
  try {
    for (const cell of candidates(board)) {
      if (createsWinAt(board, cell, side)) {
        wins += 1;
        if (wins >= 2) break;
      }
    }
    const openThrees = wins >= 2 ? 0 : openThreeCount(board, index, side);
    if (wins >= 2 || openThrees >= 2) return { wins, openThrees };
    return null;
  } finally {
    board[index] = 0;
  }
}

type Ranked = { index: number; score: number; mine: number; theirs: number };

/** Empty cells where `side` would complete five. */
function winSquares(board: Uint8Array, side: Side): number[] {
  const out: number[] = [];
  for (const cell of candidates(board)) {
    if (createsWinAt(board, cell, side)) out.push(cell);
  }
  return out;
}

/** Extension squares of a straight open three through `index`. */
function threeExtensions(board: Uint8Array, index: number, side: Side): number[] {
  const out: number[] = [];
  const row = rowOf(index);
  const col = colOf(index);
  for (const [dr, dc] of DIRS) {
    let neg = 0;
    let pos = 0;
    let r = row - dr;
    let c = col - dc;
    while (inBounds(r, c) && board[r * SIZE + c] === side) {
      neg += 1;
      r -= dr;
      c -= dc;
    }
    const negEnd = inBounds(r, c) && board[r * SIZE + c] === 0 ? r * SIZE + c : -1;
    r = row + dr;
    c = col + dc;
    while (inBounds(r, c) && board[r * SIZE + c] === side) {
      pos += 1;
      r += dr;
      c += dc;
    }
    const posEnd = inBounds(r, c) && board[r * SIZE + c] === 0 ? r * SIZE + c : -1;
    if (1 + neg + pos === 3 && negEnd >= 0 && posEnd >= 0) out.push(negEnd, posEnd);
  }
  return out;
}

type SearchBudget = { nodes: number; start: number };

/**
 * Forcing win over `movesLeft` of our moves.
 * A four leaves one block. An open three leaves two extensions.
 * Every forced reply must still lose, or it is not a force.
 */
function findForce(board: Uint8Array, side: Side, movesLeft: number, budget: SearchBudget, profile: Profile): number {
  if (budget.nodes > profile.forceNodes || Date.now() - budget.start > profile.forceMs) return -1;
  const opp = opponent(side);
  const ordered = candidates(board)
    .map((index) => ({ index, score: shapeScore(board, index, side) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, profile.forceBeam);

  for (const { index, score } of ordered) {
    if (score < 8_000) break;
    budget.nodes += 1;
    if (createsWinAt(board, index, side)) return index;
    board[index] = side;
    let wins = 0;
    let only = -1;
    for (const cell of candidates(board)) {
      if (!createsWinAt(board, cell, side)) continue;
      wins += 1;
      only = cell;
      if (wins >= 2) break;
    }
    let forced = wins >= 2;
    if (!forced && movesLeft > 1 && wins === 1) {
      board[only] = opp;
      forced = findForce(board, side, movesLeft - 1, budget, profile) >= 0;
      board[only] = 0;
    } else if (!forced && movesLeft > 1 && wins === 0) {
      const exts = [...new Set(threeExtensions(board, index, side))];
      if (exts.length >= 2 && exts.length <= 4) {
        forced = true;
        for (const ext of exts) {
          board[ext] = opp;
          const lost = findForce(board, side, movesLeft - 1, budget, profile) >= 0;
          board[ext] = 0;
          if (!lost) {
            forced = false;
            break;
          }
        }
      }
    }
    board[index] = 0;
    if (forced) return index;
  }
  return -1;
}

/** Two replies on one candidate: my move, their best tries, my follow-up. */
function twoReply(board: Uint8Array, index: number, me: Side, budget: SearchBudget, profile: Profile): number {
  const opp = opponent(me);
  board[index] = me;
  if (winSquares(board, opp).length > 0) {
    board[index] = 0;
    return -1_000_000_000;
  }
  const replies = candidates(board)
    .map((cell) => ({ cell, score: shapeScore(board, cell, opp) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, profile.replies);
  let worst = Infinity;
  for (const reply of replies) {
    if (budget.nodes > profile.pressureNodes || Date.now() - budget.start > profile.pressureMs) break;
    budget.nodes += 1;
    board[reply.cell] = opp;
    const follows = candidates(board)
      .map((cell) => ({ cell, score: shapeScore(board, cell, me) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, profile.follows);
    let bestFollow = -Infinity;
    for (const follow of follows) {
      if (createsWinAt(board, follow.cell, me)) {
        bestFollow = 1_000_000_000;
        break;
      }
      board[follow.cell] = me;
      const blown = winSquares(board, opp).length > 0;
      let oppBest = 0;
      if (!blown) {
        for (const cell of candidates(board).slice(0, 12)) {
          const score = shapeScore(board, cell, opp);
          if (score > oppBest) oppBest = score;
          if (oppBest >= 8_000_000) break;
        }
      }
      board[follow.cell] = 0;
      bestFollow = Math.max(bestFollow, follow.score - (blown ? 1_000_000_000 : oppBest) * DEFENSE);
    }
    board[reply.cell] = 0;
    if (bestFollow < worst) worst = bestFollow;
  }
  board[index] = 0;
  return worst === Infinity ? -1_000_000_000 : worst;
}

/** Cost of the opponent's best reply: a win, a double threat, or their best shape. */
function replyCost(board: Uint8Array, side: Side): number {
  const wins = winSquares(board, side);
  if (wins.length >= 2) return 1_000_000_000;
  if (wins.length === 1) return 80_000_000;
  const best = rank(board, candidates(board), side);
  return best.score;
}

function rank(board: Uint8Array, cells: number[], me: Side): Ranked {
  const opp = opponent(me);
  const mid = (SIZE - 1) / 2;
  let best: Ranked | null = null;
  let bestBias = -Infinity;
  for (const index of cells) {
    const mine = shapeScore(board, index, me);
    const theirs = shapeScore(board, index, opp);
    const score = mine >= 1_000_000_000 ? mine : mine + theirs * DEFENSE;
    const bias = -((rowOf(index) - mid) ** 2 + (colOf(index) - mid) ** 2);
    if (
      !best ||
      score > best.score ||
      (score === best.score && (bias > bestBias || (bias === bestBias && index < best.index)))
    ) {
      best = { index, score, mine, theirs };
      bestBias = bias;
    }
  }
  return best ?? { index: cells[0] ?? -1, score: 0, mine: 0, theirs: 0 };
}

function pack(kind: Kind, ranked: Ranked, fork?: Fork | null, note?: string): Decision {
  const built = packBody(kind, ranked, fork);
  return note ? { ...built, note } : built;
}

function packBody(kind: Kind, ranked: Ranked, fork?: Fork | null): Decision {
  if (kind === "win") {
    return {
      index: ranked.index,
      kind,
      title: "Nước thắng",
      note: "Còn một bước tới năm quân. Đánh dứt điểm, không giữ quân.",
    };
  }
  if (kind === "block") {
    return {
      index: ranked.index,
      kind,
      title: "Chặn thắng",
      note: "Đối thủ còn một bước. Phải chiếm đúng ô đó, nếu không là thua ngay.",
    };
  }
  if (kind === "fork") {
    const openFour = (fork?.wins ?? 0) >= 2;
    return {
      index: ranked.index,
      kind,
      title: openFour ? "Tứ hai đầu" : "Song ba",
      note: openFour
        ? "Hai ô kết thúc cùng lúc. Đối thủ chỉ đi được một nước — như thắng khi hòa."
        : "Hai hàng ba hở. Chặn một hàng, hàng kia vẫn thành tứ.",
    };
  }
  if (kind === "block-fork") {
    return {
      index: ranked.index,
      kind,
      title: "Chặn đòn đôi",
      note: "Đối thủ sắp có hai mối đe dọa. Giữ ô này trước khi họ đánh.",
    };
  }
  return {
    index: ranked.index,
    kind: "pressure",
    title: "Áp lực tỷ lệ",
    note: `Đòn ta: ${band(ranked.mine)}. Đòn địch: ${band(ranked.theirs)}. Ưu tiên bên gần năm hơn, và nhích thêm một nhịp phòng thủ.`,
  };
}

/**
 * Caro translation of the bid bot:
 * distance 0 → take the win; opponent distance 0 → block;
 * a double threat is the tie-break (they can answer only one);
 * otherwise bid their closeness plus a small defense margin,
 * never chasing a weak line while a closer threat exists.
 */
export function decide(source: Uint8Array, me: Side, level: Level = "expert"): Decision {
  const profile = PROFILES[level];
  const board = new Uint8Array(source);
  const opp = opponent(me);
  const cells = candidates(board);
  if (cells.length === 0 || cells.every((cell) => board[cell] !== 0)) {
    return pack("pressure", { index: -1, score: 0, mine: 0, theirs: 0 });
  }

  const myWins = cells.filter((cell) => createsWinAt(board, cell, me));
  if (myWins.length > 0) return pack("win", rank(board, myWins, me));

  const oppWins = cells.filter((cell) => createsWinAt(board, cell, opp));
  if (oppWins.length > 0) return pack("block", rank(board, oppWins, me));

  let bestFork: { index: number; fork: Fork } | null = null;
  let bestForkRank: Ranked | null = null;
  for (const cell of cells) {
    const fork = forkAt(board, cell, me);
    if (!fork) continue;
    const ranked = rank(board, [cell], me);
    if (!bestForkRank || ranked.score > bestForkRank.score) {
      bestFork = { index: cell, fork };
      bestForkRank = ranked;
    }
  }
  if (bestFork && bestForkRank) return pack("fork", bestForkRank, bestFork.fork);

  const blocks: number[] = [];
  for (const cell of cells) {
    if (forkAt(board, cell, opp)) blocks.push(cell);
  }
  if (blocks.length > 0) return pack("block-fork", rank(board, blocks, me));

  const budget: SearchBudget = { nodes: 0, start: Date.now() };
  const force = findForce(board, me, profile.forceMoves, budget, profile);
  if (force >= 0) {
    return pack("fork", rank(board, [force], me), null, `Đọc trước ${profile.read} trên nước ép. Họ chặn một chỗ, nước sau vẫn thành năm hoặc đòn đôi.`);
  }

  const oppForce = findForce(board, opp, profile.forceMoves, budget, profile);
  if (oppForce >= 0) {
    return pack("block-fork", rank(board, [oppForce], me), null, `Đối thủ có nước ép trong ${profile.read}. Giữ ô đó trước khi họ đánh.`);
  }

  const seeded = [...cells].sort((a, b) => shapeScore(board, b, me) - shapeScore(board, a, me)).slice(0, profile.pressure);
  let best: Ranked | null = null;
  let bestBias = -Infinity;
  const mid = (SIZE - 1) / 2;
  for (const index of seeded) {
    const mine = shapeScore(board, index, me);
    const score = twoReply(board, index, me, budget, profile);
    const bias = -((rowOf(index) - mid) ** 2 + (colOf(index) - mid) ** 2);
    if (!best || score > best.score || (score === best.score && bias > bestBias)) {
      best = { index, score, mine, theirs: Math.max(0, -score) };
      bestBias = bias;
    }
  }
  const ranked = best ?? rank(board, cells, me);
  return pack(
    "pressure",
    ranked,
    null,
    `Đọc trước ${profile.read}. Đòn ta: ${band(ranked.mine)}.`,
  );
}

export { WIN };
