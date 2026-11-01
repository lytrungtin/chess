import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-paper">
      <h1 className="font-display text-4xl">Cờ</h1>
    </main>
  );
}
