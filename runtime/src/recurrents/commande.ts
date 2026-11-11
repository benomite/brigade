// La commande `recurring` de la box (#3230) : le chef ou le second déclare un
// ticket récurrent, le liste, le suspend, le reprend ou le retire — le passage
// par lequel l'app joint le service des tickets récurrents (`recurrents.ts`).
//
//   recurring                                     les tickets récurrents, en JSON
//   recurring declare --title <title> [--body <body>] --rhythm daily
//   recurring declare … --rhythm weekly --weekday <1-7>    1 le lundi, 7 le dimanche
//   recurring declare … --rhythm monthly --day <1-31>
//   recurring pause <id> | resume <id> | remove <id>
//
// Une écriture répond par une ligne de JSON : `{"ok":true,"recurring":<le
// ticket récurrent>}` (`{"ok":true}` pour un retrait), ou
// `{"ok":false,"message":<la ligne du refus>}` avec le code de sortie 1 — rien
// n'est alors écrit. Un usage qui ne se lit pas sort avec le code 2.
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirRecurrents, RecurrentsIllisibles } from "./recurrents.ts";
import { RecurrentInvalide } from "./rythme.ts";

const USAGE =
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run recurring -- [declare --title <title> [--body <body>] --rhythm daily | weekly --weekday <1-7> | monthly --day <1-31> | pause <id> | resume <id> | remove <id>]";

const OPTIONS: Record<string, string> = { "--title": "title", "--body": "body", "--rhythm": "kind", "--weekday": "weekday", "--day": "dayOfMonth" };

// `--weekday 3` est un nombre ; `--weekday x` reste tel quel, pour que le refus le cite.
const nombre = (texte: string) => (/^\d+$/.test(texte) ? Number(texte) : texte);

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [quoi, ...reste] = args;

  const champs: Record<string, string> = {};
  if (quoi === "declare") {
    for (let i = 0; i < reste.length; i += 2) {
      const [option, valeur] = [reste[i] ?? "", reste[i + 1]];
      const champ = OPTIONS[option];
      if (champ === undefined || valeur === undefined || champ in champs) echouer(2, `“${args.join(" ")}” is not a recurring command\n${USAGE}`);
      champs[champ] = valeur;
    }
  } else if (!(quoi === undefined || (["pause", "resume", "remove"].includes(quoi) && reste.length === 1))) echouer(2, `“${args.join(" ")}” is not a recurring command\n${USAGE}`);

  const recurrents = ouvrirRecurrents(repertoireEtat);
  const id = reste[0] ?? "";
  try {
    if (quoi === undefined) return dire(JSON.stringify({ recurring: recurrents.list() }));
    if (quoi === "remove") {
      recurrents.remove(id);
      return dire(JSON.stringify({ ok: true }));
    }
    const { title, body, kind, weekday, dayOfMonth } = champs;
    const rhythm = { kind, ...(weekday === undefined ? {} : { weekday: nombre(weekday) }), ...(dayOfMonth === undefined ? {} : { dayOfMonth: nombre(dayOfMonth) }) };
    const recurrent = quoi === "declare" ? recurrents.declare({ title, body, rhythm }) : quoi === "pause" ? recurrents.pause(id) : recurrents.resume(id);
    dire(JSON.stringify({ ok: true, recurring: recurrent }));
  } catch (erreur) {
    if (erreur instanceof RecurrentInvalide || erreur instanceof RecurrentsIllisibles) {
      if (quoi === undefined) echouer(1, `the recurring tickets are not read — ${erreur.message}`);
      dire(JSON.stringify({ ok: false, message: erreur.message }));
      throw new Sortie(1);
    }
    throw erreur;
  }
}
