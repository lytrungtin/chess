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

/**
 * A forcing win: a move that leaves one block, and after that block
 * we still have a five or a double threat. Quiet moves are ignored.
 */
function findForce(board: Uint8Array, side: Side, movesLeft: number): number {
  const opp = opponent(side);
  const cells = candidates(board);
  const ordered = cells
    .map((index) => ({ index, score: shapeScore(board, index, side) }))
    .sort((a, b) => b.score - a.score);

  for (const { index, score } of ordered) {
    if (score < 40_000) break;
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
    if (!forced && wins === 1 && movesLeft > 1) {
      board[only] = opp;
      forced = findForce(board, side, movesLeft - 1) >= 0;
      board[only] = 0;
    }
    board[index] = 0;
    if (forced) return index;
  }
  return -1;
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

  const force = findForce(board, me, 2);
  if (force >= 0) {
    return pack("fork", rank(board, [force], me), null, "Đọc trước một nước đáp. Nước này ép: họ chặn một chỗ, chỗ kia vẫn thành năm hoặc đòn đôi.");
  }

  const oppForce = findForce(board, opp, 2);
  if (oppForce >= 0) {
    return pack("block-fork", rank(board, [oppForce], me), null, "Đối thủ có nước ép. Giữ ô đó trước khi họ đánh.");
  }

  const seeded = [...cells].sort((a, b) => shapeScore(board, b, me) - shapeScore(board, a, me)).slice(0, 16);
  let best: Ranked | null = null;
  let bestBias = -Infinity;
  const mid = (SIZE - 1) / 2;
  for (const index of seeded) {
    const mine = shapeScore(board, index, me);
    board[index] = me;
    const cost = replyCost(board, opp);
    board[index] = 0;
    const score = mine >= 1_000_000_000 ? mine : mine - cost * DEFENSE;
    const bias = -((rowOf(index) - mid) ** 2 + (colOf(index) - mid) ** 2);
    if (!best || score > best.score || (score === best.score && bias > bestBias)) {
      best = { index, score, mine, theirs: cost };
      bestBias = bias;
    }
  }
  const ranked = best ?? rank(board, cells, me);
  return pack(
    "pressure",
    ranked,
    null,
    `Đọc trước một nước đáp. Đòn ta: ${band(ranked.mine)}. Đòn địch: ${band(ranked.theirs)}.`,
  );
}

export { WIN };
