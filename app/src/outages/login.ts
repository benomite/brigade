// Le login de la station de cet ordinateur, quand sa connexion Max est perdue : le binaire `claude`
// officiel, et lui seul — `claude auth login`, qui ouvre la page de connexion dans le navigateur.
// Rien d'autre ne parle à Anthropic. Un seul login à la fois : un second clic, pendant que le
// premier attend le chef, ne lance rien de plus. La station voit la connexion rétablie à sa
// relecture suivante, la publie, et la cuisine reprend seule.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RenderedOfOutage } from "./actions.ts";

// Ce que la station garde d'elle : son gist y est.
const FILE_LOCAL = "appairage.json";
// Le temps laissé au chef pour se connecter : au-delà, le login est arrêté, et un clic le relance.
const GUARD_MS = 15 * 60_000;

const ABSENT = "the login was not launched: Claude Code is not installed on this computer";
export const LAUNCHES = "the login page opens in your browser: once you are signed in, cooking resumes by itself within the minute";

// Le gist de la station tenue dans `racine`, ou null tant qu'elle n'en a pas.
export function gistLocal(root: string): string | null {
  try {
    const { gist } = JSON.parse(readFileSync(join(root, FILE_LOCAL), "utf8")) as { gist?: unknown };
    return typeof gist === "string" && gist !== "" ? gist : null;
  } catch {
    return null;
  }
}

export type OptionsLogin = {
  claude: string;
  env: Record<string, string | undefined>;
  // Ce que le login a donné, pour le terminal qui a lancé l'app.
  dire: (line: string) => void;
  // Le login fini, réussi ou non.
  apres?: () => void;
  gardeMs?: number;
};

export function holdLogin(options: OptionsLogin): () => Promise<RenderedOfOutage> {
  let inProgress = false;
  return () => {
    if (inProgress) return Promise.resolve({ fait: `a login is already open: ${LAUNCHES}` });
    return new Promise((resolve) => {
      const launches = spawn(options.claude, ["auth", "login"], { windowsHide: true, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      for (const flux of [launches.stdout, launches.stderr]) flux.on("data", (piece: Buffer) => void (output = `${output}${piece.toString()}`.slice(-4096)));
      const guard = setTimeout(() => launches.kill(), options.gardeMs ?? GUARD_MS);
      launches.once("spawn", () => {
        inProgress = true;
        resolve({ fait: LAUNCHES });
      });
      launches.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(guard);
        // `claude` absent n'est pas une panne : c'est l'écran de l'outil manquant qui le dit, et l'installe (#4059).
        if (error.code === "ENOENT") return resolve({ outilManquant: "claude", refus: ABSENT });
        resolve({ refus: `the login was not launched: Claude Code could not be started on this computer (${error.message})` });
      });
      launches.once("close", (code, signal) => {
        clearTimeout(guard);
        if (!inProgress) return;
        inProgress = false;
        const last = output.trim().split("\n").at(-1)?.trim() ?? "";
        options.dire(code === 0 ? "brigade: Max login done on this computer — its station sees it within the minute" : `brigade: Max login on this computer did not finish (${signal ?? `code ${code}`})${last === "" ? "" : ` — ${last}`}`);
        options.apres?.();
      });
    });
  };
}
