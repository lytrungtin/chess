import {
  at,
  fastInCheckAt,
  fileOf,
  findKing,
  inCheck,
  legalMoves,
  opponent,
  pieceName,
  applyMove,
  playMutable,
  pseudoMoves,
  rankOf,
  startBoard,
  undoMutable,
  type Board,
  type Kind,
  type Move,
  type Piece,
  type Side,
} from "./rules";

export type BotKind = "mate" | "escape" | "press" | "capture" | "pressure";

export type Decision = {
  from: number;
  to: number;
  kind: BotKind;
  title: string;
  note: string;
};

const VALUE: Record<Kind, number> = {
  K: 0,
  R: 900,
  C: 450,
  H: 400,
  E: 180,
  A: 180,
  P: 80,
};

const MATE = 100_000;
const MATE_BOUND = 90_000;
const BUDGET_MS = 420;
const MAX_DEPTH = 3;
const SELECT_DEPTH = 5;
const SELECT_ROOT = 6;
const BEAM = 10;
const TT_BITS = 16;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

type TTEntry = {
  key: number;
  depth: number;
  score: number;
  flag: number;
  from: number;
  to: number;
};

const ZOBRIST: number[][] = Array.from({ length: 90 }, () => Array.from({ length: 14 }, () => 0));
const ZSIDE = 0x9e3779b9;

function mix(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

let seed = 0x12345678;
for (let square = 0; square < 90; square += 1) {
  for (let piece = 0; piece < 14; piece += 1) {
    seed = mix(seed + square * 17 + piece * 131);
    ZOBRIST[square][piece] = seed;
  }
}

function pieceIndex(piece: Piece): number {
  const kind = "KAEHRCP".indexOf(piece.kind);
  return (piece.side === "r" ? 0 : 7) + kind;
}

function hashBoard(board: Board, side: Side): number {
  let hash = side === "b" ? ZSIDE : 0;
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (piece) hash ^= ZOBRIST[index][pieceIndex(piece)];
  }
  return hash >>> 0;
}

function hashAfter(hash: number, board: Board, move: Move, captured: Piece | null): number {
  const mover = board[move.to];
  if (!mover) return hash;
  hash ^= ZOBRIST[move.from][pieceIndex(mover)];
  hash ^= ZOBRIST[move.to][pieceIndex(mover)];
  if (captured) hash ^= ZOBRIST[move.to][pieceIndex(captured)];
  hash ^= ZSIDE;
  return hash >>> 0;
}

const tt: Array<TTEntry | undefined> = Array.from({ length: TT_SIZE });
const history = new Int32Array(90 * 90);
const killers: number[][] = Array.from({ length: 32 }, () => [-1, -1]);

let deadline = 0;
let aborted = false;
let nodes = 0;

function timedOut(): boolean {
  nodes += 1;
  if (aborted) return true;
  if ((nodes & 255) === 0 && Date.now() > deadline) {
    aborted = true;
    return true;
  }
  return false;
}

function evaluate(board: Board, side: Side): number {
  let score = 0;
  const redKing = findKing(board, "r");
  const blackKing = findKing(board, "b");
  const open = new Array<boolean>(9);
  for (let file = 0; file < 9; file += 1) {
    let pawn = false;
    for (let rank = 0; rank < 10; rank += 1) {
      const piece = board[at(file, rank)];
      if (piece && piece.kind === "P") pawn = true;
    }
    open[file] = !pawn;
  }
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    let value = VALUE[piece.kind] + placeValue(board, piece, index, piece.side === "r" ? blackKing : redKing, open);
    score += piece.side === "r" ? value : -value;
  }
  score += shelter(board, "r") - shelter(board, "b");
  return side === "r" ? score : -score;
}

function placeValue(board: Board, piece: Piece, index: number, enemyKing: number, open: boolean[]): number {
  const file = fileOf(index);
  const rank = rankOf(index);
  const forward = piece.side === "r" ? 9 - rank : rank;
  const center = 4 - Math.abs(file - 4);
  if (piece.kind === "H") return forward * 7 + center * 5;
  if (piece.kind === "C") return (file === 4 ? 32 : center * 3) + (forward >= 3 ? 10 : 0);
  if (piece.kind === "R") {
    let value = forward * 4 + center;
    if (open[file]) value += 22;
    if (enemyKing >= 0 && file === fileOf(enemyKing)) value += 14;
    return value;
  }
  if (piece.kind === "P") {
    let value = forward * 3;
    const crossed = piece.side === "r" ? rank <= 4 : rank >= 5;
    if (crossed) value += 70;
    if (enemyKing >= 0) value += (4 - Math.abs(file - fileOf(enemyKing))) * 5;
    return value;
  }
  if (piece.kind === "K") return file === 4 ? 10 : 0;
  if (piece.kind === "A" || piece.kind === "E") return forward === 0 ? 6 : 0;
  return 0;
}

function shelter(board: Board, side: Side): number {
  const king = findKing(board, side);
  if (king < 0) return -500;
  const file = fileOf(king);
  const rank = rankOf(king);
  let value = 0;
  for (const [df, dr] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const tf = file + df;
    const tr = rank + dr;
    if (tf < 0 || tf > 8 || tr < 0 || tr > 9) continue;
    const piece = board[at(tf, tr)];
    if (piece && piece.side === side && piece.kind === "A") value += 14;
  }
  return value;
}

function moveKey(move: Move): number {
  return move.from * 90 + move.to;
}

function orderMoves(board: Board, moves: Move[], side: Side, hash: number, ply: number): Move[] {
  const hit = tt[hash & TT_MASK];
  const killer = killers[ply] ?? [-1, -1];
  return moves.slice().sort((a, b) => scoreMove(board, b, side, hit, killer) - scoreMove(board, a, side, hit, killer));
}

function scoreMove(board: Board, move: Move, side: Side, hit: TTEntry | undefined, killer: number[]): number {
  if (hit && hit.from === move.from && hit.to === move.to) return 50_000;
  const key = moveKey(move);
  if (killer[0] === key) return 20_000;
  if (killer[1] === key) return 19_000;
  const target = board[move.to];
  if (target) return 10_000 + VALUE[target.kind] * 8 - VALUE[board[move.from]!.kind];
  return history[key];
}

function remember(move: Move, ply: number, depth: number, quiet: boolean) {
  const key = moveKey(move);
  if (quiet) history[key] += depth * depth;
  const slot = killers[ply];
  if (!slot || slot[0] === key) return;
  slot[1] = slot[0];
  slot[0] = key;
}

function store(hash: number, depth: number, score: number, flag: number, move: Move | null, ply: number) {
  const adjusted = score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score;
  const index = hash & TT_MASK;
  const prev = tt[index];
  if (prev && prev.key === hash && prev.depth > depth && flag !== EXACT) return;
  tt[index] = {
    key: hash,
    depth,
    score: adjusted,
    flag,
    from: move?.from ?? -1,
    to: move?.to ?? -1,
  };
}

function lookup(hash: number, depth: number, alpha: number, beta: number, ply: number): number | null {
  const hit = tt[hash & TT_MASK];
  if (!hit || hit.key !== hash || hit.depth < depth) return null;
  const score = hit.score > MATE_BOUND ? hit.score - ply : hit.score < -MATE_BOUND ? hit.score + ply : hit.score;
  if (hit.flag === EXACT) return score;
  if (hit.flag === LOWER && score >= beta) return score;
  if (hit.flag === UPPER && score <= alpha) return score;
  return null;
}

function search(
  board: Board,
  side: Side,
  hash: number,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  beam = 99,
  allowNull = true,
): number {
  if (timedOut()) return 0;
  if (findKing(board, side) < 0) return -MATE + ply;
  const check = inCheck(board, side);
  if (depth <= 0 && !check) return quiesce(board, side, hash, alpha, beta, ply, 2, -1);
  const cached = lookup(hash, depth, alpha, beta, ply);
  if (cached != null) return cached;
  if (allowNull && !check && depth >= 3 && ply > 0 && beta < MATE_BOUND) {
    const nullScore = -search(board, opponent(side), hash ^ ZSIDE, depth - 3, -beta, -beta + 1, ply + 1, beam, false);
    if (!aborted && nullScore >= beta) return nullScore;
  }
  const moves = legalMoves(board, side);
  if (moves.length === 0) return -MATE + ply;
  const ordered = orderMoves(board, moves, side, hash, ply);
  let best = -Infinity;
  let bestMove: Move | null = null;
  let flag = UPPER;
  const startAlpha = alpha;
  const limit = Math.min(ordered.length, beam);
  for (let i = 0; i < ordered.length; i += 1) {
    if (i >= limit && !board[ordered[i].to]) continue;
    const move = ordered[i];
    const captured = playMutable(board, move);
    const nextHash = hashAfter(hash, board, move, captured);
    let nextDepth = depth - 1;
    const quiet = !captured && !inCheck(board, opponent(side));
    if (quiet && i >= 4 && depth >= 3) nextDepth -= 1;
    const score = -search(board, opponent(side), nextHash, nextDepth, -beta, -alpha, ply + 1, beam, true);
    undoMutable(board, move, captured);
    if (aborted) return 0;
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = EXACT;
    }
    if (alpha >= beta) {
      remember(move, ply, depth, !captured);
      store(hash, depth, score, LOWER, move, ply);
      return score;
    }
  }
  if (bestMove && flag === EXACT && best <= startAlpha) flag = UPPER;
  store(hash, depth, best, flag, bestMove, ply);
  return best;
}

function quiesce(
  board: Board,
  side: Side,
  hash: number,
  alpha: number,
  beta: number,
  ply: number,
  left: number,
  hang = -1,
): number {
  if (timedOut()) return 0;
  if (findKing(board, side) < 0) return -MATE + ply;
  const stand = evaluate(board, side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (left <= 0 && hang < 0) return stand;
  const king = findKing(board, side);
  const moves = pseudoMoves(board, side);
  const captures: Move[] = [];
  for (const move of moves) if (board[move.to]) captures.push(move);
  captures.sort((a, b) => VALUE[board[b.to]!.kind] - VALUE[board[a.to]!.kind]);
  for (const move of captures) {
    if (left <= 0 && move.to !== hang) continue;
    const captured = playMutable(board, move);
    const kingNow = move.from === king ? move.to : king;
    const legal = !fastInCheckAt(board, side, kingNow);
    if (!legal) {
      if (move.from === 0 && move.to === 1) console.log("illegal recapture", side);
      undoMutable(board, move, captured);
      continue;
    }
    const score = -quiesce(board, opponent(side), hashAfter(hash, board, move, captured), -beta, -alpha, ply + 1, left - 1, move.to);
    undoMutable(board, move, captured);
    if (aborted) return 0;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return alpha;
}

function isMateMove(board: Board, move: Move, side: Side): boolean {
  const captured = playMutable(board, move);
  const next = opponent(side);
  const gone = findKing(board, next) < 0;
  const replies = gone ? [] : legalMoves(board, next);
  const mate = gone || (replies.length === 0 && inCheck(board, next));
  undoMutable(board, move, captured);
  return mate;
}

function sameBoard(a: Board, b: Board): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const pa = a[i];
    const pb = b[i];
    if (!pa && !pb) continue;
    if (!pa || !pb || pa.side !== pb.side || pa.kind !== pb.kind) return false;
  }
  return true;
}

function resetSearch(budget: number) {
  deadline = Date.now() + budget;
  aborted = false;
  nodes = 0;
  history.fill(0);
  for (const slot of killers) {
    slot[0] = -1;
    slot[1] = -1;
  }
  tt.fill(undefined);
}


function deepen(
  board: Board,
  side: Side,
  rootHash: number,
  ranked: { move: Move; score: number }[],
  until: number,
): { move: Move; score: number; depth: number } | null {
  const pool = ranked.slice(0, SELECT_ROOT).map((item) => item.move);
  if (pool.length === 0 || Date.now() > until) return null;
  let best = pool[0];
  let bestScore = -Infinity;
  let depthReached = MAX_DEPTH;
  for (let depth = MAX_DEPTH + 1; depth <= SELECT_DEPTH; depth += 1) {
    if (Date.now() > until) break;
    aborted = false;
    let iterBest = best;
    let iterScore = -Infinity;
    let completed = true;
    for (const move of pool) {
      if (Date.now() > until) {
        completed = false;
        break;
      }
      const captured = playMutable(board, move);
      const score = -search(
        board,
        opponent(side),
        hashAfter(rootHash, board, move, captured),
        depth - 1,
        -Infinity,
        Infinity,
        1,
        BEAM,
      );
      undoMutable(board, move, captured);
      if (aborted) {
        completed = false;
        break;
      }
      if (score > iterScore) {
        iterScore = score;
        iterBest = move;
      }
    }
    if (!completed) break;
    best = iterBest;
    bestScore = iterScore;
    depthReached = depth;
  }
  if (depthReached === MAX_DEPTH) return null;
  return { move: best, score: bestScore, depth: depthReached };
}

function label(board: Board, side: Side, move: Move, score: number, depth: number, checking: boolean): Decision {
  const captured = board[move.to];
  const replies = Math.max(1, depth - 1);
  const depthNote = depth >= 4
    ? `Đọc trước ${replies} nước ở các nước chính. `
    : `Đọc trước ${replies} nước đáp. `;
  if (checking) {
    return {
      from: move.from,
      to: move.to,
      kind: "escape",
      title: "Thoát chiếu",
      note: `${depthNote}Đang bị chiếu. Phải thoát trước — giống chặn nước thắng.`,
    };
  }
  if (score > MATE / 2) {
    return {
      from: move.from,
      to: move.to,
      kind: "press",
      title: "Ép chiếu",
      note: `${depthNote}Đòn này dẫn tới chiếu hết sau nước đáp. Đi tiếp, không giữ quân.`,
    };
  }
  if (captured) {
    return {
      from: move.from,
      to: move.to,
      kind: "capture",
      title: "Ăn quân",
      note: `${depthNote}Ăn ${pieceName(captured.kind)}. Quân này đáng hơn phần còn lại, và không bị ăn lại lỗ.`,
    };
  }
  return {
    from: move.from,
    to: move.to,
    kind: "pressure",
    title: "Áp lực",
    note: `${depthNote}Ép xe, pháo, mã về phía cung. Không đổi xe lấy tốt nếu chưa thấy chiếu hết.`,
  };
}

/**
 * Mate now, escape mate, then pressure. Full search sees two replies;
 * the best few moves are read two plies further.
 */
export function decide(source: Board, side: Side): Decision {
  const board = source.slice();
  const moves = legalMoves(board, side);
  if (moves.length === 0) {
    return { from: -1, to: -1, kind: "pressure", title: "Hết nước", note: "Không còn nước đi." };
  }

  const checking = inCheck(board, side);
  for (const move of moves) {
    if (isMateMove(board, move, side)) {
      return {
        from: move.from,
        to: move.to,
        kind: "mate",
        title: "Chiếu hết",
        note: "Còn một nước. Chiếu hết, không giữ quân.",
      };
    }
  }

  resetSearch(BUDGET_MS);
  const rootHash = hashBoard(board, side);
  let best = moves[0];
  let bestScore = -Infinity;
  let finishedDepth = 1;
  const opening = sameBoard(board, startBoard());

  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    if (depth > 1 && Date.now() > deadline) break;
    aborted = false;
    const ordered = orderMoves(board, moves, side, rootHash, 0);
    if (opening && depth === 1) {
      const book = side === "r" ? { from: at(7, 7), to: at(4, 7) } : { from: at(7, 2), to: at(4, 2) };
      const index = ordered.findIndex((move) => move.from === book.from && move.to === book.to);
      if (index > 0) {
        const [picked] = ordered.splice(index, 1);
        ordered.unshift(picked);
      }
    }
    let iterBest = best;
    let iterScore = -Infinity;
    let completed = true;
    const ranked: { move: Move; score: number }[] = [];
    for (const move of ordered) {
      if (depth > 1 && Date.now() > deadline) {
        completed = false;
        break;
      }
      const captured = playMutable(board, move);
      const score = -search(board, opponent(side), hashAfter(rootHash, board, move, captured), depth - 1, -Infinity, Infinity, 1);
      undoMutable(board, move, captured);
      if (aborted) {
        completed = false;
        break;
      }
      ranked.push({ move, score });
      if (score > iterScore) {
        iterScore = score;
        iterBest = move;
      }
    }
    if (completed) {
      best = iterBest;
      bestScore = iterScore;
      finishedDepth = depth;
      ranked.sort((a, b) => b.score - a.score);
      store(rootHash, depth, iterScore, EXACT, iterBest, 0);
      if (depth === MAX_DEPTH) {
        const extra = deepen(board, side, rootHash, ranked, deadline);
        if (extra) {
          best = extra.move;
          bestScore = extra.score;
          finishedDepth = extra.depth;
        }
      }
    } else {
      break;
    }
  }

  return label(board, side, best, bestScore, finishedDepth, checking);
}

export function playBot(source: Board, side: Side): { board: Board; decision: Decision } | null {
  const decision = decide(source, side);
  if (decision.from < 0) return null;
  const next = applyMove(
    { board: source, turn: side, moves: [], winner: 0, draw: false, gen: 0 },
    decision.from,
    decision.to,
  );
  return { board: next.board, decision };
}
