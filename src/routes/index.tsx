import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { CaroGame } from "@/components/caro-game";
import { XiangqiGame } from "@/components/xiangqi-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [which, setWhich] = useState<"caro" | "tuong">("tuong");
  return (
    <div>
      <div className="mx-auto flex w-full max-w-6xl gap-2 px-3 pt-4 sm:px-6">
        <button
          type="button"
          aria-pressed={which === "caro"}
          onClick={() => setWhich("caro")}
          className={clsx(
            "h-11 rounded-xl px-4 text-sm font-semibold",
            which === "caro" ? "bg-paper text-ink" : "bg-paper/10 text-paper",
          )}
        >
          Caro
        </button>
        <button
          type="button"
          aria-pressed={which === "tuong"}
          onClick={() => setWhich("tuong")}
          className={clsx(
            "h-11 rounded-xl px-4 text-sm font-semibold",
            which === "tuong" ? "bg-paper text-ink" : "bg-paper/10 text-paper",
          )}
        >
          Tướng
        </button>
      </div>
      {which === "caro" ? <CaroGame /> : <XiangqiGame />}
    </div>
  );
}
