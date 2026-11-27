// The agents at work on a project of the new kitchen, for the Agents tab (#4569): read from what already exists, with nothing
// asked of the old runtime — GitHub (the board: a ticket `taken` has a cook, a ticket `in-pass` has the pass, since the label was
// put on) and what the kitchen writes on its station (the `agents` command reads its run files: the manager and the supervisor
// at work, and the runs the board does not show yet). A station that cannot be read is said in one sentence beside the agents
// GitHub gave; no agent at work is an empty list, never an error.
import type { Read, Rendered } from "./box.ts";
import type { KitchenBoard } from "./board/kitchen-board.ts";
import { withoutTheCommand } from "./box.ts";

const COMMAND = "agents";

export type AgentAtWork = { agent: string; ticket: number | null; since: string | null; station: string | null };
export type AgentsAtWork = { agents: AgentAtWork[]; stations: { station: string; why: string }[] };

type Options = {
  // The computer's station: its name, and where the project's kitchen is read — `undefined` for a project that does not cook here.
  station: string;
  readOne: Read | undefined;
  launch: (readOne: Read, command: string) => Promise<Rendered>;
  board: () => Promise<{ lu: true; faits: { kitchenBoard?: KitchenBoard } } | { lu: false; raison: string }>;
  now: () => number;
};

// What the station's `agents` says is working, one entry per agent kind and ticket.
function atWorkOnTheStation(output: string): { agent: string; ticket: number | null }[] {
  let list: unknown;
  try {
    list = JSON.parse(output);
  } catch {
    throw new Error("its answer could not be read");
  }
  if (!Array.isArray(list)) throw new Error("its answer is not a list");
  return list.flatMap((one: { id?: unknown; state?: unknown; workingOn?: unknown } | null) =>
    typeof one?.id === "string" && one.state === "working" ? [{ agent: one.id, ticket: typeof one.workingOn === "number" ? one.workingOn : null }] : [],
  );
}

function ofTheBoard(board: KitchenBoard | undefined, station: string | null, now: number): AgentAtWork[] {
  const kinds = [["cooking", "cook"], ["pass", "pass"]] as const;
  return kinds.flatMap(([column, agent]) =>
    (board?.columns.find(({ key }) => key === column)?.cards ?? []).map((card) => ({ agent, ticket: card.ticket, since: card.durationMs === undefined ? null : new Date(now - card.durationMs).toISOString(), station })),
  );
}

export async function readTheAgents({ station, readOne, launch, board, now }: Options): Promise<AgentsAtWork> {
  const read = await board();
  if (!read.lu) throw new Error(read.raison);
  const here = readOne === undefined ? null : station;
  const agents = ofTheBoard(read.faits.kitchenBoard, here, now());
  const stations: AgentsAtWork["stations"] = [];
  if (readOne !== undefined) {
    const rendered = await launch(readOne, COMMAND).catch((error: unknown) => error as Error);
    try {
      if (rendered instanceof Error) throw rendered;
      if (withoutTheCommand(rendered)) throw new Error("its runtime does not serve the agents yet");
      if (rendered.erreur !== null) throw new Error(rendered.erreurs.trim().split("\n")[0]?.slice(0, 200) || "the command failed");
      for (const one of atWorkOnTheStation(rendered.sortie)) {
        if (!agents.some(({ agent, ticket }) => agent === one.agent && ticket === one.ticket)) agents.push({ ...one, since: null, station });
      }
    } catch (error) {
      stations.push({ station, why: `${station} could not be read: ${(error as Error).message.replace(/[.\s]+$/, "")}.` });
    }
  }
  return { agents, stations };
}
