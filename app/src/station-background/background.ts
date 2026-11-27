// La station de cet ordinateur, en fond (#3630, épique #3629) : un process à elle, qui ne dépend pas de l'app. L'app qui
// s'ouvre la trouve et s'y rattache ; elle ne la lance que si aucune ne tourne, et ne l'arrête jamais en quittant. Ce
// module est ce que l'app et ce process partagent, sans Electron :
//
// - **Qui la tient** : la marque `app.pid` de son répertoire (workstation/station.ts, `prendreLaStation`), que l'hôte de fond
//   (host.ts) prend pour lui comme l'app la prenait. L'installeur de docs/installation-station.md prend la même : quel
//   que soit celui qui l'a lancée, une station qui tourne est rejointe, jamais doublée.
// - **Ce qu'elle fait** : `fond.json`, que l'hôte réécrit quand son état change — son pid, son état, la version vers
//   laquelle elle redémarre, et pourquoi elle a refusé de démarrer.
// - **Son appairage** : elle n'a plus de fenêtre à qui dire son code. Elle l'écrit dans `fond-appairage.json` ; l'app
//   ouverte le tape par le geste de la home (stations/stations.ts) et y écrit ce que GitHub a répondu, que la station
//   relit à son essai suivant.
// - **Ce qu'elle dit** va à son journal, `fond.log`, sous son répertoire.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holdingOfTheStation, type StateStationLocale } from "../workstation/station.ts";
import type { Pairing } from "../stations/stations.ts";

const STATE_OF_BACKGROUND = "fond.json";
const PAIRING = "fond-appairage.json";
export const LOG = "fond.log";
// Le point d'entrée de l'hôte, joué par `node`.
export const HOST = join(import.meta.dirname, "host.ts");

export type StateOfBackground = { pid: number; etat: StateStationLocale; redemarrage: string | null; motif: string | null };

const STATES: readonly string[] = ["demarree", "relancee", "tenue-ailleurs", "refusee", "arretee"];
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Écrit d'un coup : l'app ne lit jamais un fichier à moitié écrit.
function writeOfAHit(file: string, value: unknown): void {
  writeFileSync(`${file}.${process.pid}`, `${JSON.stringify(value)}\n`);
  renameSync(`${file}.${process.pid}`, file);
}

export function writeStateOfBackground(root: string, state: StateOfBackground): void {
  mkdirSync(root, { recursive: true });
  writeOfAHit(join(root, STATE_OF_BACKGROUND), state);
}

// Ce que l'hôte a écrit de lui, ou rien : absent, illisible ou mal formé, rien n'en est déduit.
export function readStateOfBackground(root: string): StateOfBackground | null {
  try {
    const readOne = JSON.parse(readFileSync(join(root, STATE_OF_BACKGROUND), "utf8")) as Partial<StateOfBackground>;
    if (typeof readOne.pid !== "number" || typeof readOne.etat !== "string" || !STATES.includes(readOne.etat)) return null;
    return { pid: readOne.pid, etat: readOne.etat as StateStationLocale, redemarrage: typeof readOne.redemarrage === "string" ? readOne.redemarrage : null, motif: typeof readOne.motif === "string" ? readOne.motif : null };
  } catch {
    return null;
  }
}

type OptionsLaunch = {
  // Le `node` qui joue l'hôte, et le point d'entrée de la station livrée avec l'app.
  node: string;
  embarque: string;
  racine: string;
  env: Record<string, string | undefined>;
};

// Lance l'hôte, détaché de l'app : il lui survit, sa sortie va à son journal. Un journal qui ne s'ouvre pas lève ; un
// `node` qui ne part pas est dit au journal, et l'attente de `rejoindreOuLancer` le constate.
export function launchTheBackground(options: OptionsLaunch): void {
  mkdirSync(options.racine, { recursive: true });
  const log = join(options.racine, LOG);
  const output = openSync(log, "a");
  try {
    const host = spawn(options.node, [HOST, options.racine, options.embarque], { detached: true, stdio: ["ignore", output, output], windowsHide: true, env: options.env });
    host.once("error", (error) => {
      try {
        writeFileSync(log, `brigade: this computer's background station could not be launched — ${error.message} (\`${options.node}\`)\n`, { flag: "a" });
      } catch {
        // Le journal ne s'écrit plus : l'attente dit que rien n'a démarré.
      }
    });
    host.unref();
  } finally {
    closeSync(output);
  }
}

export type Attachment = { rejointe: number } | { lancee: number } | { refus: string };

// La station de cet ordinateur, rejointe si elle tourne, lancée sinon. Lancée, elle est attendue jusqu'à ce qu'elle
// tienne son répertoire ; une qui refuse de démarrer, ou ne le tient pas à temps, est un refus, qui dit pourquoi.
export async function joinOrLaunch(options: { racine: string; lancer: () => void | Promise<void>; attenteMs?: number; pasMs?: number }): Promise<Attachment> {
  const { racine: root } = options;
  const already = holdingOfTheStation(root);
  if (already !== undefined) return { rejointe: already };
  const before = readStateOfBackground(root);
  try {
    await options.lancer();
  } catch (error) {
    return { refus: `the background station could not be launched — ${message(error)}` };
  }
  const end = Date.now() + (options.attenteMs ?? 30_000);
  for (;;) {
    const holding = holdingOfTheStation(root);
    const said = readStateOfBackground(root);
    if (said !== null && said.etat === "refusee" && (before === null || said.pid !== before.pid || before.etat !== "refusee")) return { refus: `the background station refused to start — ${said.motif ?? "no reason given"}` };
    if (holding !== undefined && (said === null || said.pid !== holding || said.etat !== "refusee")) return { lancee: holding };
    if (Date.now() >= end) return { refus: `the background station did not start within ${Math.round((options.attenteMs ?? 30_000) / 1000)} s — its log: ${join(root, LOG)}` };
    await new Promise((resolve) => setTimeout(resolve, options.pasMs ?? 200));
  }
}

type RequestRead = { code: string; rendu?: Pairing };

function readRequest(root: string): RequestRead | null {
  try {
    const readOne = JSON.parse(readFileSync(join(root, PAIRING), "utf8")) as { code?: unknown; rendu?: unknown };
    if (typeof readOne.code !== "string") return null;
    const rendered = readOne.rendu as Pairing | undefined;
    const valid = rendered !== undefined && typeof rendered === "object" && rendered !== null && (typeof (rendered as { appairee?: unknown }).appairee === "string" || typeof (rendered as { refus?: unknown }).refus === "string");
    return valid ? { code: readOne.code, rendu: rendered } : { code: readOne.code };
  } catch {
    return null;
  }
}

// Le côté de la station : le code qu'elle affiche, demandé à l'app. La réponse de l'app pour ce code est rendue (et la
// demande effacée) ; sans elle, la demande est posée, et la station réessaie plus tard.
export function askPairing(root: string, code: string): Pairing {
  const readEntry = readRequest(root);
  if (readEntry !== null && readEntry.code === code && readEntry.rendu !== undefined) {
    rmSync(join(root, PAIRING), { force: true });
    return readEntry.rendu;
  }
  if (readEntry === null || readEntry.code !== code) writeOfAHit(join(root, PAIRING), { code });
  return { refus: "the app has not typed its code yet — open the app on this computer" };
}

// Le côté de l'app : un code que la station attend, tapé par le geste de la home, et la réponse écrite pour elle. Une
// demande illisible, ou déjà répondue, attend la suivante.
export async function answerAtPairings(root: string, pair: (code: string) => Promise<Pairing>): Promise<void> {
  const readEntry = readRequest(root);
  if (readEntry === null || readEntry.rendu !== undefined) return;
  let rendered: Pairing;
  try {
    rendered = await pair(readEntry.code);
  } catch (error) {
    rendered = { refus: message(error) };
  }
  // La station a pu afficher un autre code entre-temps : la réponse ne vaut que pour le sien.
  if (readRequest(root)?.code === readEntry.code) writeOfAHit(join(root, PAIRING), { code: readEntry.code, rendu: rendered });
}
