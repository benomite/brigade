// La preuve d'un ticket de mesure (#2839, épique #2838). Le ticket de qualité
// (`alerte-qualite.ts`) et celui du temps perdu (`temps-max/correction.ts`)
// portent un chiffre ; le cook qui les prend ne lit ni les issues d'un projet
// privé, ni `.claude/brigade/temps-tickets.json` de la station, ni le journal
// sous son répertoire d'état : sans la preuve, il s'arrêtait `blocked-on-human`
// (#2832, #2837). La station la rassemble au dépôt du ticket, de ses propres
// données, et l'ajoute au corps : une section « Evidence », courte, qu'un cook
// lit sans autre accès.
//
// Qualité : chaque ticket mesuré, et la raison de chacun de ses renvois et de
// ses cooks sans livraison, lue sur ses commentaires de la station. Temps
// perdu : la même chose, avec, par ticket, son dépôt, son `fire` et sa
// première prise, lus sur GitHub ; puis les événements du journal de la
// station sur la fenêtre mesurée (`station.held`, `station.released`…).
//
// Projet mesuré autre que celui où le ticket se dépose (#2840) : le cook du
// ticket n'a alors ni ses issues, ni son état sur la station. La station copie
// en toutes lettres, dans le corps, ses tickets (numéros, raisons), ses
// horodatages et les événements du journal ; chaque ticket y est nommé par son
// projet (`BOBL-tech/mirrorscreen#101`, jamais `#101`, qui désignerait une issue
// du dépôt du ticket), et le corps ne renvoie ni à ses issues ni au chemin de
// son état pour porter cette preuve.
//
// Une lecture qui échoue ne fait tomber ni la section ni le dépôt du ticket :
// la ligne qui en dépend le dit, avec l'erreur, et rien n'est inventé à sa place.
import { DE_CONFIANCE } from "./alimenter.ts";
import { ouvrirJournal } from "./journal.ts";
import type { QualiteDuTicket } from "./mesure-qualite.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "./qualite-github.ts";
import { dureeDuTicket, pertesDuTicket, tempsPerdu, ticketsRecents } from "./temps-max/mesure.ts";
import type { TempsTicket } from "./temps-ticket/ligne-status.ts";
import type { DepotDuTicket } from "./temps-ticket/mesure.ts";

export type SorteDeMesure = "qualite" | "temps-perdu";

export const TITRE_PREUVE = "## Evidence";
// Combien d'événements du journal la section cite, au plus.
export const EVENEMENTS_CITES = 40;
// La longueur d'une raison ou d'un événement cité, au plus.
const LONGUEUR_MAX = 300;
// La longueur de la section, au plus : un corps d'issue GitHub tient 65 536 caractères.
export const LONGUEUR_SECTION_MAX = 30_000;
// Combien de tickets se lisent sur GitHub à la fois.
const LECTURES_EN_PARALLELE = 4;
// Les événements du journal qui ne disent rien de la fenêtre : le battement du runtime et le suivi des sessions.
const BRUIT = ["runtime.ticked", "session.observed", "token.observed", "cook.progressed"];

// Ce que la preuve sait d'un ticket mesuré. `raisons` : celles de ses renvois et
// de ses cooks sans livraison, lues sur l'issue — une erreur si elle ne se lit
// pas. `qualite` : celle que le fichier des temps a gardée à son merge.
// `depot` (temps perdu) : son dépôt, son `fire` et sa première prise lus sur
// GitHub — une erreur si GitHub ne les rend pas.
export type PreuveDuTicket = {
  temps: TempsTicket;
  qualite: QualiteDuTicket | null;
  raisons: { renvois: string[]; echecs: string[] } | { erreur: string };
  depot?: DepotDuTicket | { erreur: string };
};

export type EvenementDuJournal = { at: string; type: string; ticket: number | null; payload: unknown };
// Les événements de la fenêtre, ou pourquoi ils ne se lisent pas.
export type JournalDeLaFenetre = { debut: string; fin: string } & ({ evenements: EvenementDuJournal[] } | { erreur: string });

const court = (texte: string) => (texte.length > LONGUEUR_MAX ? `${texte.slice(0, LONGUEUR_MAX - 1)}…` : texte);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const min = (secondes: number) => `${Math.round(secondes / 6) / 10} min`;
// Le ticket `n`, nommé par son projet quand le ticket se dépose sur un autre dépôt.
const nomme = (n: number, projet?: string) => (projet === undefined ? `#${n}` : `${projet}#${n}`);
const fois = (n: number, nom: string) => `${n} ${nom}${n === 1 ? "" : "s"}`;

// La raison qu'un commentaire de la station donne, après son « — » (`brigade-github.ts`).
const raisonDe = (corps: string) => court(/— ([^\n]*)/.exec(corps)?.[1]?.trim() || "no reason written");

// Les raisons des renvois et des cooks sans livraison, des commentaires de
// confiance — ceux que `qualiteDeLIssue` compte.
export function raisonsDesCommentaires(commentaires: readonly { body: string; association: string }[]): { renvois: string[]; echecs: string[] } {
  const siens = commentaires.filter(({ association }) => DE_CONFIANCE.includes(association));
  return {
    renvois: siens.filter(({ body }) => body.startsWith(MARQUE_DE_RENVOI)).map(({ body }) => raisonDe(body)),
    echecs: siens.filter(({ body }) => body.startsWith(MARQUE_D_ECHEC)).map(({ body }) => raisonDe(body)),
  };
}

// Les lignes des raisons d'un ticket. Sans commentaires lisibles, ce que le
// fichier des temps a gardé : la cause de chaque renvoi et le nombre de cooks ratés.
function lignesDesRaisons(p: PreuveDuTicket): string[] {
  const reparation = p.qualite?.reparation === undefined ? [] : [`  - repairs main${p.qualite.reparation.length === 0 ? "" : `, broken checks: ${p.qualite.reparation.join(", ")}`}`];
  if ("erreur" in p.raisons) {
    const q = p.qualite;
    if (q === null) return [`  - its comments could not be read (${court(p.raisons.erreur)}) and no quality was recorded at its merge`, ...reparation];
    return [
      `  - its comments could not be read (${court(p.raisons.erreur)}); recorded at its merge: ${fois(q.renvois.length, "send-back")}, ${fois(q.cooksRates, "failed cook")}`,
      ...q.renvois.map((cause) => `  - send-back, recorded cause: ${cause}`),
      ...reparation,
    ];
  }
  return [...p.raisons.renvois.map((r) => `  - send-back: ${r}`), ...p.raisons.echecs.map((r) => `  - failed cook: ${r}`), ...reparation];
}

const resume = (p: PreuveDuTicket): string => {
  if ("erreur" in p.raisons) return p.qualite === null ? "quality unknown" : "comments unreadable";
  const { renvois, echecs } = p.raisons;
  if (renvois.length === 0 && echecs.length === 0) return p.qualite?.reparation === undefined ? "first try" : "first try, a repair of main";
  return [...(renvois.length > 0 ? [fois(renvois.length, "send-back")] : []), ...(echecs.length > 0 ? [fois(echecs.length, "failed cook")] : [])].join(", ");
};

const enTete = (tickets: readonly PreuveDuTicket[], projet?: string) => [
  TITRE_PREUVE,
  "",
  projet !== undefined
    ? `_Gathered by the station when it filed this ticket, from ${projet}'s tickets${tickets.length === 0 ? "" : ` (${tickets.map((p) => nomme(p.temps.ticket, projet)).join(", ")})`}, their recorded timestamps and the station's journal. ${projet} is not the repository this ticket is filed on, and a cook cannot read it: everything the measure rests on is copied below in full._`
    : `_Gathered by the station when it filed this ticket, from the project's \`.claude/brigade/temps-tickets.json\`, its issues${tickets.length === 0 ? "" : ` (${tickets.map((p) => `#${p.temps.ticket}`).join(", ")})`} and the station's journal: what a cook needs to diagnose the measure, with no other access._`,
  "",
];

// La section d'un ticket de qualité : chaque ticket mesuré et ses raisons.
export function sectionDeQualite(tickets: readonly PreuveDuTicket[], projet?: string): string {
  return [...enTete(tickets, projet), `### Measured tickets (${tickets.length})`, "", ...tickets.flatMap((p) => [`- ${nomme(p.temps.ticket, projet)}: ${resume(p)}`, ...lignesDesRaisons(p)])].join("\n");
}

// Un instant lu sur GitHub, ou ce qui en tient lieu.
const instant = (valeur: string | null | undefined, absent: string) => (valeur === null || valeur === undefined || valeur === "" ? absent : valeur);

function lignesDuTemps(p: PreuveDuTicket, projet?: string): string[] {
  const t = p.temps;
  const pertes = pertesDuTicket(t);
  const perdu = `lost ${min(tempsPerdu(t))} of ${min(dureeDuTicket(t))} (claim wait ${min(pertes.attente)}, failed cooks ${min(pertes.ratees)}, send-backs ${min(pertes.renvois)})`;
  const depot = p.depot;
  const quand =
    depot === undefined || "erreur" in depot
      ? `filed, fire and first claim not read on GitHub${depot === undefined ? "" : ` (${court(depot.erreur)})`}; recorded start ${instant(t.depuis, "none")}, recorded first claim ${instant(t.priseAt, "none")}`
      : `filed ${depot.deposeAt}, fire ${instant(depot.fireAt, "none on GitHub")}, first claim ${instant(depot.priseAt, "none on GitHub")}`;
  return [`- ${nomme(t.ticket, projet)}: ${resume(p)} — ${perdu}`, `  - ${quand}, merged ${instant(t.mergedAt, "unknown")}`, ...lignesDesRaisons(p)];
}

const payloadCite = (payload: unknown) => {
  if (payload === null || typeof payload !== "object") return payload === undefined || payload === null ? "" : court(String(payload));
  const champs = Object.entries(payload as Record<string, unknown>).map(([cle, valeur]) => `${cle}=${typeof valeur === "string" ? valeur : JSON.stringify(valeur)}`);
  return court(champs.join(" "));
};
const ligneDeLEvenement = (e: EvenementDuJournal, projet?: string) => {
  const cite = payloadCite(e.payload);
  return `- ${e.at} \`${e.type}\`${e.ticket === null ? "" : ` ${nomme(e.ticket, projet)}`}${cite === "" ? "" : ` ${cite}`}`;
};

// La section d'un ticket du temps perdu : par ticket, ses instants, sa perte et
// ses raisons ; puis les événements du journal de la fenêtre.
export function sectionDuTempsPerdu(tickets: readonly PreuveDuTicket[], journal: JournalDeLaFenetre, projet?: string): string {
  const evenements =
    "erreur" in journal
      ? [`- the station's journal could not be read: ${court(journal.erreur)}`]
      : journal.evenements.length === 0
        ? ["- no event in this window"]
        : [
            ...journal.evenements.slice(0, EVENEMENTS_CITES).map((e) => ligneDeLEvenement(e, projet)),
            ...(journal.evenements.length > EVENEMENTS_CITES ? [`- and ${journal.evenements.length - EVENEMENTS_CITES} more`] : []),
          ];
  return [
    ...enTete(tickets, projet),
    `### Measured tickets (${tickets.length})`,
    "",
    ...tickets.flatMap((p) => lignesDuTemps(p, projet)),
    "",
    `### Station journal, ${journal.debut} to ${journal.fin}`,
    "",
    ...evenements,
  ].join("\n");
}

// La fenêtre mesurée : du premier dépôt (ou de la première prise) au dernier merge des tickets.
export function fenetreDesTickets(temps: readonly TempsTicket[]): { debut: string; fin: string } | null {
  const debuts = temps.map((t) => Date.parse(t.depuis ?? t.claimedAt ?? t.mergedAt ?? "")).filter((n) => !Number.isNaN(n));
  const fins = temps.map((t) => Date.parse(t.mergedAt ?? "")).filter((n) => !Number.isNaN(n));
  if (debuts.length === 0 || fins.length === 0) return null;
  return { debut: new Date(Math.min(...debuts)).toISOString(), fin: new Date(Math.max(...fins)).toISOString() };
}

// Les événements du journal de la station entre `debut` et `fin` (ISO), dans
// l'ordre, sans le bruit. Le journal s'ouvre en lecture seule et se referme.
export function evenementsDeLaFenetre(repertoireEtat: string, debut: string, fin: string): EvenementDuJournal[] {
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    return journal.base
      .lire<{ at: string; type: string; ticket: number | null; payload: string }>(
        "SELECT at, type, ticket, payload FROM events WHERE at >= ? AND at <= ? AND type NOT IN (SELECT value FROM json_each(?)) ORDER BY seq",
        debut,
        fin,
        JSON.stringify(BRUIT),
      )
      .map(({ payload, ...e }) => {
        let lu: unknown = payload;
        try {
          lu = JSON.parse(payload);
        } catch {}
        return { ...e, payload: lu };
      });
  } finally {
    journal.fermer();
  }
}

// Ce que la preuve lit du GitHub du projet mesuré.
export type GitHubDeLaPreuve = {
  commentaires(numero: number): Promise<{ body: string; association: string }[]>;
  depotDuTicket?(numero: number): Promise<DepotDuTicket | null>;
};

async function parPaquets<T, R>(elements: readonly T[], faire: (element: T) => Promise<R>): Promise<R[]> {
  const rendus: R[] = [];
  for (let i = 0; i < elements.length; i += LECTURES_EN_PARALLELE) rendus.push(...(await Promise.all(elements.slice(i, i + LECTURES_EN_PARALLELE).map(faire))));
  return rendus;
}

// La preuve, liée au GitHub du projet et au journal de la station
// (`repertoireEtat` ; absent, la section le dit). Elle rend la section de la
// sorte demandée, sur les tickets récents des enregistrements ; elle ne lève pas.
// `projetMesure` : le projet mesuré, quand le ticket se dépose sur un autre
// dépôt (#2840) ; la section copie alors tout, sous les noms de ce projet.
export function preuveDeMesure({ github, repertoireEtat, projetMesure }: { github: GitHubDeLaPreuve; repertoireEtat?: string; projetMesure?: string }) {
  return async (sorte: SorteDeMesure, enregistrements: readonly TempsTicket[], qualites: ReadonlyMap<number, QualiteDuTicket>): Promise<string> => {
    const recents = ticketsRecents(enregistrements);
    const tickets = await parPaquets(recents, async (temps): Promise<PreuveDuTicket> => {
      const raisons = await github
        .commentaires(temps.ticket)
        .then(raisonsDesCommentaires)
        .catch((erreur: unknown) => ({ erreur: message(erreur) }));
      const preuve: PreuveDuTicket = { temps, qualite: qualites.get(temps.ticket) ?? null, raisons };
      if (sorte === "qualite") return preuve;
      const lire = github.depotDuTicket;
      const depot =
        lire === undefined
          ? { erreur: "this station's GitHub client does not read the filing of a ticket" }
          : await lire(temps.ticket).then(
              (lu) => lu ?? { erreur: "the issue was not found" },
              (erreur: unknown) => ({ erreur: message(erreur) }),
            );
      return { ...preuve, depot };
    });
    if (sorte === "qualite") return sectionDeQualite(tickets, projetMesure);
    const fenetre = fenetreDesTickets(recents);
    if (fenetre === null) return sectionDuTempsPerdu(tickets, { debut: "unknown", fin: "unknown", erreur: "the measured tickets carry no readable instant" }, projetMesure);
    if (repertoireEtat === undefined) return sectionDuTempsPerdu(tickets, { ...fenetre, erreur: "this station was started without a state directory" }, projetMesure);
    let journal: JournalDeLaFenetre;
    try {
      journal = { ...fenetre, evenements: evenementsDeLaFenetre(repertoireEtat, fenetre.debut, fenetre.fin) };
    } catch (erreur) {
      journal = { ...fenetre, erreur: message(erreur) };
    }
    return sectionDuTempsPerdu(tickets, journal, projetMesure);
  };
}

export type Preuve = () => Promise<string>;

// Le corps d'un ticket de mesure suivi de sa preuve. Une preuve qui lève ne
// retient pas le ticket : la section dit qu'elle n'a pas pu être rassemblée.
export async function avecLaPreuve(corps: string, preuve: Preuve | undefined): Promise<string> {
  if (preuve === undefined) return corps;
  const section = await preuve().catch((erreur: unknown) => `${TITRE_PREUVE}\n\n- the station could not gather the evidence: ${court(message(erreur))}`);
  const tenue = section.length > LONGUEUR_SECTION_MAX ? `${section.slice(0, LONGUEUR_SECTION_MAX)}\n\n- … the evidence is cut here, over ${LONGUEUR_SECTION_MAX} characters` : section;
  return `${corps}\n\n${tenue}`;
}
