import {
  applyMove,
  fileOf,
  findKing,
  inCheck,
  legalMoves,
  opponent,
  pieceName,
  playMutable,
  rankOf,
  undoMutable,
  type Board,
  type Kind,
  type Move,
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

function evaluate(board: Board, side: Side): number {
  let score = 0;
  const redKing = findKing(board, "r");
  const blackKing = findKing(board, "b");
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    let value = VALUE[piece.kind];
    if (piece.kind === "P") {
      const crossed = piece.side === "r" ? rankOf(index) <= 4 : rankOf(index) >= 5;
      if (crossed) value += 80;
    }
    const enemy = piece.side === "r" ? blackKing : redKing;
    if (enemy >= 0 && (piece.kind === "R" || piece.kind === "C" || piece.kind === "H" || piece.kind === "P")) {
      const dist = Math.abs(fileOf(index) - fileOf(enemy)) + Math.abs(rankOf(index) - rankOf(enemy));
      value += Math.max(0, 12 - dist) * (piece.kind === "P" ? 2 : 6);
    }
    score += piece.side === "r" ? value : -value;
  }
  return side === "r" ? score : -score;
}

function orderMoves(board: Board, moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => {
    const av = board[a.to] ? VALUE[board[a.to]!.kind] + 1 : 0;
    const bv = board[b.to] ? VALUE[board[b.to]!.kind] + 1 : 0;
    return bv - av;
  });
}

function search(board: Board, side: Side, depth: number, alpha: number, beta: number, ply: number): number {
  if (findKing(board, side) < 0) return -MATE + ply;
  const check = inCheck(board, side);
  if (depth <= 0 && !check) return quiesce(board, side, alpha, beta, ply, 2);
  const moves = legalMoves(board, side);
  if (moves.length === 0) return -MATE + ply;
  let best = -Infinity;
  for (const move of orderMoves(board, moves)) {
    const captured = playMutable(board, move);
    const score = -search(board, opponent(side), depth - 1, -beta, -alpha, ply + 1);
    undoMutable(board, move, captured);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function quiesce(board: Board, side: Side, alpha: number, beta: number, ply: number, left: number): number {
  if (findKing(board, side) < 0) return -MATE + ply;
  const stand = evaluate(board, side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (left === 0) return stand;
  const captures = legalMoves(board, side).filter((move) => board[move.to]);
  for (const move of orderMoves(board, captures)) {
    const captured = playMutable(board, move);
    const score = -quiesce(board, opponent(side), -beta, -alpha, ply + 1, left - 1);
    undoMutable(board, move, captured);
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

/**
 * Same order as the caro bot: take mate, answer mate, then pressure
 * toward the enemy general — without giving up a heavy piece for nothing.
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

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of orderMoves(board, moves)) {
    const captured = playMutable(board, move);
    const score = -search(board, opponent(side), 1, -Infinity, Infinity, 1);
    undoMutable(board, move, captured);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  const captured = board[best.to];
  if (checking) {
    return {
      from: best.from,
      to: best.to,
      kind: "escape",
      title: "Thoát chiếu",
      note: "Đang bị chiếu. Phải thoát trước — giống chặn nước thắng.",
    };
  }
  if (bestScore > MATE / 2) {
    return {
      from: best.from,
      to: best.to,
      kind: "press",
      title: "Ép chiếu",
      note: "Đòn này dẫn tới chiếu hết. Đi tiếp, không đổi hướng.",
    };
  }
  if (captured) {
    return {
      from: best.from,
      to: best.to,
      kind: "capture",
      title: "Ăn quân",
      note: `Ăn ${pieceName(captured.kind)}. Quân này đang gần tướng hơn phần còn lại.`,
    };
  }
  return {
    from: best.from,
    to: best.to,
    kind: "pressure",
    title: "Áp lực",
    note: "Ép xe, pháo, mã về phía cung. Không đổi quân mạnh lấy tốt nếu chưa thấy chiếu hết.",
  };
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
