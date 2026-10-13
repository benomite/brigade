// Le geste d'une station distante, lancé sur la box par la station elle-même :
//   ssh <hote> brigade <projet> tirer <station> annoncer
//   ssh <hote> brigade <projet> tirer <station> reclamer
//   ssh <hote> brigade <projet> tirer <station> renouveler <run> --preuve <empreinte> --tours <n> --jetons <n>
//   ssh <hote> brigade <projet> tirer <station> rendre <run> --fin livre|echec [--raison <motif>] --tours <n> --jetons <n>
// C'est la seule direction : la station joint la box, jamais l'inverse. Le
// geste n'ouvre aucune connexion — il écrit la demande au journal du projet et
// y lit la réponse du runtime (`tirer.ts`).
//
// Fait pour un programme (le runner de la station) : la réponse est un objet
// JSON, sur une ligne de la sortie standard. Codes de sortie : 0, la demande
// est servie ; 1, elle est refusée — la réponse dit pourquoi, et `stop` si le
// cook est à arrêter ; 2, le geste est mal écrit ; 3, la box n'a pas répondu.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import type { Demande } from "./evenements/distante.ts";
import { demander, SansReponse, type OptionsDeDemande } from "./tirer.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run tirer -- <station> annoncer",
  "        … tirer -- <station> reclamer",
  "        … tirer -- <station> renouveler <run> --preuve <empreinte du worktree> --tours <n> --jetons <n>",
  "        … tirer -- <station> rendre <run> --fin livre|echec [--raison <motif>] --tours <n> --jetons <n>   (le dernier message du cook sur l'entrée standard)",
].join("\n");

export const SERVIE = 0;
export const REFUSEE = 1;
export const MAL_ECRIT = 2;
export const SANS_REPONSE = 3;

const FINS: Record<string, "delivered" | "failed"> = { livre: "delivered", echec: "failed" };
const OPTIONS = ["--preuve", "--tours", "--jetons", "--fin", "--raison"];

// `entree` : ce que le geste reçoit sur son entrée standard. `options` : ce
// qu'un test règle de l'attente.
export async function principal({ args, env, dire, redire }: Appel, entree: () => Promise<string> = async () => "", options: OptionsDeDemande = {}): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(MAL_ECRIT, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
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
    if (brut === undefined || !/^[0-9]+$/.test(brut) || !Number.isSafeInteger(Number(brut))) echouer(MAL_ECRIT, `${option} : il faut un entier, ce que le cook a consommé jusqu'ici\n${USAGE}`);
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
    case "annoncer":
    case "reclamer":
      if (suite.length > 0) echouer(MAL_ECRIT, USAGE);
      demande = { verb: geste === "annoncer" ? "announce" : "claim" };
      break;
    case "renouveler":
      seules("--preuve", "--tours", "--jetons");
      // Sans preuve, la demande part quand même : c'est le runtime qui refuse,
      // et son refus est au journal.
      demande = { verb: "renew", run: run(), proof: lues.get("--preuve") || null, turns: entier("--tours"), tokens: entier("--jetons") };
      break;
    case "rendre": {
      seules("--fin", "--raison", "--tours", "--jetons");
      const ending = FINS[lues.get("--fin") ?? ""];
      if (ending === undefined) echouer(MAL_ECRIT, `--fin : \`livre\` (la branche du cook est poussée sur l'origine) ou \`echec\`\n${USAGE}`);
      demande = { verb: "deliver", run: run(), ending, reason: lues.get("--raison") || null, message: (await entree()) || null, turns: entier("--tours"), tokens: entier("--jetons") };
      break;
    }
    default:
      echouer(MAL_ECRIT, `geste inconnu : « ${geste} »\n${USAGE}`);
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
