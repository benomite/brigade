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
// Le temps perdu compte en cook raté tout cook rendu sans livraison, pas
// seulement ceux que la qualité compte pour un essai : un blocage auquel le
// manager a répondu, une attente d'un ticket ouvert, un arrêt que le cook n'a
// pas causé. Sans eux, la preuve de BOBL-tech/mirrorlab#670 disait « first
// try » sous 5 min de cooks ratés, sans un mot de la question du cook qui les
// avait coûtées : la cause ne se lisait nulle part (#3036). Chacun y est donc
// nommé, avec les mots du cook.
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
import { MARQUE_D_ATTENTE_DE_TICKET } from "./attente-ticket/attente-ticket.ts";
import { MARQUE_DE_REPONSE } from "./blocage-au-manager.ts";
import { ouvrirJournal } from "./journal.ts";
import type { QualiteDuTicket } from "./mesure-qualite.ts";
import { MARQUE_D_ATTENTE, MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "./qualite-github.ts";
import { dureeDuTicket, pertesDuTicket, tempsPerdu, ticketsRecents } from "./temps-max/mesure.ts";
import type { TempsTicket } from "./temps-ticket/ligne-status.ts";
import { type DepotDuTicket, RAIL_PLUS_TARD_MS } from "./temps-ticket/mesure.ts";

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

// Ce que la preuve sait d'un ticket mesuré. `raisons` : celles de ses renvois,
// de ses cooks sans livraison comptés pour un essai (`echecs`) et des autres
// (`arrets`, que seul le temps perdu cite), lues sur l'issue — une erreur si
// elle ne se lit pas. `qualite` : celle que le fichier des temps a gardée à son merge.
// `depot` (temps perdu) : son dépôt, son `fire` et sa première prise lus sur
// GitHub — une erreur si GitHub ne les rend pas.
export type PreuveDuTicket = {
  temps: TempsTicket;
  qualite: QualiteDuTicket | null;
  raisons: RaisonsLues | { erreur: string };
  depot?: DepotDuTicket | { erreur: string };
};

export type RaisonsLues = { renvois: string[]; echecs: string[]; arrets?: string[] };

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

// Les mots du cook que la station cite sous « The cook's question: » ou « The
// cook's words: », sur une ligne ; sans eux, la raison après le « — ».
const motsDuCook = (corps: string) => {
  const cites = /^The cook's (?:question|words):\n\n((?:>.*(?:\n|$))+)/m.exec(corps)?.[1];
  const mots = cites
    ?.split("\n")
    .map((ligne) => ligne.replace(/^> ?/, "").trim())
    .filter(Boolean)
    .join(" ");
  return mots ? court(mots) : raisonDe(corps);
};

// Les cooks rendus sans livraison que la qualité ne compte pas pour un essai,
// et ce qui les a arrêtés : la marque de leur commentaire, et ce qu'elle dit de l'arrêt.
const ARRETS: readonly (readonly [string, string, (corps: string) => string])[] = [
  [MARQUE_DE_REPONSE, "blocked, answered by the manager", motsDuCook],
  [MARQUE_D_ATTENTE_DE_TICKET, "stopped on an open ticket", motsDuCook],
  [MARQUE_D_ATTENTE, "stopped, not the cook's doing", raisonDe],
];

// Les raisons des renvois et des cooks sans livraison, des commentaires de
// confiance — ceux que `qualiteDeLIssue` compte, puis les autres arrêts.
export function raisonsDesCommentaires(commentaires: readonly { body: string; association: string }[]): Required<RaisonsLues> {
  const siens = commentaires.filter(({ association }) => DE_CONFIANCE.includes(association));
  return {
    renvois: siens.filter(({ body }) => body.startsWith(MARQUE_DE_RENVOI)).map(({ body }) => raisonDe(body)),
    echecs: siens.filter(({ body }) => body.startsWith(MARQUE_D_ECHEC)).map(({ body }) => raisonDe(body)),
    arrets: siens.flatMap(({ body }) => {
      const arret = ARRETS.find(([marque]) => body.startsWith(marque));
      return arret === undefined ? [] : [`${arret[1]}: ${arret[2](body)}`];
    }),
  };
}

// Les lignes des raisons d'un ticket. Sans commentaires lisibles, ce que le
// fichier des temps a gardé : la cause de chaque renvoi et le nombre de cooks ratés.
// `arrets` : les cooks sans livraison qui ne comptent pas pour un essai y sont aussi.
function lignesDesRaisons(p: PreuveDuTicket, arrets = false): string[] {
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
  const autres = arrets ? (p.raisons.arrets ?? []).map((r) => `  - failed cook, not counted as a try: ${r}`) : [];
  return [...p.raisons.renvois.map((r) => `  - send-back: ${r}`), ...p.raisons.echecs.map((r) => `  - failed cook: ${r}`), ...autres, ...reparation];
}

const resume = (p: PreuveDuTicket, arrets = false): string => {
  if ("erreur" in p.raisons) return p.qualite === null ? "quality unknown" : "comments unreadable";
  const { renvois } = p.raisons;
  const echecs = [...p.raisons.echecs, ...(arrets ? (p.raisons.arrets ?? []) : [])];
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
  return [`- ${nomme(t.ticket, projet)}: ${resume(p, true)} — ${perdu}`, `  - ${quand}, merged ${instant(t.mergedAt, "unknown")}`, ...lignesDesRaisons(p, true)];
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

// Les attentes d'une prise d'un ticket, en millisecondes, d'après ce que
// GitHub en dit : du dépôt à sa première prise — de `fire` s'il a été posé
// plus d'une heure après le dépôt, comme la mesure (`marquesDuDepot`) —, puis
// de chaque cook rendu sans livraison à la prise suivante, ou au merge. Sans
// dépôt lu, aucune.
function attentesDuTicket(p: PreuveDuTicket): { debut: number; fin: number }[] {
  const depot = p.depot;
  if (depot === undefined || "erreur" in depot) return [];
  const merge = Date.parse(p.temps.mergedAt ?? "");
  const depose = Date.parse(depot.deposeAt);
  const fire = Date.parse(depot.fireAt ?? "");
  const debut = !Number.isNaN(fire) && fire - depose > RAIL_PLUS_TARD_MS ? fire : depose;
  const attentes = [{ debut, fin: Date.parse(depot.priseAt ?? "") }];
  let rendu: number | null = null;
  for (const fait of depot.faits ?? []) {
    const at = Date.parse(fait.at);
    if (Number.isNaN(at)) continue;
    if (fait.quoi === "rendu") rendu ??= at;
    else if (fait.quoi === "prise" && rendu !== null) {
      attentes.push({ debut: rendu, fin: at });
      rendu = null;
    }
  }
  if (rendu !== null) attentes.push({ debut: rendu, fin: merge });
  return attentes
    .map(({ debut, fin }) => ({ debut, fin: Number.isNaN(fin) ? merge : fin }))
    .filter(({ debut, fin }) => !Number.isNaN(debut) && !Number.isNaN(fin) && fin >= debut);
}

// Combien des tickets qui ont le plus attendu une prise la section suit dans le journal.
const TICKETS_SUIVIS = 5;

// Les événements que la section cite, au plus `EVENEMENTS_CITES`, dans l'ordre
// du journal. Plus nombreux, ceux des attentes d'une prise des tickets qui ont
// le plus attendu (`suivis`), à parts égales : les 40 premiers de la fenêtre
// tombaient tous dans sa première heure, et l'attente de 40 min d'un ticket
// déposé l'après-midi n'avait aucune ligne pour la dire (#3156). Sans attente
// lue sur GitHub, ou sans événement dedans, les premiers de la fenêtre.
function evenementsCites(
  evenements: readonly EvenementDuJournal[],
  tickets: readonly PreuveDuTicket[],
): { cites: EvenementDuJournal[]; suivis: number[] } {
  const premiers = { cites: evenements.slice(0, EVENEMENTS_CITES), suivis: [] };
  if (evenements.length <= EVENEMENTS_CITES) return premiers;
  const instants = evenements.map((e) => Date.parse(e.at));
  const dedans = (attentes: { debut: number; fin: number }[]) =>
    instants.flatMap((at, rang) => (attentes.some(({ debut, fin }) => at >= debut && at <= fin) ? [rang] : []));
  const files = tickets
    .map((p) => ({ ticket: p.temps.ticket, attente: pertesDuTicket(p.temps).attente, attentes: attentesDuTicket(p) }))
    .filter(({ attente }) => attente > 0)
    .sort((a, b) => b.attente - a.attente)
    .map(({ ticket, attentes }) => ({ ticket, rangs: dedans(attentes) }))
    .filter(({ rangs }) => rangs.length > 0)
    .slice(0, TICKETS_SUIVIS);
  const pris = new Set<number>();
  for (let tour = 0; pris.size < EVENEMENTS_CITES && files.some(({ rangs }) => rangs.length > tour); tour++) {
    for (const { rangs } of files) {
      const rang = rangs[tour];
      if (rang !== undefined && pris.size < EVENEMENTS_CITES) pris.add(rang);
    }
  }
  if (pris.size === 0) return premiers;
  const cites = [...pris].sort((a, b) => a - b).flatMap((rang) => evenements[rang] ?? []);
  return { cites, suivis: files.map(({ ticket }) => ticket) };
}

// La section d'un ticket du temps perdu : par ticket, ses instants, sa perte et
// ses raisons ; puis les événements du journal de la fenêtre.
export function sectionDuTempsPerdu(tickets: readonly PreuveDuTicket[], journal: JournalDeLaFenetre, projet?: string): string {
  const choix = "erreur" in journal ? null : evenementsCites(journal.evenements, tickets);
  const evenements =
    "erreur" in journal
      ? [`- the station's journal could not be read: ${court(journal.erreur)}`]
      : journal.evenements.length === 0 || choix === null
        ? ["- no event in this window"]
        : [
            ...(choix.suivis.length === 0
              ? []
              : [
                  `_${journal.evenements.length} events in this window: the ${choix.cites.length} cited fall in the claim waits of ` +
                    `${choix.suivis.map((n) => nomme(n, projet)).join(", ")}, the tickets that waited longest for a claim — ` +
                    "from filing or `fire` to first claim, and from each cook given back to the next claim._",
                  "",
                ]),
            ...choix.cites.map((e) => ligneDeLEvenement(e, projet)),
            ...(journal.evenements.length > choix.cites.length ? [`- and ${journal.evenements.length - choix.cites.length} more`] : []),
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
