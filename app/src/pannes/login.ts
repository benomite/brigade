// Le login de la station de cet ordinateur, quand sa connexion Max est perdue : le binaire `claude`
// officiel, et lui seul — `claude auth login`, qui ouvre la page de connexion dans le navigateur.
// Rien d'autre ne parle à Anthropic. Un seul login à la fois : un second clic, pendant que le
// premier attend le chef, ne lance rien de plus. La station voit la connexion rétablie à sa
// relecture suivante (runtime/src/max-connection/watch.ts), la publie, et la cuisine reprend seule.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RenduDePanne } from "./gestes.ts";

// Ce que la station garde d'elle (runtime/src/pairing/presence.ts) : son gist y est.
const FICHIER_LOCAL = "appairage.json";
// Le temps laissé au chef pour se connecter : au-delà, le login est arrêté, et un clic le relance.
const GARDE_MS = 15 * 60_000;

export const LANCE = "the login page opens in your browser: once you are signed in, cooking resumes by itself within the minute";

// Le gist de la station tenue dans `racine`, ou null tant qu'elle n'en a pas.
export function gistLocal(racine: string): string | null {
  try {
    const { gist } = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist?: unknown };
    return typeof gist === "string" && gist !== "" ? gist : null;
  } catch {
    return null;
  }
}

export type OptionsLogin = {
  claude: string;
  env: Record<string, string | undefined>;
  // Ce que le login a donné, pour le terminal qui a lancé l'app.
  dire: (ligne: string) => void;
  // Le login fini, réussi ou non.
  apres?: () => void;
  gardeMs?: number;
};

export function tenirLogin(options: OptionsLogin): () => Promise<RenduDePanne> {
  let enCours = false;
  return () => {
    if (enCours) return Promise.resolve({ fait: `a login is already open: ${LANCE}` });
    return new Promise((resoudre) => {
      const lance = spawn(options.claude, ["auth", "login"], { env: options.env, stdio: ["ignore", "pipe", "pipe"] });
      let sortie = "";
      for (const flux of [lance.stdout, lance.stderr]) flux.on("data", (morceau: Buffer) => void (sortie = `${sortie}${morceau.toString()}`.slice(-4096)));
      const garde = setTimeout(() => lance.kill(), options.gardeMs ?? GARDE_MS);
      lance.once("spawn", () => {
        enCours = true;
        resoudre({ fait: LANCE });
      });
      lance.once("error", (erreur) => {
        clearTimeout(garde);
        resoudre({ refus: `the login was not launched: Claude Code could not be started on this computer (${erreur.message})` });
      });
      lance.once("close", (code, signal) => {
        clearTimeout(garde);
        if (!enCours) return;
        enCours = false;
        const derniere = sortie.trim().split("\n").at(-1)?.trim() ?? "";
        options.dire(code === 0 ? "brigade: Max login done on this computer — its station sees it within the minute" : `brigade: Max login on this computer did not finish (${signal ?? `code ${code}`})${derniere === "" ? "" : ` — ${derniere}`}`);
        options.apres?.();
      });
    });
  };
}
