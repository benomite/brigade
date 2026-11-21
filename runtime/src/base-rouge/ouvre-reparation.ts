// Le ticket de réparation d'une base rouge sur le chemin GitHub seul (#2339) :
// la base encore rouge après la relance de ses jobs en échec (#2323) ne fait pas
// qu'attendre, elle ouvre sur le rail un ticket `prio:0` qu'un cook prend tout
// de suite. Son titre nomme la base et le commit ; son corps, chaque check en
// échec avec la fin de sa sortie d'erreur, et la marque cachée du commit rouge.
//
// Un seul ticket par commit rouge, quels que soient les tours ou les stations
// qui le voient : avant d'ouvrir, la station cherche sur GitHub une issue de
// confiance qui porte la marque de ce commit, et n'ouvre rien si elle en trouve
// une. Rien n'est tenu hors de GitHub qu'un cache par station. Rien n'est réglé
// par projet : la base et le client GitHub du projet suffisent.
//
// L'appel vient du tour (`brigade-github.ts`), sur les checks que la relance
// rend : un rouge dont la relance est due ou tourne y est en cours, et n'ouvre
// rien.
import { DE_CONFIANCE } from "../alimenter.ts";
import { etatDeLaBase } from "../github-etat/etats.ts";
import type { Check } from "../events/pass.ts";
import { ECHECS_ATTEINTS, type IssueOuverte } from "../github.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";
import { LABEL_TESTS_ECRITS } from "../tests-acceptation/etape.ts";
import { LABELS_REPARATION, PRIO_REPARATION, shaDeReparation } from "../reparation.ts";

export type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

// Ce que l'ouverture lit et écrit de GitHub.
export type GitHubDeLaReparation = {
  // Le dernier commit de la branche d'intégration.
  teteDeLaBase(): Promise<string>;
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
  // Titre, état, labels et date de modification servent à regrouper les rouges
  // d'un même check (#3614) ; sans eux, une issue ne se regroupe pas.
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "title" | "state" | "labels" | "updatedAt">>)[]>;
  // Crée une issue ; rend son numéro.
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
  // Regrouper les rouges d'un check (#3614) : rouvrir une réparation fermée,
  // réécrire son corps et son titre. Facultatifs : sans eux, chaque commit
  // rouge ouvre son ticket comme avant.
  rouvrirIssue?(numero: number): Promise<void>;
  ecrireCorps?(numero: number, corps: string): Promise<void>;
  ecrireTitre?(numero: number, titre: string): Promise<void>;
  // Une réparation rouverte repart d'un état propre (#3928) : sans lui, elle garde ses labels d'étape.
  delabelliser?(numero: number, label: string): Promise<void>;
  labelliser?(numero: number, labels: string[]): Promise<void>;
  // Le journal du job d'un check de GitHub Actions, ou null. Sans lui, le
  // ticket nomme ses checks sans leur sortie.
  journalDuCheck?(check: Check): Promise<string | null>;
};

// La marque cachée du ticket, avec le sha complet du commit rouge.
const MARQUE = /^\s*<!--\s*brigade:base-rouge sha=([0-9A-Za-z._-]+)\s*-->\s*$/m;
export const marqueDeBaseRouge = (sha: string) => `<!-- brigade:base-rouge sha=${sha} -->`;
// Le commit qu'une issue répare : sa marque, ou celle que l'ancien chemin et
// #2214 posaient (`reparation.ts`) — une réparation déjà ouverte ainsi compte.
export const shaDeBaseRouge = (corps: string): string | null => MARQUE.exec(corps)?.[1] ?? shaDeReparation(corps);

// Un ticket est une réparation de base s'il porte la priorité des réparations et
// la marque d'un commit dans son corps : la seule livraison qu'une base rouge
// ne retient pas.
export const estUneReparation = (corps: string, labels: string[]): boolean => labels.includes(PRIO_REPARATION) && shaDeBaseRouge(corps) !== null;

// Jusqu'où on cherche, sur GitHub, la réparation d'un rouge dont cette station
// n'a pas ouvert le ticket (une autre, ou elle-même avant un redémarrage).
const FENETRE_MS = 7 * 24 * 3600 * 1000;

// Un check qui casse la base plusieurs fois a une seule réparation, qui suit sa
// cause (#3614) : un rouge sur un check dont une occurrence date de moins de
// `FENETRE_REPETITION_JOURS` jours rouvre ou complète cette réparation au lieu
// d'en ouvrir une autre ; à `SEUIL_DE_REPETITION` occurrences dans la fenêtre,
// son but devient la cause.
export const FENETRE_REPETITION_JOURS = 14;
export const SEUIL_DE_REPETITION = 3;
// Posé sur une réparation dont le but est la cause : le vert de la base ne la
// ferme plus. Elle ne se ferme que lorsque ce label dit la cause corrigée.
export const LABEL_CAUSE_CORRIGEE = "cause-fixed";
const MARQUE_CAUSE = "<!-- brigade:base-rouge-cause -->";
export const viseLaCause = (corps: string): boolean => corps.includes(MARQUE_CAUSE);

// L'identité d'un check : son nom sans le suffixe de shard ` (n/N)`.
const identiteDuCheck = (nom: string): string => nom.replace(/ \(\d+\/\d+\)$/, "");

const ENTETE_OCCURRENCES = "## Occurrences";
// Une ligne par commit rouge : sha court, date, checks (identités), erreur.
const OCCURRENCE = /^- `([0-9A-Za-z]+)` · (\d{4}-\d{2}-\d{2}) · (.*?) · (.*)$/;
type Occurrence = { sha: string; jour: string; checks: string[]; ligne: string };
const occurrencesDe = (corps: string): Occurrence[] =>
  corps.split(/\r?\n/).flatMap((ligne) => {
    const lue = OCCURRENCE.exec(ligne);
    return lue === null ? [] : [{ sha: lue[1] as string, jour: lue[2] as string, checks: (lue[3] as string).split(", "), ligne }];
  });
const jourDe = (instant: number) => new Date(instant).toISOString().slice(0, 10);

// La fin utile d'une sortie, en une ligne : la dernière ligne qui nomme une
// erreur, sinon la dernière ligne.
const resumeDeLErreur = (sortie: string | null): string => {
  const lignes = (sortie ?? "").split("\n").map((ligne) => ligne.replace(/^##\[error\]/, "").trim()).filter((ligne) => ligne !== "");
  const ligne = lignes.findLast((candidate) => /\b(?:\w*Error|not ok|FAIL)\b/.test(candidate)) ?? lignes.at(-1);
  if (ligne === undefined) return "no output from GitHub";
  return ligne.length > 160 ? `${ligne.slice(0, 159)}…` : ligne;
};
const ligneDOccurrence = (sha: string, jour: string, identites: string[], echecs: EchecDeLaBase[]) =>
  `- \`${court(sha)}\` · ${jour} · ${identites.join(", ").replaceAll(" · ", " ")} · ${resumeDeLErreur(echecs.find(({ sortie }) => sortie !== null && sortie !== "")?.sortie ?? null)}`;

// Ajoute une ligne à la fin de la liste des occurrences, sans toucher aux
// précédentes ; sans liste, elle s'ouvre en fin de corps.
const ajouteUneOccurrence = (corps: string, ligne: string): string => {
  const lignes = corps.split("\n");
  const entete = lignes.indexOf(ENTETE_OCCURRENCES);
  if (entete === -1) return `${corps.trimEnd()}\n\n${ENTETE_OCCURRENCES}\n\n${ligne}\n`;
  let fin = entete + 1;
  for (let i = entete + 1; i < lignes.length && !/^(?:## |---)/.test(lignes[i] as string); i++) if (OCCURRENCE.test(lignes[i] as string)) fin = i + 1;
  lignes.splice(fin, 0, ligne);
  return lignes.join("\n");
};

// La sortie d'un check gardée dans le ticket : ses dernières lignes, jusqu'à la
// dernière erreur que GitHub Actions y annonce. Le corps d'une issue tient en
// 65 536 caractères : les checks se partagent `SORTIES_MAX`, chacun
// `SORTIE_MAX` au plus.
export const LIGNES_MAX = 80;
export const SORTIE_MAX = 6_000;
const SORTIES_MAX = 45_000;
const SORTIE_MIN = 1_000;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

// La fin utile d'un journal de job : sans couleurs ni horodatage, coupée après
// sa dernière ligne `##[error]` (ce qui suit est le ménage du job), ses
// `LIGNES_MAX` dernières lignes, `plafond` caractères au plus — la fin gardée.
export function sortieDErreur(journal: string, plafond = SORTIE_MAX): string {
  const lignes = journal
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(ANSI, "").replace(HORODATAGE, "").trimEnd())
    .filter((ligne) => !/^##\[(?:group|endgroup)\]/.test(ligne));
  const derniere = lignes.findLastIndex((ligne) => ligne.startsWith("##[error]"));
  const utiles = (derniere === -1 ? lignes : lignes.slice(0, derniere + 1)).slice(-LIGNES_MAX);
  while (utiles.length > 0 && utiles[0]?.trim() === "") utiles.shift();
  while (utiles.length > 0 && utiles.at(-1)?.trim() === "") utiles.pop();
  const texte = utiles.join("\n");
  if (texte.length <= plafond) return texte;
  const fin = texte.slice(texte.length - plafond);
  // Coupée à une ligne entière quand il y en a une.
  const saut = fin.indexOf("\n");
  return `…\n${saut === -1 || saut === fin.length - 1 ? fin : fin.slice(saut + 1)}`;
}

// Une clôture de bloc plus longue que toute suite d'accents graves du texte.
const cloture = (texte: string) => "`".repeat(Math.max(3, ...[...texte.matchAll(/`+/g)].map(([suite]) => suite.length + 1)));

const court = (sha: string) => sha.slice(0, 7);
const nomDe = (check: CheckDeLaBase) => check.name ?? "unnamed check";

export type EchecDeLaBase = { nom: string; url: string | null; sortie: string | null };

export function titreDeLaReparation(base: string, sha: string, echecs: EchecDeLaBase[]): string {
  const [premier, ...autres] = echecs;
  return `Repair \`${base}\`, red on ${court(sha)}: ${premier?.nom ?? "checks"}${autres.length === 0 ? "" : ` (and ${autres.length} more)`}`;
}

export const titreDeLaCause = (base: string, identite: string) => `Repair \`${base}\`: ${identite} keeps failing`;

// Le corps d'une réparation dont le but est la cause : le premier commit rouge
// et la liste des occurrences, telle qu'elle est, sont gardés.
export function corpsDeLaCause(base: string, identite: string, ancien: string): string {
  const marque = MARQUE.exec(ancien)?.[0].trim();
  return [
    ...(marque === undefined ? [] : [marque]),
    MARQUE_CAUSE,
    "",
    "## Context",
    "",
    `The check \`${identite}\` has broken \`${base}\` ${SEUIL_DE_REPETITION} times or more within ${FENETRE_REPETITION_JOURS} days. This ticket tracks its cause, not one commit: each new red commit on it is added to the list below, and the base's green does not close it.`,
    "",
    ENTETE_OCCURRENCES,
    "",
    ...occurrencesDe(ancien).map(({ ligne }) => ligne),
    "",
    "## Acceptance criteria",
    "",
    `- The cause that makes \`${identite}\` fail is found and fixed: no test is removed, skipped or weakened to turn green.`,
    `- The ticket closes only when the cause is fixed: put the \`${LABEL_CAUSE_CORRIGEE}\` label on it, and the next green of \`${base}\` closes it.`,
    "",
    "---",
    "",
    `_Opened by a station, with no gesture from the chef: \`${PRIO_REPARATION}\`, it goes before the whole rail._`,
  ].join("\n");
}

export function corpsDeLaReparation(base: string, sha: string, echecs: EchecDeLaBase[], occurrence?: string): string {
  const sorties = echecs.flatMap(({ nom, url, sortie }) => {
    const titre = `### \`${nom}\``;
    if (sortie === null || sortie === "") return [titre, "", url === null ? "_GitHub gives no output for this check._" : `_GitHub gives no output for this check: ${url}_`, ""];
    const bloc = cloture(sortie);
    return [titre, "", ...(url === null ? [] : [url, ""]), bloc, sortie, bloc, ""];
  });
  return [
    marqueDeBaseRouge(sha),
    "",
    "## Context",
    "",
    `The integration branch \`${base}\` is red on \`${sha}\`, and still red after its failed jobs were re-run once. While it is red, the kitchen merges nothing — this ticket is the only delivery that is merged on a red base.`,
    "",
    "## What fails",
    "",
    ...(echecs.length === 0 ? ["- (GitHub names no failing check)"] : echecs.map(({ nom }) => `- \`${nom}\``)),
    "",
    ...(occurrence === undefined ? [] : [ENTETE_OCCURRENCES, "", occurrence, ""]),
    ...(sorties.length === 0 ? [] : ["## Error output", "", ...sorties]),
    "## Acceptance criteria",
    "",
    `- The CI of \`${base}\` is green once this delivery is merged.`,
    "- What failed is fixed at its cause: no test is removed, skipped or weakened to turn green.",
    "",
    "---",
    "",
    `_Opened by a station, with no gesture from the chef: \`${PRIO_REPARATION}\`, it goes before the whole rail._`,
  ].join("\n");
}

export type OuvertureDeLaReparation = {
  // Le commit rouge et le ticket qui le répare ; nuls quand la base n'est pas rouge.
  sha: string | null;
  reparation: number | null;
  // Pourquoi le ticket n'a pas pu être ouvert ou retrouvé : le tour suivant
  // réessaie, la base rouge n'en retient pas moins les merges.
  erreur?: string;
  // La consignation du rouge sur la réparation regroupée (occurrence, titre de
  // la cause) : le tour la joue une fois la réparation dispatchée, et le tour
  // suivant réessaie si elle échoue.
  consigner?: () => Promise<void>;
};

export type OptionsDeLOuverture = {
  github: GitHubDeLaReparation;
  base: string;
  maintenant?: () => Date;
};

export function ouvreReparation({ github, base, maintenant = () => new Date() }: OptionsDeLOuverture) {
  // Cache, pas état : les rouges dont on sait déjà le ticket.
  const connus = new Map<string, number>();
  // Deux appels sur le même rouge : GitHub n'est lu qu'une fois.
  const enCours = new Map<string, Promise<{ numero: number; consigner?: () => Promise<void> }>>();

  // Ce qui a échoué, avec la sortie de chaque check. Un journal illisible
  // n'empêche pas le ticket, sauf GitHub qui limite ses appels : le tour
  // suivant réessaie, journaux compris.
  const echecsDe = async (rouges: CheckDeLaBase[]): Promise<EchecDeLaBase[]> => {
    const plafond = Math.max(SORTIE_MIN, Math.min(SORTIE_MAX, Math.floor(SORTIES_MAX / Math.max(1, rouges.length))));
    const echecs: EchecDeLaBase[] = [];
    for (const check of rouges) {
      const url = check.url ?? null;
      let journal: string | null = null;
      try {
        journal = (await github.journalDuCheck?.({ name: nomDe(check), outcome: "red", conclusion: "failure", url })) ?? null;
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      }
      echecs.push({ nom: nomDe(check), url, sortie: journal === null ? null : sortieDErreur(journal, plafond) });
    }
    return echecs;
  };

  type Lue = Awaited<ReturnType<GitHubDeLaReparation["issuesDepuis"]>>[number];
  const reparationDe = (sha: string, rouges: CheckDeLaBase[]): Promise<{ numero: number; consigner?: () => Promise<void> }> => {
    const connu = connus.get(sha);
    if (connu !== undefined) return Promise.resolve({ numero: connu });
    const deja = enCours.get(sha);
    if (deja !== undefined) return deja;
    const ouverture = (async () => {
      const maintenant_ = maintenant().getTime();
      const depuis = new Date(maintenant_ - Math.max(FENETRE_MS, FENETRE_REPETITION_JOURS * 24 * 3600 * 1000)).toISOString();
      const lire = async (): Promise<Lue[]> => (await github.issuesDepuis(depuis)).filter((issue) => DE_CONFIANCE.includes(issue.association));
      // Les réparations de ce rouge, de la plus ancienne à la plus récente. Une
      // marque posée par un inconnu ne fait taire aucun rouge ; une occurrence
      // déjà consignée sur une réparation regroupée le fait taire aussi.
      const dece = (lues: Lue[]) =>
        lues
          .filter((issue) => shaDeBaseRouge(issue.body) === sha || occurrencesDe(issue.body).some((occurrence) => occurrence.sha === court(sha)))
          .map((issue) => issue.number)
          .sort((x, y) => x - y);
      const lues = await lire();
      let [numero] = dece(lues);
      if (numero !== undefined) {
        connus.set(sha, numero);
        return { numero };
      }
      // Le rouge d'un check dont une occurrence est récente complète sa
      // réparation, la plus récemment modifiée. Rouvrir est le geste qui
      // dispatche : il passe avant toute lecture de journal et toute écriture,
      // et s'il échoue la réparation s'ouvre comme avant (#3614).
      const identites = [...new Set(rouges.map((check) => identiteDuCheck(nomDe(check))))];
      const coupure = jourDe(maintenant_ - FENETRE_REPETITION_JOURS * 24 * 3600 * 1000);
      let reprise = lues
        .filter((issue) => !(issue.labels ?? []).includes(LABEL_CAUSE_CORRIGEE) && occurrencesDe(issue.body).some((occurrence) => occurrence.jour >= coupure && occurrence.checks.some((check) => identites.includes(check))))
        // Deux stations qui ont ouvert chacune la réparation d'un même commit
        // en ont fermé la plus récente : elle ne se rouvre pas, la plus ancienne reste.
        .filter((issue, _, candidates) => candidates.every((autre) => autre.number >= issue.number || occurrencesDe(autre.body)[0]?.sha !== occurrencesDe(issue.body)[0]?.sha))
        .sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "") || y.number - x.number)[0];
      if (reprise !== undefined && reprise.state === "closed") {
        try {
          if (github.rouvrirIssue === undefined) throw new Error("this GitHub client cannot reopen an issue");
          await github.rouvrirIssue(reprise.number);
          // Ni `tests-written` ni mise de côté périmés. Le compte des échecs repart du dernier retrait de `set-aside:failures`, que GitHub
          // ne date que si le label y était : on le pose d'abord, pour que le retrait existe même sur un ticket qui n'était pas mis de côté.
          await github.delabelliser?.(reprise.number, LABEL_TESTS_ECRITS);
          if (github.delabelliser !== undefined) {
            await github.labelliser?.(reprise.number, [ECHECS_ATTEINTS]);
            await github.delabelliser(reprise.number, ECHECS_ATTEINTS);
          }
        } catch (erreur) {
          if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
          reprise = undefined;
        }
      }
      if (reprise !== undefined) {
        const retenue = reprise;
        // La consignation vient après la réparation : le tour la joue une fois
        // celle-ci dispatchée, et un échec ne la retarde ni ne la retient.
        const consigner = async () => {
          const jour = jourDe(maintenant_);
          const ligne = ligneDOccurrence(sha, jour, identites, await echecsDe(rouges));
          let corps = ajouteUneOccurrence(retenue.body, ligne);
          let titre: string | null = null;
          const repetees = identites.find((identite) => occurrencesDe(corps).filter((o) => o.jour >= coupure && o.checks.includes(identite)).length >= SEUIL_DE_REPETITION);
          if (repetees !== undefined && !viseLaCause(retenue.body)) {
            corps = corpsDeLaCause(base, repetees, corps);
            titre = titreDeLaCause(base, repetees);
          }
          if (github.ecrireCorps === undefined) throw new Error("this GitHub client cannot rewrite an issue");
          // Le titre d'abord : s'il échoue, le corps ne dit pas encore la cause et le tour suivant réessaie les deux.
          if (titre !== null) {
            if (github.ecrireTitre === undefined) throw new Error("this GitHub client cannot rewrite an issue's title");
            await github.ecrireTitre(retenue.number, titre);
          }
          await github.ecrireCorps(retenue.number, corps);
          connus.set(sha, retenue.number);
        };
        return { numero: retenue.number, consigner };
      }
      const echecs = await echecsDe(rouges);
      const ligne = ligneDOccurrence(sha, jourDe(maintenant_), identites, echecs);
      const creee = await github.creerIssue({ titre: titreDeLaReparation(base, sha, echecs), corps: corpsDeLaReparation(base, sha, echecs, ligne), labels: LABELS_REPARATION });
      // Deux stations qui ont vu le rouge ensemble en ont chacune ouvert une :
      // la plus ancienne reste, l'autre se ferme.
      const [premiere = creee] = dece(await lire());
      if (premiere < creee) await github.fermerIssue(creee);
      numero = Math.min(premiere, creee);
      connus.set(sha, numero);
      return { numero };
    })().finally(() => enCours.delete(sha));
    enCours.set(sha, ouverture);
    return ouverture;
  };

  // Les checks de la base, tels que la relance les rend. Rouges, son commit
  // rouge a son ticket de réparation ; si GitHub refuse de le créer, l'erreur
  // est rendue et le tour suivant la retente.
  return async (checks: CheckDeLaBase[]): Promise<OuvertureDeLaReparation> => {
    if (etatDeLaBase(checks) !== "red") return { sha: null, reparation: null };
    const rouges = checks.filter((check) => check.outcome === "red");
    const sha = await github.teteDeLaBase();
    try {
      const { numero, consigner } = await reparationDe(sha, rouges);
      return { sha, reparation: numero, ...(consigner === undefined ? {} : { consigner }) };
    } catch (erreur) {
      return { sha, reparation: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  };
}
