export type Side = 1 | 2;

export const SIZE = 50;
export const WIN = 5;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export type Move = { index: number; side: Side };

export type Snapshot = {
  board: Uint8Array;
  turn: Side;
  moves: Move[];
  winner: 0 | Side;
  line: number[];
  draw: boolean;
  gen: number;
};

export function opponent(side: Side): Side {
  return side === 1 ? 2 : 1;
}

export function emptyGame(): Snapshot {
  return {
    board: new Uint8Array(SIZE * SIZE),
    turn: 1,
    moves: [],
    winner: 0,
    line: [],
    draw: false,
    gen: 0,
  };
}

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function colOf(index: number): number {
  return index % SIZE;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < SIZE && col < SIZE;
}

/** True when `index` is empty and placing `side` there makes five or more. */
export function createsWinAt(board: Uint8Array, index: number, side: Side): boolean {
  if (board[index] !== 0) return false;
  const row = rowOf(index);
  const col = colOf(index);
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (inBounds(r, c) && board[r * SIZE + c] === side) {
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= WIN) return true;
  }
  return false;
}

/** Every stone in a winning line through a stone that is already placed. */
export function winLine(board: Uint8Array, index: number, side: Side): number[] {
  if (board[index] !== side) return [];
  const row = rowOf(index);
  const col = colOf(index);
  const found = new Set<number>();
  for (const [dr, dc] of DIRS) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (inBounds(r, c) && board[r * SIZE + c] === side) {
        line.push(r * SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= WIN) {
      for (const cell of line) found.add(cell);
    }
  }
  return [...found];
}

export function playAt(state: Snapshot, index: number): Snapshot {
  if (state.winner || state.draw) return state;
  if (index < 0 || index >= SIZE * SIZE) return state;
  if (state.board[index] !== 0) return state;
  const side = state.turn;
  const board = new Uint8Array(state.board);
  board[index] = side;
  const line = winLine(board, index, side);
  const winner: 0 | Side = line.length >= WIN ? side : 0;
  const moves = [...state.moves, { index, side }];
  const draw = winner === 0 && moves.length === SIZE * SIZE;
  return {
    board,
    turn: opponent(side),
    moves,
    winner,
    line: winner ? line : [],
    draw,
    gen: state.gen,
  };
}

export function undoLast(state: Snapshot): Snapshot {
  if (state.moves.length === 0) return state;
  const moves = state.moves.slice(0, -1);
  const board = new Uint8Array(SIZE * SIZE);
  for (const move of moves) board[move.index] = move.side;
  const turn: Side = moves.length % 2 === 0 ? 1 : 2;
  return {
    board,
    turn,
    moves,
    winner: 0,
    line: [],
    draw: false,
    gen: state.gen + 1,
  };
}
