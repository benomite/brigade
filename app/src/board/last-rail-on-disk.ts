// The last rail read of each repository, kept on disk (#4624): a restart while GitHub's quota is spent has no rail in
// memory, and the budget pause (budget-github.ts) reads nothing until the hour GitHub resets. The project view then
// shows this one, with its read time, instead of no rail at all.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { BoardRead } from "./read.ts";

const fileOf = (directory: string, repository: string) => join(directory, `${repository.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);

export function holdTheLastRailsOnDisk(directory: string) {
  const loaded = new Map<string, BoardRead | undefined>();
  return {
    // The rail saved for this repository; nothing when none was, or when the file is not a rail.
    load(repository: string): BoardRead | undefined {
      if (!loaded.has(repository)) {
        try {
          const saved: unknown = JSON.parse(readFileSync(fileOf(directory, repository), "utf8"));
          loaded.set(repository, typeof saved === "object" && saved !== null && "lu" in saved && saved.lu === true && "luLe" in saved && "faits" in saved ? (saved as BoardRead) : undefined);
        } catch {
          loaded.set(repository, undefined);
        }
      }
      return loaded.get(repository);
    },
    // A failed write loses nothing the app needs: the rail is still in memory.
    save(readOne: BoardRead): void {
      loaded.set(readOne.depot, readOne);
      try {
        mkdirSync(directory, { recursive: true });
        const file = fileOf(directory, readOne.depot);
        writeFileSync(`${file}.tmp`, JSON.stringify(readOne));
        renameSync(`${file}.tmp`, file);
      } catch {}
    },
  };
}
