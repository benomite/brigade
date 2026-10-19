// Le geste d'une station distante, lancé sur la box par la station elle-même :
//   ssh <hote> brigade <projet> pull <station> announce [--sandbox <json>]
//   ssh <hote> brigade <projet> pull <station> claim [--sandbox <json>]
//   ssh <hote> brigade <projet> pull <station> renew <run> --proof <empreinte> --turns <n> --tokens <n>
//   ssh <hote> brigade <projet> pull <station> return <run> --end livre|echec [--reason <motif>] --turns <n> --tokens <n>
// Les anciens mots (`tirer`, `annoncer`, `reclamer`, `renouveler`, `rendre`,
// `--preuve`, `--tours`, `--jetons`, `--fin`, `--raison`) répondent encore, en
// disant le nouveau (`commandes.ts`) : une station d'avant les noms anglais
// continue de tirer son travail.
// C'est la seule direction : la station joint la box, jamais l'inverse. Le
// geste n'ouvre aucune connexion — il écrit la demande au journal du projet et
// y lit la réponse du runtime (`tirer.ts`).
//
// `--sandbox` : ce que la station dit du bac à sable de son poste, l'objet JSON
// que rend sa sonde (`sandbox/probe.ts`) — c'est d'après lui que la box
// lui prête un ticket ordinaire, ou non.
//
// Fait pour un programme (le runner de la station) : la réponse est un objet
// JSON, sur une ligne de la sortie standard. Codes de sortie : 0, la demande
// est servie ; 1, elle est refusée — la réponse dit pourquoi, et `stop` si le
// cook est à arrêter ; 2, le geste est mal écrit ; 3, la box n'a pas répondu.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import type { BacASableDeLaStation, Demande } from "./events/remote.ts";
import { demander, SansReponse, type OptionsDeDemande } from "./tirer.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run pull -- <station> announce [--sandbox <json>]",
  "        … pull -- <station> claim [--sandbox <json>]",
  "        … pull -- <station> renew <run> --proof <worktree fingerprint> --turns <n> --tokens <n>",
  "        … pull -- <station> return <run> --end livre|echec [--reason <reason>] --turns <n> --tokens <n>   (the cook's last message on standard input)",
].join("\n");

export const SERVIE = 0;
export const REFUSEE = 1;
export const MAL_ECRIT = 2;
export const SANS_REPONSE = 3;

const FINS: Record<string, "delivered" | "failed"> = { livre: "delivered", echec: "failed" };
const OPTIONS = ["--proof", "--turns", "--tokens", "--end", "--reason", "--sandbox"];

// `entree` : ce que le geste reçoit sur son entrée standard. `options` : ce
// qu'un test règle de l'attente.
export async function principal({ args: tapes, env, dire, redire }: Appel, entree: () => Promise<string> = async () => "", options: OptionsDeDemande = {}): Promise<void> {
  const args = enAnglais("pull", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(MAL_ECRIT, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [station, geste, ...suite] = args;
  if (!station || !geste) echouer(MAL_ECRIT, USAGE);

  // Ce qui suit le geste : le run, puis des options à valeur.
  const lues = new Map<string, string>();
  const nus: string[] = [];
  for (let i = 0; i < suite.length; i++) {
    const mot = suite[i] ?? "";
    if (!mot.startsWith("--")) nus.push(mot);
    else if (!OPTIONS.includes(mot) || lues.has(mot) || i + 1 >= suite.length) echouer(MAL_ECRIT, USAGE);
    else lues.set(mot, suite[++i] ?? "");
  }
  const entier = (option: string): number => {
    const brut = lues.get(option);
    if (brut === undefined || !/^[0-9]+$/.test(brut) || !Number.isSafeInteger(Number(brut))) echouer(MAL_ECRIT, `${option}: an integer is needed, what the cook has consumed so far\n${USAGE}`);
    return Number(brut);
  };
  const seules = (...permises: string[]) => {
    if ([...lues.keys()].some((option) => !permises.includes(option))) echouer(MAL_ECRIT, USAGE);
  };
  const run = (): string => {
    if (nus.length !== 1 || !nus[0]) echouer(MAL_ECRIT, USAGE);
    return nus[0];
  };

  let demande: Demande;
  switch (geste) {
    case "announce":
    case "claim": {
      seules("--sandbox");
      if (nus.length > 0) echouer(MAL_ECRIT, USAGE);
      const dit = lues.get("--sandbox");
      if (dit === undefined) {
        demande = { verb: geste };
        break;
      }
      // La box juge ce qu'il dit ; ici, seulement qu'il se lit.
      let sandbox: unknown;
      try {
        sandbox = JSON.parse(dit);
      } catch {
        echouer(MAL_ECRIT, `--sandbox: a JSON object, what the workstation's sandbox probe returns\n${USAGE}`);
      }
      if (sandbox === null || typeof sandbox !== "object" || Array.isArray(sandbox)) echouer(MAL_ECRIT, `--sandbox: a JSON object, what the workstation's sandbox probe returns\n${USAGE}`);
      demande = { verb: geste, sandbox: sandbox as BacASableDeLaStation };
      break;
    }
    case "renew":
      seules("--proof", "--turns", "--tokens");
      // Sans preuve, la demande part quand même : c'est le runtime qui refuse,
      // et son refus est au journal.
      demande = { verb: "renew", run: run(), proof: lues.get("--proof") || null, turns: entier("--turns"), tokens: entier("--tokens") };
      break;
    case "return": {
      seules("--end", "--reason", "--turns", "--tokens");
      const ending = FINS[lues.get("--end") ?? ""];
      if (ending === undefined) echouer(MAL_ECRIT, `--end: \`livre\` (the cook's branch is pushed to the origin) or \`echec\`\n${USAGE}`);
      demande = { verb: "deliver", run: run(), ending, reason: lues.get("--reason") || null, message: (await entree()) || null, turns: entier("--turns"), tokens: entier("--tokens") };
      break;
    }
    default:
      echouer(MAL_ECRIT, `unknown action: “${geste}”\n${USAGE}`);
  }

  let reponse;
  try {
    reponse = await demander(repertoireEtat, station, demande, options);
  } catch (erreur) {
    if (erreur instanceof SansReponse) echouer(SANS_REPONSE, erreur.message);
    throw erreur;
  }
  dire(JSON.stringify(reponse));
  if (!reponse.ok) echouer(REFUSEE, reponse.said);
}

// Ce que le geste reçoit sur son entrée standard — rien, dans un terminal.
async function entreeDuProcess(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let lu = "";
  process.stdin.setEncoding("utf8");
  for await (const morceau of process.stdin) lu += morceau;
  return lu;
}

if (import.meta.main) await enProcess((appel) => principal(appel, entreeDuProcess));
