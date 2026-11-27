// The agents at work on a project of the new kitchen, for the Agents tab (#4569): read from GitHub alone — the board: a ticket
// `taken` has a cook, a ticket `in-pass` has the pass, since the label was put on. Nothing is launched on the station (#4683);
// no agent at work is an empty list, never an error.
import type { KitchenBoard } from "./board/kitchen-board.ts";

export type AgentAtWork = { agent: string; ticket: number | null; since: string | null; station: string | null };
export type AgentsAtWork = { agents: AgentAtWork[] };

type Options = {
  // The computer's station: its name — shown for a project that cooks here only.
  station: string;
  cooksHere: boolean;
  board: () => Promise<{ lu: true; faits: { kitchenBoard?: KitchenBoard } } | { lu: false; raison: string }>;
  now: () => number;
};

function ofTheBoard(board: KitchenBoard | undefined, station: string | null, now: number): AgentAtWork[] {
  const kinds = [["cooking", "cook"], ["pass", "pass"]] as const;
  return kinds.flatMap(([column, agent]) =>
    (board?.columns.find(({ key }) => key === column)?.cards ?? []).map((card) => ({ agent, ticket: card.ticket, since: card.durationMs === undefined ? null : new Date(now - card.durationMs).toISOString(), station })),
  );
}

export async function readTheAgents({ station, cooksHere, board, now }: Options): Promise<AgentsAtWork> {
  const read = await board();
  if (!read.lu) throw new Error(read.raison);
  return { agents: ofTheBoard(read.faits.kitchenBoard, cooksHere ? station : null, now()) };
}
