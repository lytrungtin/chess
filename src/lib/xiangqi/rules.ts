export type Side = "r" | "b";
export type Kind = "K" | "A" | "E" | "H" | "R" | "C" | "P";
export type Piece = { side: Side; kind: Kind };
export type Board = (Piece | null)[];
export type Move = { from: number; to: number };

export const FILES = 9;
export const RANKS = 10;

const HORSE: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 2, 0, 1],
  [-1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [-2, 1, -1, 0],
  [2, -1, 1, 0],
  [-2, -1, -1, 0],
];

const ELE: ReadonlyArray<readonly [number, number, number, number]> = [
  [2, 2, 1, 1],
  [2, -2, 1, -1],
  [-2, 2, -1, 1],
  [-2, -2, -1, -1],
];

const ORTH: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function opponent(side: Side): Side {
  return side === "r" ? "b" : "r";
}

export function fileOf(index: number): number {
  return index % FILES;
}

export function rankOf(index: number): number {
  return Math.floor(index / FILES);
}

export function at(file: number, rank: number): number {
  return rank * FILES + file;
}

export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < FILES && rank >= 0 && rank < RANKS;
}

function inPalace(side: Side, file: number, rank: number): boolean {
  if (file < 3 || file > 5) return false;
  return side === "r" ? rank >= 7 && rank <= 9 : rank >= 0 && rank <= 2;
}

function ownSide(side: Side, rank: number): boolean {
  return side === "r" ? rank >= 5 : rank <= 4;
}

export function pieceName(kind: Kind): string {
  if (kind === "K") return "tướng";
  if (kind === "A") return "sĩ";
  if (kind === "E") return "tượng";
  if (kind === "H") return "mã";
  if (kind === "R") return "xe";
  if (kind === "C") return "pháo";
  return "tốt";
}

export function pieceChar(piece: Piece): string {
  const red: Record<Kind, string> = { K: "帥", A: "仕", E: "相", H: "傌", R: "俥", C: "炮", P: "兵" };
  const black: Record<Kind, string> = { K: "將", A: "士", E: "象", H: "馬", R: "車", C: "砲", P: "卒" };
  return piece.side === "r" ? red[piece.kind] : black[piece.kind];
}

export function startBoard(): Board {
  const board: Board = Array.from({ length: FILES * RANKS }, () => null);
  const back: Kind[] = ["R", "H", "E", "A", "K", "A", "E", "H", "R"];
  for (let file = 0; file < FILES; file += 1) {
    board[at(file, 0)] = { side: "b", kind: back[file] };
    board[at(file, 9)] = { side: "r", kind: back[file] };
  }
  board[at(1, 2)] = { side: "b", kind: "C" };
  board[at(7, 2)] = { side: "b", kind: "C" };
  board[at(1, 7)] = { side: "r", kind: "C" };
  board[at(7, 7)] = { side: "r", kind: "C" };
  for (const file of [0, 2, 4, 6, 8]) {
    board[at(file, 3)] = { side: "b", kind: "P" };
    board[at(file, 6)] = { side: "r", kind: "P" };
  }
  return board;
}

export function findKing(board: Board, side: Side): number {
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (piece && piece.side === side && piece.kind === "K") return i;
  }
  return -1;
}

export function kingsFace(board: Board): boolean {
  const red = findKing(board, "r");
  const black = findKing(board, "b");
  if (red < 0 || black < 0) return false;
  if (fileOf(red) !== fileOf(black)) return false;
  const file = fileOf(red);
  const from = Math.min(rankOf(red), rankOf(black)) + 1;
  const to = Math.max(rankOf(red), rankOf(black));
  for (let rank = from; rank < to; rank += 1) {
    if (board[at(file, rank)]) return false;
  }
  return true;
}

function slideHits(board: Board, from: number, to: number, cannon: boolean): boolean {
  const df = Math.sign(fileOf(to) - fileOf(from));
  const dr = Math.sign(rankOf(to) - rankOf(from));
  if (df !== 0 && dr !== 0) return false;
  if (df === 0 && dr === 0) return false;
  let file = fileOf(from) + df;
  let rank = rankOf(from) + dr;
  let screens = 0;
  while (onBoard(file, rank) && at(file, rank) !== to) {
    if (board[at(file, rank)]) screens += 1;
    file += df;
    rank += dr;
  }
  if (!onBoard(file, rank)) return false;
  return cannon ? screens === 1 : screens === 0;
}

export function attacks(board: Board, from: number, to: number): boolean {
  const piece = board[from];
  if (!piece || from === to) return false;
  const tf = fileOf(to);
  const tr = rankOf(to);
  const ff = fileOf(from);
  const fr = rankOf(from);
  const target = board[to];
  if (target && target.side === piece.side) return false;

  if (piece.kind === "R") return slideHits(board, from, to, false);
  if (piece.kind === "C") return target ? slideHits(board, from, to, true) : slideHits(board, from, to, false);
  if (piece.kind === "H") {
    for (const [df, dr, lf, lr] of HORSE) {
      if (ff + df === tf && fr + dr === tr) {
        const legF = ff + lf;
        const legR = fr + lr;
        return onBoard(legF, legR) && !board[at(legF, legR)];
      }
    }
    return false;
  }
  if (piece.kind === "E") {
    if (!ownSide(piece.side, tr)) return false;
    for (const [df, dr, ef, er] of ELE) {
      if (ff + df === tf && fr + dr === tr) {
        return !board[at(ff + ef, fr + er)];
      }
    }
    return false;
  }
  if (piece.kind === "A") {
    if (!inPalace(piece.side, tf, tr)) return false;
    return Math.abs(tf - ff) === 1 && Math.abs(tr - fr) === 1;
  }
  if (piece.kind === "K") {
    if (!inPalace(piece.side, tf, tr)) return false;
    return Math.abs(tf - ff) + Math.abs(tr - fr) === 1;
  }
  if (piece.side === "r") {
    if (tf === ff && tr === fr - 1) return true;
    return fr <= 4 && tr === fr && Math.abs(tf - ff) === 1;
  }
  if (tf === ff && tr === fr + 1) return true;
  return fr >= 5 && tr === fr && Math.abs(tf - ff) === 1;
}

export function isAttacked(board: Board, square: number, by: Side): boolean {
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (piece && piece.side === by && attacks(board, i, square)) return true;
  }
  return false;
}

/**
 * King safety without scanning every piece. Advisors and elephants can never
 * reach the enemy palace, so only rook, cannon, horse, pawn and the flying
 * general matter.
 */
export function fastInCheckAt(board: Board, side: Side, king: number): boolean {
  const kf = fileOf(king);
  const kr = rankOf(king);
  const enemy = opponent(side);

  for (const [df, dr] of ORTH) {
    let file = kf + df;
    let rank = kr + dr;
    let seen = false;
    while (onBoard(file, rank)) {
      const piece = board[at(file, rank)];
      if (piece) {
        if (!seen) {
          if (piece.side === enemy && piece.kind === "R") return true;
          if (piece.side === enemy && piece.kind === "K" && df === 0) return true;
          seen = true;
        } else if (piece.side === enemy && piece.kind === "C") {
          return true;
        } else {
          break;
        }
      }
      file += df;
      rank += dr;
    }
  }

  for (const [df, dr, lf, lr] of HORSE) {
    const hf = kf - df;
    const hr = kr - dr;
    if (!onBoard(hf, hr)) continue;
    const piece = board[at(hf, hr)];
    if (!piece || piece.side !== enemy || piece.kind !== "H") continue;
    const legF = hf + lf;
    const legR = hr + lr;
    if (onBoard(legF, legR) && !board[at(legF, legR)]) return true;
  }

  if (enemy === "b") {
    if (kr > 0) {
      const pawn = board[at(kf, kr - 1)];
      if (pawn && pawn.side === "b" && pawn.kind === "P") return true;
    }
    if (kr >= 5) {
      if (kf > 0) {
        const pawn = board[at(kf - 1, kr)];
        if (pawn && pawn.side === "b" && pawn.kind === "P") return true;
      }
      if (kf < 8) {
        const pawn = board[at(kf + 1, kr)];
        if (pawn && pawn.side === "b" && pawn.kind === "P") return true;
      }
    }
  } else {
    if (kr < 9) {
      const pawn = board[at(kf, kr + 1)];
      if (pawn && pawn.side === "r" && pawn.kind === "P") return true;
    }
    if (kr <= 4) {
      if (kf > 0) {
        const pawn = board[at(kf - 1, kr)];
        if (pawn && pawn.side === "r" && pawn.kind === "P") return true;
      }
      if (kf < 8) {
        const pawn = board[at(kf + 1, kr)];
        if (pawn && pawn.side === "r" && pawn.kind === "P") return true;
      }
    }
  }
  return false;
}

export function fastInCheck(board: Board, side: Side): boolean {
  const king = findKing(board, side);
  if (king < 0) return true;
  return fastInCheckAt(board, side, king);
}

export function inCheck(board: Board, side: Side): boolean {
  return fastInCheck(board, side);
}

function pushMove(board: Board, side: Side, from: number, file: number, rank: number, out: Move[]) {
  if (!onBoard(file, rank)) return;
  const to = at(file, rank);
  const target = board[to];
  if (target && target.side === side) return;
  out.push({ from, to });
}

export function pseudoMoves(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < board.length; from += 1) {
    const piece = board[from];
    if (!piece || piece.side !== side) continue;
    const file = fileOf(from);
    const rank = rankOf(from);
    if (piece.kind === "R" || piece.kind === "C") {
      for (const [df, dr] of ORTH) {
        let f = file + df;
        let r = rank + dr;
        while (onBoard(f, r) && !board[at(f, r)]) {
          out.push({ from, to: at(f, r) });
          f += df;
          r += dr;
        }
        if (!onBoard(f, r)) continue;
        if (piece.kind === "R") {
          if (board[at(f, r)]!.side !== side) out.push({ from, to: at(f, r) });
          continue;
        }
        f += df;
        r += dr;
        while (onBoard(f, r) && !board[at(f, r)]) {
          f += df;
          r += dr;
        }
        if (onBoard(f, r) && board[at(f, r)]!.side !== side) out.push({ from, to: at(f, r) });
      }
      continue;
    }
    if (piece.kind === "H") {
      for (const [df, dr, lf, lr] of HORSE) {
        const legF = file + lf;
        const legR = rank + lr;
        if (!onBoard(legF, legR) || board[at(legF, legR)]) continue;
        pushMove(board, side, from, file + df, rank + dr, out);
      }
      continue;
    }
    if (piece.kind === "E") {
      for (const [df, dr, ef, er] of ELE) {
        const eyeF = file + ef;
        const eyeR = rank + er;
        const tf = file + df;
        const tr = rank + dr;
        if (!onBoard(tf, tr) || !ownSide(side, tr)) continue;
        if (board[at(eyeF, eyeR)]) continue;
        pushMove(board, side, from, tf, tr, out);
      }
      continue;
    }
    if (piece.kind === "A") {
      for (const [df, dr] of DIAG) {
        const tf = file + df;
        const tr = rank + dr;
        if (!inPalace(side, tf, tr)) continue;
        pushMove(board, side, from, tf, tr, out);
      }
      continue;
    }
    if (piece.kind === "K") {
      for (const [df, dr] of ORTH) {
        const tf = file + df;
        const tr = rank + dr;
        if (!inPalace(side, tf, tr)) continue;
        pushMove(board, side, from, tf, tr, out);
      }
      continue;
    }
    const forward = side === "r" ? -1 : 1;
    pushMove(board, side, from, file, rank + forward, out);
    const crossed = side === "r" ? rank <= 4 : rank >= 5;
    if (crossed) {
      pushMove(board, side, from, file - 1, rank, out);
      pushMove(board, side, from, file + 1, rank, out);
    }
  }
  return out;
}

export function playMutable(board: Board, move: Move): Piece | null {
  const captured = board[move.to];
  board[move.to] = board[move.from];
  board[move.from] = null;
  return captured;
}

export function undoMutable(board: Board, move: Move, captured: Piece | null) {
  board[move.from] = board[move.to];
  board[move.to] = captured;
}

export function legalMoves(board: Board, side: Side): Move[] {
  const king = findKing(board, side);
  if (king < 0) return [];
  const pseudo = pseudoMoves(board, side);
  const out: Move[] = [];
  for (const move of pseudo) {
    const captured = playMutable(board, move);
    const kingNow = move.from === king ? move.to : king;
    const ok = !fastInCheckAt(board, side, kingNow);
    undoMutable(board, move, captured);
    if (ok) out.push(move);
  }
  return out;
}

export type RecordedMove = Move & { captured: Piece | null; side: Side };

export type Snapshot = {
  board: Board;
  turn: Side;
  moves: RecordedMove[];
  winner: 0 | Side;
  draw: boolean;
  gen: number;
};

export function emptyGame(): Snapshot {
  return {
    board: startBoard(),
    turn: "r",
    moves: [],
    winner: 0,
    draw: false,
    gen: 0,
  };
}

export function positionKey(board: Board, turn: Side): string {
  let text = turn;
  for (const piece of board) text += piece ? piece.side + piece.kind : ".";
  return text;
}

function repetition(moves: RecordedMove[], board: Board, turn: Side): boolean {
  const key = positionKey(board, turn);
  let count = 1;
  const scratch = board.map((piece) => piece);
  let side: Side = turn;
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    const move = moves[i];
    undoMutable(scratch, move, move.captured);
    side = move.side;
    if (positionKey(scratch, side) === key) count += 1;
    if (count >= 3) return true;
  }
  return false;
}

export function applyMove(state: Snapshot, from: number, to: number): Snapshot {
  if (state.winner || state.draw) return state;
  const legal = legalMoves(state.board, state.turn);
  if (!legal.some((move) => move.from === from && move.to === to)) return state;
  const board = state.board.slice();
  const captured = playMutable(board, { from, to });
  const side = state.turn;
  const next = opponent(side);
  const moves = [...state.moves, { from, to, captured, side }];
  const enemyKing = findKing(board, next);
  const replies = enemyKing < 0 ? [] : legalMoves(board, next);
  const mate = enemyKing < 0 || (replies.length === 0 && inCheck(board, next));
  const stall = replies.length === 0 && !mate;
  const draw = !mate && !stall && repetition(moves, board, next);
  return {
    board,
    turn: next,
    moves,
    winner: mate || stall ? side : 0,
    draw,
    gen: state.gen,
  };
}

export function undoLast(state: Snapshot): Snapshot {
  if (state.moves.length === 0) return state;
  const moves = state.moves.slice(0, -1);
  const board = startBoard();
  for (const move of moves) playMutable(board, move);
  return {
    board,
    turn: moves.length % 2 === 0 ? "r" : "b",
    moves,
    winner: 0,
    draw: false,
    gen: state.gen + 1,
  };
}
