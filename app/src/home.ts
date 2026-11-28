// L'accueil : la vue d'ensemble de brigade (#870) — une ligne par projet, une par station, et en
// bas une ligne de santé, Max et GitHub. On n'y agit pas : un clic sur une ligne ouvre sa page, et
// c'est là que tout se décide. Chaque ligne dit ce qui s'y passe en quelques mots de l'app, avec sa
// pastille — jamais une commande, jamais le texte d'une erreur : ce qu'elle tait se lit au survol,
// dans les mots de l'app aussi.
//
// Un projet : rouge quand il est bloqué — base rouge, cuisine arrêtée ou retenue, runtime éteint,
// box injoignable ; jaune quand une décision attend le chef ; vert sinon ; gris tant que rien n'en
// est lu. Sa phrase dit, dans cet ordre, ce qui bloque, ce qui attend le chef — combien, depuis
// quand —, puis ce qui cuit ; et, quand la fiabilité de ses cooks a dérivé, d'un mot : « drifting » (#987).
// Une station : son état (« online », « offline for 12 min »), ce qu'elle fait — ses cooks —, et les projets qu'elle porte. Sa machine et sa
// version ne se lisent qu'au survol.
//
// Ce module ne lance rien et ne demande rien de neuf à personne : il dit, d'après ce que les veilles
// ont déjà lu — `faits` de chaque projet, son `status` quand il est lu, les stations et leurs
// projets sur GitHub. Un état qui n'a pas été lu n'est jamais dit sain.
import type { Shown } from "./awaiting.ts";
import type { Reading } from "./box.ts";
import { hour } from "./format.ts";
import { COMMAND as FACTS, understand, isOutsideLine, type Facts } from "./facts.ts";

// Les tons des pastilles de la peau (vue.css) : vert, jaune — l'orange de la maquette —, rouge, gris ; bleu, le calme d'une
// pause.
export type Your = "vert" | "jaune" | "rouge" | "gris" | "bleu";
// Une ligne de l'accueil : ce qu'elle dit, sa pastille, et ce qui se lit au survol.
// `attend` : combien de décisions attendent le chef, absent quand aucune (la pastille « N awaiting you » de l'accueil, #2912).
export type LineOfProject = { nom: string; ton: Your; dit: string; survol: string; attend?: number };
export type Home = { projets: LineOfProject[] };

// Un projet du fichier, tel que l'accueil le nomme : `servi` faux, aucune station ne le sert, et rien n'en est lu.
export type ProjectOfTheHome = { nom: string; servi: boolean };
// Ce que la dernière lecture de `faits` a donné d'un projet : ses faits, une box qui n'a pas été
// jointe, ou une box jointe qui n'a pas rendu ce que l'app lit.
export type ReadFacts = { a: string } & ({ faits: Facts } | { injoignable: true } | { illisible: true });
// Le dernier `status` lu d'un projet, son bloc `attend` mis à part.
export type StatusRead = { texte: string; attend?: string };

const s = (howMany: number) => (howMany > 1 ? "s" : "");
// Une durée que la box écrit (`duree`) — « 40 s », « 12 min », « 3 h 05 », « 2 j » —, dans les mots de l'app.
const inEnglish = (duration: string) => duration.replace(/ j$/, " d");

// --- Un projet -------------------------------------------------------------------

// Depuis quand la plus ancienne décision attend le chef : la tête du bloc `attend` (`decrireAttentes`),
// en français ou en anglais (`awaiting   2 decisions await the chef — the oldest for 3 d`, #927).
const since = (awaiting: string | undefined): string | undefined => {
  const [, duration] = /^(?:attend +\d+ décisions? attend(?:ent)? le chef(?: — la plus ancienne)? depuis|awaiting +\d+ decisions? awaits? the chef — (?:the oldest )?for) (.+)$/m.exec(awaiting ?? "") ?? [];
  return duration === undefined ? undefined : inEnglish(duration.trim());
};

// Ce qui attend le chef : combien de décisions, depuis quand.
function awaiting(facts: Facts, status: StatusRead | undefined): string[] {
  const howMany = facts.compteurs.attend;
  if (howMany === 0) return [];
  const duration = since(status?.attend);
  return [`${howMany} decision${s(howMany)} await${howMany === 1 ? "s" : ""} you${duration === undefined ? "" : `, for ${duration}`}`];
}

// Ce qui cuit : les tickets au travail, sinon ce qui est à la pass.
function cooked(facts: Facts): string[] {
  if (facts.compteurs.auTravail > 0) return [`${facts.compteurs.auTravail} at work`];
  return facts.compteurs.aLaPass > 0 ? [`${facts.compteurs.aLaPass} at the pass`] : [];
}

export function lineOfProject(project: ProjectOfTheHome, readOne: ReadFacts | undefined, status: StatusRead | undefined): LineOfProject {
  const { nom: name } = project;
  if (!project.servi) return { nom: name, ton: "gris", dit: "no station: nothing is read", survol: "no station serves this project yet — open it to see what is missing" };
  if (readOne === undefined) return { nom: name, ton: "gris", dit: "first read in progress…", survol: "the app reads every project's station every 30 s" };
  if ("injoignable" in readOne) return { nom: name, ton: "rouge", dit: "station unreachable", survol: `its station did not answer at ${hour(readOne.a)} — the app tries again every 30 s; open it to see why` };
  if ("illisible" in readOne) return { nom: name, ton: "gris", dit: "not read: its station does not answer as the app expects", survol: `tried at ${hour(readOne.a)} — open it to see what its station returned` };
  const { faits: facts } = readOne;
  const expected = awaiting(facts, status);
  const parties = [...expected, ...cooked(facts)];
  return {
    nom: name,
    ton: expected.length > 0 ? "jaune" : "vert",
    dit: parties.length === 0 ? "nothing cooking, nothing waits for you" : parties.join(" · "),
    survol: `read at ${hour(readOne.a)} — open it to act`,
    ...(facts.compteurs.attend > 0 ? { attend: facts.compteurs.attend } : {}),
  };
}

// --- Ce qui est tenu ---------------------------------------------------------------

export type OptionsHome = { projets: () => readonly ProjectOfTheHome[] };

// Les dernières lectures de chaque projet, tenues par le process principal, et l'accueil qui s'en dessine. Chaque
// réception rend l'accueil à redessiner — rien, quand il dit la même chose qu'avant : rien ne bouge. Un `status` que plus
// rien ne rafraîchit est lâché : la ligne redit alors ce que `faits` seul en dit.
export function holdHome({ projets: projects }: OptionsHome) {
  const facts = new Map<string, ReadFacts>();
  const statuses = new Map<string, StatusRead>();
  let said: string | undefined;

  const seenOne = (): Home => ({ projets: projects().map((project) => lineOfProject(project, facts.get(project.nom), statuses.get(project.nom))) });
  // L'accueil, s'il a changé depuis le dernier rendu.
  const change = (): Home | undefined => {
    const fresh = seenOne();
    const text = JSON.stringify(fresh);
    if (text === said) return undefined;
    said = text;
    return fresh;
  };

  return {
    vu: seenOne,
    // Le fichier des projets a changé : leurs lignes suivent.
    relire: change,
    // Une lecture de `faits`.
    // Hors ligne (#1818), la ligne garde ce qui a été lu en dernier : sa station n'y est pour rien.
    faits(reading: Reading): Home | undefined {
      const { projet: project, a } = reading;
      if (isOutsideLine(reading)) return undefined;
      if ("erreur" in reading) facts.set(project, reading.atteinte ? { a, illisible: true } : { a, injoignable: true });
      else {
        const readOne = understand(reading.sorties.find(({ commande: command }) => command === FACTS)?.texte ?? "");
        facts.set(project, "informe" in readOne ? { a, illisible: true } : { a, faits: readOne });
      }
      return change();
    },
    // Une lecture de `status`, son bloc `attend` mis à part. Ratée, elle ne dit plus rien ; hors ligne, rien n'en change (#1818).
    status(shownOne: Shown): Home | undefined {
      if (isOutsideLine(shownOne)) return undefined;
      const text = "erreur" in shownOne ? undefined : shownOne.sorties.find(({ commande: command }) => command === "status")?.texte;
      if ("erreur" in shownOne || text === undefined) statuses.delete(shownOne.projet);
      else statuses.set(shownOne.projet, { texte: text, ...(shownOne.attend === undefined ? {} : { attend: shownOne.attend }) });
      return change();
    },
    // La veille de `status` ne lit plus que ces projets : le `status` des autres n'est plus rafraîchi.
    veiller(readOnes: readonly string[]): Home | undefined {
      for (const project of statuses.keys()) if (!readOnes.includes(project)) statuses.delete(project);
      return change();
    },
    // La barre est reposée : `faits` va être relu pour chacun.
    oublier(): Home | undefined {
      facts.clear();
      return change();
    },
  };
}
