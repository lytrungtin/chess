import { decide } from "../src/lib/caro/bot";
import { SIZE, createsWinAt, emptyGame, playAt, type Side } from "../src/lib/caro/rules";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function cell(row: number, col: number) {
  return row * SIZE + col;
}

function place(rows: Array<[number, number, Side]>) {
  const board = new Uint8Array(SIZE * SIZE);
  for (const [r, c, side] of rows) board[cell(r, c)] = side;
  return board;
}

const mid = Math.floor(SIZE / 2);
const center = cell(mid, mid);
const opening = decide(new Uint8Array(SIZE * SIZE), 1);
assert(opening.index === center, `opening should be center, got ${opening.index}`);
assert(opening.kind === "pressure", "opening is pressure");

const gap = place([
  [0, 0, 1],
  [0, 1, 1],
  [0, 3, 1],
  [0, 4, 1],
]);
assert(createsWinAt(gap, cell(0, 2), 1), "gap is a win");
const blockGap = decide(gap, 2);
assert(blockGap.index === cell(0, 2) && blockGap.kind === "block", "must block the gap");
const takeGap = decide(gap, 1);
assert(takeGap.index === cell(0, 2) && takeGap.kind === "win", "must take the gap");

const race = place([
  [0, 0, 1],
  [0, 1, 1],
  [0, 2, 1],
  [0, 3, 1],
  [1, 0, 2],
  [1, 1, 2],
  [1, 2, 2],
  [1, 3, 2],
]);
const oWins = decide(race, 2);
assert(oWins.index === cell(1, 4) && oWins.kind === "win", "O takes its own five, not the block");
const xWins = decide(race, 1);
assert(xWins.index === cell(0, 4) && xWins.kind === "win", "X takes its own five");

const forkBoard = place([
  [7, 5, 1],
  [7, 6, 1],
  [5, 7, 1],
  [6, 7, 1],
]);
const fork = decide(forkBoard, 1);
assert(fork.index === cell(7, 7), `fork square, got ${fork.index} ${fork.kind}`);
assert(fork.kind === "fork", `expected fork, got ${fork.kind}`);
const deny = decide(forkBoard, 2);
assert(deny.index === cell(7, 7) && deny.kind === "block-fork", `deny fork, got ${deny.index} ${deny.kind}`);

const beside = place([[7, 7, 1]]);
const reply = decide(beside, 2);
const rr = Math.floor(reply.index / SIZE);
const cc = reply.index % SIZE;
assert(Math.max(Math.abs(rr - 7), Math.abs(cc - 7)) <= 2, "pressure stays near the stone");

let game = emptyGame();
for (let n = 0; n < SIZE * SIZE && !game.winner && !game.draw; n += 1) {
  const choice = decide(game.board, game.turn);
  const wins = [];
  for (let i = 0; i < game.board.length; i += 1) {
    if (createsWinAt(game.board, i, game.turn)) wins.push(i);
  }
  if (wins.length > 0) assert(wins.includes(choice.index), "missed an immediate win");
  const nextSide = game.turn === 1 ? 2 : 1;
  if (wins.length === 0) {
    const blocks = [];
    for (let i = 0; i < game.board.length; i += 1) {
      if (createsWinAt(game.board, i, nextSide)) blocks.push(i);
    }
    if (blocks.length > 0) assert(blocks.includes(choice.index), "missed a block");
  }
  assert(choice.index >= 0 && game.board[choice.index] === 0, "illegal cell");
  const next = playAt(game, choice.index);
  assert(next !== game, "move rejected");
  game = next;
}
assert(game.winner !== 0 || game.draw, "self-play should finish");

console.log("caro bot ok", { moves: game.moves.length, winner: game.winner, draw: game.draw });
