// Les tickets récurrents d'un projet (#3230, épique #3216) : un ticket qui
// revient sur un rythme. Le chef ou le second en déclare un (`recurring
// declare`, `commande.ts`) ; à sa date, le planificateur de la cuisine en crée
// l'issue avec le label `fire`, et il arrive sur le rail comme tout ticket
// (`planificateur.ts`).
//
// Ce que l'app appelle, sous cette forme :
//   declare({title, body, rhythm})   en déclare un ; rend le ticket récurrent
//   list()                           les tickets récurrents du projet
//   pause(id) / resume(id)           le suspend, le reprend ; rend le ticket récurrent
//   remove(id)                       le retire
// Un ticket récurrent se lit {id, title, body, rhythm, paused, nextDate}.
//
// Ils vivent dans le répertoire d'état du projet (`recurring.json`), avec, pour
// chacun, la dernière issue créée (`lastIssue`), que seul le planificateur lit.
// Chaque écriture relit le fichier et le réécrit d'un coup (`.tmp` puis
// renommage), sans rien attendre entre les deux : la commande et la cuisine,
// deux process, n'écrasent pas ce que l'autre vient d'écrire. Un fichier
// illisible lève `RecurrentsIllisibles` : rien ne le réécrit à sa place.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estUnJour, jourDe, occurrenceDesLe, RecurrentInvalide, rythmeDe, type Rythme } from "./rythme.ts";

export const FICHIER_DES_RECURRENTS = "recurring.json";

export type Recurrent = { id: string; title: string; body: string; rhythm: Rythme; paused: boolean; nextDate: string };
// Ce que le fichier garde de plus : la dernière issue créée pour lui.
export type RecurrentStocke = Recurrent & { lastIssue?: number };

export class RecurrentsIllisibles extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrentsIllisibles";
  }
}

export type ServiceDesRecurrents = {
  declare(declaration: unknown): Recurrent;
  list(): Recurrent[];
  pause(id: string): Recurrent;
  resume(id: string): Recurrent;
  remove(id: string): void;
};

export const cheminDesRecurrents = (repertoireEtat: string) => join(repertoireEtat, FICHIER_DES_RECURRENTS);

// Ce que l'app voit d'un ticket récurrent : sans sa dernière issue.
const vu = ({ id, title, body, rhythm, paused, nextDate }: RecurrentStocke): Recurrent => ({ id, title, body, rhythm, paused, nextDate });

function titreDe(brut: unknown): string {
  if (typeof brut !== "string" || brut.trim() === "") throw new RecurrentInvalide("the title is empty");
  return brut.trim();
}

function stockeDe(brut: unknown, rang: number): RecurrentStocke {
  const champs = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const { id, body, paused, nextDate, lastIssue } = champs;
  if (typeof id !== "string" || id === "" || typeof body !== "string" || typeof paused !== "boolean" || !estUnJour(nextDate) || !(lastIssue === undefined || (Number.isSafeInteger(lastIssue) && (lastIssue as number) > 0))) {
    throw new RecurrentsIllisibles(`recurring ticket #${rang + 1} does not read as {id, title, body, rhythm, paused, nextDate}`);
  }
  try {
    return { id, title: titreDe(champs.title), body, rhythm: rythmeDe(champs.rhythm), paused, nextDate, ...(lastIssue === undefined ? {} : { lastIssue: lastIssue as number }) };
  } catch (erreur) {
    throw new RecurrentsIllisibles(`recurring ticket ${id} does not read — ${(erreur as Error).message}`);
  }
}

// Les tickets récurrents que le fichier porte ; aucun s'il n'existe pas.
export function lireLesRecurrents(repertoireEtat: string): RecurrentStocke[] {
  const chemin = cheminDesRecurrents(repertoireEtat);
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new RecurrentsIllisibles(`${chemin} is not read — ${(erreur as Error).message}`);
  }
  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    throw new RecurrentsIllisibles(`${chemin} is not valid JSON`);
  }
  const liste = typeof lu === "object" && lu !== null ? (lu as Record<string, unknown>).recurring : undefined;
  if (!Array.isArray(liste)) throw new RecurrentsIllisibles(`${chemin} holds no “recurring” list`);
  return liste.map(stockeDe);
}

function ecrire(repertoireEtat: string, recurrents: RecurrentStocke[]): void {
  const chemin = cheminDesRecurrents(repertoireEtat);
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify({ recurring: recurrents }, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
}

// Relit le fichier, change le ticket récurrent `id` et réécrit : rend le
// ticket changé, ou null s'il n'y est plus (`changer` rend null : il est retiré).
export function changerUnRecurrent(repertoireEtat: string, id: string, changer: (recurrent: RecurrentStocke) => RecurrentStocke | null): RecurrentStocke | null {
  const recurrents = lireLesRecurrents(repertoireEtat);
  const rang = recurrents.findIndex((recurrent) => recurrent.id === id);
  const avant = recurrents[rang];
  if (avant === undefined) return null;
  const apres = changer(avant);
  if (apres === null) recurrents.splice(rang, 1);
  else recurrents[rang] = apres;
  ecrire(repertoireEtat, recurrents);
  return apres;
}

export function ouvrirRecurrents(repertoireEtat: string, options: { maintenant?: () => Date; identifiant?: () => string } = {}): ServiceDesRecurrents {
  const maintenant = options.maintenant ?? (() => new Date());
  const identifiant = options.identifiant ?? (() => randomUUID().slice(0, 8));
  const changer = (id: string, f: (recurrent: RecurrentStocke) => RecurrentStocke): Recurrent => {
    const change = changerUnRecurrent(repertoireEtat, id, f);
    if (change === null) throw new RecurrentInvalide(`no recurring ticket ${id}`);
    return vu(change);
  };
  return {
    declare(declaration) {
      const champs = (typeof declaration === "object" && declaration !== null ? declaration : {}) as Record<string, unknown>;
      const title = titreDe(champs.title);
      const body = champs.body ?? "";
      if (typeof body !== "string") throw new RecurrentInvalide("the body is not text");
      const rhythm = rythmeDe(champs.rhythm);
      const recurrents = lireLesRecurrents(repertoireEtat);
      const nouveau: RecurrentStocke = { id: identifiant(), title, body, rhythm, paused: false, nextDate: occurrenceDesLe(rhythm, jourDe(maintenant())) };
      ecrire(repertoireEtat, [...recurrents, nouveau]);
      return vu(nouveau);
    },
    list: () => lireLesRecurrents(repertoireEtat).map(vu),
    pause: (id) => changer(id, (recurrent) => ({ ...recurrent, paused: true })),
    // Repris après sa date, il repart de sa prochaine occurrence, aujourd'hui compris :
    // les dates passées pendant la pause ne créent rien.
    resume: (id) =>
      changer(id, (recurrent) => {
        const aujourdhui = jourDe(maintenant());
        return { ...recurrent, paused: false, nextDate: recurrent.nextDate < aujourdhui ? occurrenceDesLe(recurrent.rhythm, aujourdhui) : recurrent.nextDate };
      }),
    remove(id) {
      let trouve = false;
      changerUnRecurrent(repertoireEtat, id, () => ((trouve = true), null));
      if (!trouve) throw new RecurrentInvalide(`no recurring ticket ${id}`);
    },
  };
}
