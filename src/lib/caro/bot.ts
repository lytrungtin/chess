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

type Profile = {
  forceMoves: number;
  ms: number;
  nodes: number;
  forceBeam: number;
  pressure: number;
  replies: number;
  follows: number;
  read: string;
};

/** Fixed: ten replies, five seconds. Wider beams so the clock, not the old cap, stops the search. */
const PROFILE: Profile = {
  forceMoves: 11,
  ms: 5_000,
  nodes: 400_000,
  forceBeam: 48,
  pressure: 24,
  replies: 8,
  follows: 6,
  read: "mười nước đáp",
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

type SearchBudget = { nodes: number; start: number; cut: boolean };

const Z = new Uint32Array(SIZE * SIZE * 2);
{
  let seed = 0x9e3779b9;
  for (let i = 0; i < Z.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    Z[i] = seed;
  }
}
const TT_SIZE = 1 << 18;
const ttMove = new Int32Array(TT_SIZE);
const ttHash = new Uint32Array(TT_SIZE);
const ttLeft = new Uint8Array(TT_SIZE);

function hashBoard(board: Uint8Array): number {
  let h = 0;
  for (let i = 0; i < board.length; i += 1) {
    const side = board[i];
    if (side) h ^= Z[(i << 1) + side - 1];
  }
  return h >>> 0;
}

function remember(slot: number, key: number, movesLeft: number, move: number, budget: SearchBudget) {
  if (budget.cut) return;
  ttHash[slot] = key;
  ttLeft[slot] = movesLeft;
  ttMove[slot] = move;
}

/**
 * Forcing win over `movesLeft` of our moves.
 * A four leaves one block. An open three leaves two extensions.
 * Every forced reply must still lose, or it is not a force.
 */
function findForce(
  board: Uint8Array,
  side: Side,
  movesLeft: number,
  budget: SearchBudget,
  profile: Profile,
  hash: number,
): number {
  if (budget.nodes > profile.nodes || Date.now() - budget.start > profile.ms) {
    budget.cut = true;
    return -1;
  }
  const key = (hash ^ (side * 0x85ebca6b) ^ (movesLeft * 0xc2b2ae35)) >>> 0;
  const slot = key & (TT_SIZE - 1);
  if (ttHash[slot] === key && ttLeft[slot] >= movesLeft) return ttMove[slot];
  const killer = ttHash[slot] === key ? ttMove[slot] : -1;

  const opp = opponent(side);
  let ordered = candidates(board)
    .map((index) => ({ index, score: shapeScore(board, index, side) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, profile.forceBeam);
  if (killer >= 0) {
    ordered = [{ index: killer, score: shapeScore(board, killer, side) }, ...ordered.filter((item) => item.index !== killer)];
  }
  const top = ordered[0]?.score ?? 0;

  for (const { index, score } of ordered) {
    if (score < 8_000) break;
    if (top >= 8_000_000 && score < 40_000) break;
    budget.nodes += 1;
    if (createsWinAt(board, index, side)) {
      remember(slot, key, movesLeft, index, budget);
      return index;
    }
    const placed = hash ^ Z[(index << 1) + side - 1];
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
      forced = findForce(board, side, movesLeft - 1, budget, profile, placed ^ Z[(only << 1) + opp - 1]) >= 0;
      board[only] = 0;
    } else if (!forced && movesLeft > 1 && wins === 0) {
      const exts = [...new Set(threeExtensions(board, index, side))];
      if (exts.length >= 2 && exts.length <= 4) {
        forced = true;
        for (const ext of exts) {
          board[ext] = opp;
          const lost = findForce(board, side, movesLeft - 1, budget, profile, placed ^ Z[(ext << 1) + opp - 1]) >= 0;
          board[ext] = 0;
          if (!lost) {
            forced = false;
            break;
          }
        }
      }
    }
    board[index] = 0;
    if (forced) {
      remember(slot, key, movesLeft, index, budget);
      return index;
    }
  }
  remember(slot, key, movesLeft, -1, budget);
  return -1;
}

/** Two replies on one candidate: my move, their best tries, my follow-up. */
function twoReply(board: Uint8Array, index: number, me: Side, budget: SearchBudget, profile: Profile, alpha: number, replyCap: number): number {
  const opp = opponent(me);
  board[index] = me;
  if (winSquares(board, opp).length > 0) {
    board[index] = 0;
    return -1_000_000_000;
  }
  const replies = candidates(board)
    .map((cell) => ({ cell, score: shapeScore(board, cell, opp) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, replyCap);
  let worst = Infinity;
  for (const reply of replies) {
    if (budget.nodes > profile.nodes || Date.now() - budget.start > profile.ms) break;
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
        for (const cell of candidates(board).slice(0, 24)) {
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
    if (worst <= alpha) break;
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
export function decide(source: Uint8Array, me: Side): Decision {
  const profile = PROFILE;
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

  const budget: SearchBudget = { nodes: 0, start: Date.now(), cut: false };
  const hash = hashBoard(board);
  const force = findForce(board, me, profile.forceMoves, budget, profile, hash);
  if (force >= 0) {
    return pack("fork", rank(board, [force], me), null, `Cắt nước yếu. Đọc trước ${profile.read} trên nước ép. Họ chặn một chỗ, nước sau vẫn thành năm hoặc đòn đôi.`);
  }

  const oppForce = findForce(board, opp, profile.forceMoves, budget, profile, hash);
  if (oppForce >= 0) {
    return pack("block-fork", rank(board, [oppForce], me), null, `Đối thủ có nước ép trong ${profile.read}. Giữ ô đó trước khi họ đánh.`);
  }

  const seeded = [...cells].sort((a, b) => shapeScore(board, b, me) - shapeScore(board, a, me)).slice(0, profile.pressure);
  let best: Ranked | null = null;
  let bestBias = -Infinity;
  let alpha = -Infinity;
  const mid = (SIZE - 1) / 2;
  seeded.forEach((index, nth) => {
    const mine = shapeScore(board, index, me);
    const score = twoReply(board, index, me, budget, profile, alpha, nth >= 12 ? 3 : profile.replies);
    const bias = -((rowOf(index) - mid) ** 2 + (colOf(index) - mid) ** 2);
    if (!best || score > best.score || (score === best.score && bias > bestBias)) {
      best = { index, score, mine, theirs: Math.max(0, -score) };
      bestBias = bias;
      alpha = score;
    }
  });
  const ranked = best ?? rank(board, cells, me);
  return pack(
    "pressure",
    ranked,
    null,
    `Cắt nước yếu. Đọc trước ${profile.read}. Đòn ta: ${band(ranked.mine)}.`,
  );
}

export { WIN };
