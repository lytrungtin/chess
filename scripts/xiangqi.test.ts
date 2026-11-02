import { decide } from "../src/lib/xiangqi/bot";
import {
  at,
  emptyGame,
  kingsFace,
  legalMoves,
  startBoard,
  type Board,
  type Piece,
} from "../src/lib/xiangqi/rules";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function put(board: Board, file: number, rank: number, piece: Piece | null) {
  board[at(file, rank)] = piece;
}

const start = startBoard();
const redMoves = legalMoves(start, "r");
const blackMoves = legalMoves(start.slice(), "b");
assert(redMoves.length === blackMoves.length, `symmetry ${redMoves.length} vs ${blackMoves.length}`);
console.log("opening moves", redMoves.length);

const horse = redMoves.filter((move) => move.from === at(1, 9));
assert(horse.length === 2, `horse should have 2 moves, got ${horse.length}`);
assert(!horse.some((move) => move.to === at(3, 8)), "horse leg blocked by elephant");

const cleared = startBoard();
for (let i = 0; i < cleared.length; i += 1) {
  const piece = cleared[i];
  if (piece && piece.kind !== "K") cleared[i] = null;
}
assert(kingsFace(cleared), "bare kings face");
assert(legalMoves(cleared, "r").every((move) => {
  const next = cleared.slice();
  next[move.to] = next[move.from];
  next[move.from] = null;
  return !kingsFace(next);
}), "cannot step off the file while facing");

const soldier = Array.from({ length: 90 }, () => null) as Board;
put(soldier, 3, 9, { side: "r", kind: "K" });
put(soldier, 5, 0, { side: "b", kind: "K" });
put(soldier, 0, 5, { side: "r", kind: "P" });
const before = legalMoves(soldier, "r").filter((move) => move.from === at(0, 5));
assert(before.length === 1 && before[0].to === at(0, 4), "soldier only advances before the river");
put(soldier, 0, 5, null);
put(soldier, 4, 4, { side: "r", kind: "P" });
const after = legalMoves(soldier, "r").filter((move) => move.from === at(4, 4));
assert(after.length === 3, `crossed soldier has 3 moves, got ${after.length}`);

const elephant = Array.from({ length: 90 }, () => null) as Board;
put(elephant, 3, 9, { side: "r", kind: "K" });
put(elephant, 5, 0, { side: "b", kind: "K" });
put(elephant, 2, 5, { side: "r", kind: "E" });
put(elephant, 4, 2, { side: "b", kind: "R" });
const eleMoves = legalMoves(elephant, "r").filter((move) => move.from === at(2, 5));
assert(eleMoves.length === 2, `elephant has 2 moves, got ${eleMoves.length}`);
assert(eleMoves.every((move) => move.to !== at(0, 3) && move.to !== at(4, 3)), "elephant stays home");

const mate = Array.from({ length: 90 }, () => null) as Board;
put(mate, 4, 0, { side: "b", kind: "K" });
put(mate, 4, 9, { side: "r", kind: "K" });
put(mate, 4, 2, { side: "r", kind: "P" });
put(mate, 4, 3, { side: "r", kind: "C" });
put(mate, 0, 0, { side: "r", kind: "R" });
assert(legalMoves(mate, "b").length === 0, "black is checkmated");
const decision = decide(mate, "r");
assert(decision.kind === "mate", `bot should mate, got ${decision.kind}`);

const hang = startBoard();
put(hang, 0, 7, { side: "b", kind: "R" });
const t0 = Date.now();
const take = decide(hang, "r");
const ms = Date.now() - t0;
console.log("hanging rook", take.title, take.from, take.to, `${ms}ms`);
assert(take.to === at(0, 7), `bot should take the hanging rook, went ${take.from}->${take.to}`);

const openT = Date.now();
const opening = decide(startBoard(), "r");
const openMs = Date.now() - openT;
console.log("opening decision", opening.title, opening.note, `${openMs}ms`);
assert(opening.from >= 0, "opening move exists");
assert(openMs < 6_500, `opening think too slow: ${openMs}ms`);
assert(/\d+ nước/.test(opening.note), `should say how far it read, got ${opening.note}`);
const opener = startBoard()[opening.from];
assert(opener && (opener.kind === "C" || opener.kind === "H"), "opening develops cannon or horse");
assert(opening.to !== at(1, 0) && opening.to !== at(7, 0), "does not give a cannon for a horse");

const two = Array.from({ length: 90 }, () => null) as Board;
put(two, 4, 0, { side: "b", kind: "K" });
put(two, 3, 9, { side: "r", kind: "K" });
put(two, 0, 4, { side: "r", kind: "R" });
put(two, 8, 2, { side: "r", kind: "R" });
const forced = decide(two, "r");
assert(forced.kind === "mate" || forced.kind === "press", `two-rook net should force, got ${forced.kind}`);

const game = emptyGame();
assert(legalMoves(game.board, "r").length === redMoves.length, "fresh game matches");
console.log("xiangqi ok");
