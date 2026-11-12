// La commande `explanations` de la box (#3308) : le passage par lequel l'app lit
// et écrit le registre des explications d'un chef (`explications.ts`).
//
//   explanations --chef <login>                les mots dont il a vu ou écarté l'explication, en JSON
//   explanations seen <word> --chef <login>    il a vu ou écarté celle de ce mot
//   explanations reset --chef <login>          chaque explication se montre de nouveau
//
// La lecture répond `{"seen":[<mot>…]}`. Une écriture répond par une ligne de
// JSON : `{"ok":true,"seen":[<mot>…]}`, ou `{"ok":false,"message":<la ligne du
// refus>}` avec le code de sortie 1 — rien n'est alors écrit. Un registre
// illisible, à la lecture, se dit sur la sortie d'erreur, en 1. Un usage qui ne
// se lit pas sort avec le code 2.
import { Sortie, type Appel } from "../appel.ts";
import { ExplicationRefusee, ExplicationsIllisibles, MOTS_EXPLIQUES, ouvrirExplications } from "./explications.ts";

const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run explanations -- [seen <${MOTS_EXPLIQUES.join(" | ")}> | reset] --chef <GitHub login>`;

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const rang = args.indexOf("--chef");
  const chef = rang === -1 ? undefined : args[rang + 1];
  const reste = rang === -1 ? args : [...args.slice(0, rang), ...args.slice(rang + 2)];
  const [quoi, mot, ...trop] = reste;
  const lisible = chef !== undefined && trop.length === 0 && ((quoi === undefined && mot === undefined) || (quoi === "seen" && mot !== undefined) || (quoi === "reset" && mot === undefined));
  if (!lisible) echouer(2, `“${args.join(" ")}” is not an explanations command\n${USAGE}`);

  const registre = ouvrirExplications(repertoireEtat);
  try {
    if (quoi === undefined) return dire(JSON.stringify({ seen: registre.vues(chef) }));
    if (quoi === "seen") return dire(JSON.stringify({ ok: true, seen: registre.marquer(chef, mot ?? "") }));
    registre.effacer(chef);
    dire(JSON.stringify({ ok: true, seen: [] }));
  } catch (erreur) {
    if (erreur instanceof ExplicationRefusee || erreur instanceof ExplicationsIllisibles) {
      if (quoi === undefined) echouer(1, `the explanations are not read — ${erreur.message}`);
      dire(JSON.stringify({ ok: false, message: erreur.message }));
      throw new Sortie(1);
    }
    throw erreur;
  }
}
