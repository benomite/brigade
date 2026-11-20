// La relance d'un ticket mis de côté pour une raison qu'un cook sait réparer
// (épique #2745, ticket #2750). Un ticket que la station sort de la cuisine
// (`served-elsewhere`) attendait qu'un humain le relance, même quand rien ne
// demandait un humain : #2707 et #2709 sont restés une heure de côté, le rail
// vide. Ici, la cuisine le relance seule — le label `served-elsewhere` tombe,
// `fire` reste — et dit sur l'issue ce que le cook doit réparer :
// - la PR en conflit avec la base : la rebaser sur la base ;
// - un check rouge sur la tête de la PR : le check, par son nom ;
// - une relecture qui demande des changements sur cette tête : ses points bloquants ;
// - un cook qui s'est arrêté sans livrer : pourquoi il s'est arrêté.
//
// Rien d'autre ne se relance : une carte qui attend le chef (`chef-todo` — une
// question produit ou de design), une attente posée (`waiting`), ou une mise de
// côté dont la raison ne se lit pas. Un humain décide.
//
// Le même ticket ne boucle pas : après `RELANCES_MAX` relances pour la même
// raison, la troisième n'a pas lieu, et un ticket de bug dit ce qui le fait
// boucler — un seul, même appelé de nouveau, même d'une autre station.
//
// Une boucle ne s'ouvre pas une boucle (#3895) : un ticket que la cuisine a
// ouvert pour une boucle et qui boucle à son tour s'arrête là, avec une ligne
// pour le chef qui dit pourquoi — le pas de la CI en échec et sa ligne de journal.
// Et quand le même pas échoue avec la même ligne sur les PR de deux tickets
// différents, la cuisine ne relance plus aucun ticket pour cette raison : une
// ligne au chef, jusqu'à ce que ce pas ne soit plus rouge sur ces PR.
//
// Rien n'est tenu ici : le compte des relances et le bug déjà ouvert se
// relisent des commentaires de l'issue, à chaque appel. Aucune valeur n'est
// propre à un projet : la base vient de la PR ou de l'appelant.
import { DE_CONFIANCE } from "../alimenter.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import { dernierVerdict, type CommentaireDeVerdict, type PRAFusionner } from "../github-etat/fusion.ts";
import type { Check } from "../events/pass.ts";
import { ECHECS_ATTEINTS, estMisDeCote, HORS_CUISINE, LABEL, type PR } from "../github.ts";
import { sortieDErreur } from "../base-rouge/ouvre-reparation.ts";
import { MARQUE_D_ECHEC } from "../qualite-github.ts";
import { MARQUE_MISE_DE_COTE_GELE } from "../passe-gel-tests/gele-faux.ts";

// Combien de fois la cuisine relance un ticket pour la même raison.
export const RELANCES_MAX = 2;

// Le label du ticket de bug qu'ouvre une boucle.
export const LABEL_DU_BUG = "fix";

export type Cause = "conflict" | "red-check" | "review" | "cook-stopped";

const MARQUE_DE_RELANCE = /^<!-- brigade:relance cause=([a-z-]+) n=(\d+) -->/;
const MARQUE_DE_BOUCLE = /^<!-- brigade:boucle cause=([a-z-]+) bug=(\d+) -->/;
export const marqueDeRelance = (cause: Cause, n: number) => `<!-- brigade:relance cause=${cause} n=${n} -->`;
export const marqueDeBoucle = (cause: Cause, bug: number) => `<!-- brigade:boucle cause=${cause} bug=${bug} -->`;
export const marqueDArret = (cause: Cause) => `<!-- brigade:boucle-arretee cause=${cause} -->`;
export const marqueDeCoupe = (prs: readonly number[]) => `<!-- brigade:coupe prs=${prs.join(",")} -->`;
// Les commentaires de la guérison elle-même : ils ne disent pas pourquoi le ticket est de côté.
const MARQUE_DE_GUERISON = /^<!-- brigade:(?:relance|boucle|boucle-arretee|coupe) /;
// Le titre que porte le ticket qu'ouvre une boucle.
const TITRE_DE_BOUCLE = /^#\d+ loops: set aside again after \d+ relaunches/;

// Le ticket mis de côté, tel que la station le lit.
export type TicketDeCote = { number: number; title: string; labels: readonly string[] };

// Ce que la relance demande au client GitHub de la station, et rien de plus.
export type GitHubDeLaGuerison = {
  // Les commentaires d'une issue ou d'une PR, du plus ancien au plus récent.
  commentaires(numero: number): Promise<CommentaireDeVerdict[]>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  // La PR qui livre le ticket, ou null.
  prDuTicket(issue: number): Promise<(PRAFusionner & Partial<Pick<PR, "base">>) | null>;
  // Les checks de la CI sur le commit `sha`.
  ci(sha: string): Promise<(Pick<Check, "outcome" | "name"> & Partial<Pick<Check, "conclusion" | "url">> & { ligne?: string | null })[]>;
  // Les pas en échec d'un check et son journal, quand le client les lit.
  etapesEnEchec?(check: { name: string; url?: string | null }): Promise<string[]>;
  journalDuCheck?(check: Check): Promise<string | null>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
};

export type ContexteDeLaGuerison = {
  github: GitHubDeLaGuerison;
  // La station qui relance, telle que ses commentaires la nomment.
  station: string;
  // La branche d'intégration du projet, quand la PR ne la dit pas.
  base: string;
  // Les raisons coupées pour ce tour (`disjoncteurs`), par `empreinte`.
  coupes?: ReadonlyMap<string, Coupe>;
};

// La raison réparable d'une mise de côté, et ce que le cook doit en faire.
export type Diagnostic = { cause: Cause; consigne: string; echec?: EchecDeCi };

// Le pas de la CI qui est rouge sur la PR, et sa ligne de journal : `ligne` est
// null quand le journal ne se lit pas — elle n'est jamais inventée.
export type EchecDeCi = { etape: string; ligne: string | null; pr: number; sha: string };

// Un même pas rouge, de la même ligne, sur les PR de deux tickets au moins.
export type Coupe = { etape: string; ligne: string; prs: number[] };

export type Guerison =
  | { fait: "relance"; cause: Cause; n: number }
  | { fait: "boucle"; cause: Cause; bug: number }
  | { fait: "deja-signale"; cause: Cause; bug: number }
  | { fait: "arret"; cause: Cause }
  | { fait: "rien"; pourquoi: string };

const DIT: Record<Cause, string> = {
  conflict: "its PR conflicts with the base",
  "red-check": "a check is red on its PR",
  review: "the review has blocking points",
  "cook-stopped": "the cook stopped without a delivery",
};

const deLaCuisine = (commentaires: CommentaireDeVerdict[]) => commentaires.filter((c) => DE_CONFIANCE.includes(c.association));

// Les points bloquants d'un verdict : ses puces, ou son texte entier s'il n'en a pas.
function pointsBloquants(motif: string): string[] {
  const puces = motif
    .split("\n")
    .map((ligne) => /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(ligne)?.[1])
    .filter((point): point is string => point !== undefined);
  return puces.length > 0 ? puces : motif.trim() === "" ? ["see the review on the PR"] : [motif.trim()];
}

// Le dernier commentaire de la station sur le ticket, hors de ceux de la guérison
// (ses relances, ses boucles signalées) : ce qui l'a mis de côté.
async function dernierDeLaStation(ticket: TicketDeCote, { github }: ContexteDeLaGuerison) {
  return deLaCuisine(await github.commentaires(ticket.number))
    .filter((c) => c.body.startsWith("<!-- brigade:") && !MARQUE_DE_GUERISON.test(c.body))
    .at(-1);
}

const LIGNE_MAX = 160;
export const empreinte = ({ etape, ligne }: { etape: string; ligne: string | null }) => (ligne === null ? null : `${etape}\n${ligne}`);
const direLEchec = ({ etape, ligne }: EchecDeCi) => `step \`${etape}\`${ligne === null ? " (its log line could not be read)" : ` — \`${ligne}\``}`;

// Le pas en échec du check rouge et la dernière ligne d'erreur de son journal.
// Un pas ou un journal illisible se dit tel quel : le pas retombe sur le nom du check, la ligne reste vide.
async function lireLEchec(github: GitHubDeLaGuerison, check: Awaited<ReturnType<GitHubDeLaGuerison["ci"]>>[number], pr: number, sha: string): Promise<EchecDeCi> {
  const rouge: Check = { name: check.name, outcome: "red", conclusion: check.conclusion ?? "failure", url: check.url ?? null };
  let etape = check.name;
  // Un check qui dit lui-même sa ligne de journal est cru tel quel ; sinon on lit le journal.
  let ligne: string | null = check.ligne == null || check.ligne.trim() === "" ? null : check.ligne.trim().slice(0, LIGNE_MAX);
  try {
    etape = (await github.etapesEnEchec?.(rouge))?.[0] ?? check.name;
  } catch {
    // Le check se dit par son nom.
  }
  try {
    const journal = ligne === null ? await github.journalDuCheck?.(rouge) : null;
    const derniere = journal == null ? "" : (sortieDErreur(journal).split("\n").at(-1) ?? "").replace(/^##\[error\]/, "").trim();
    if (ligne === null) ligne = derniere === "" ? null : derniere.slice(0, LIGNE_MAX);
  } catch {
    // La ligne reste vide.
  }
  return { etape, ligne, pr, sha };
}

// Pourquoi le ticket est de côté, s'il s'agit d'une raison qu'un cook répare :
// d'abord l'état de sa PR (conflit, check rouge, relecture), puis le dernier
// commentaire de la station (un cook arrêté). Null sinon.
export async function diagnostiquer(ticket: TicketDeCote, contexte: ContexteDeLaGuerison): Promise<Diagnostic | null> {
  const { github } = contexte;
  const pr = await github.prDuTicket(ticket.number);
  if (pr !== null && pr.state === "open" && !pr.merged) {
    const base = pr.base ?? contexte.base;
    if (pr.enConflit === true) {
      return { cause: "conflict", consigne: `PR #${pr.number} conflicts with \`${base}\`: rebase the branch on \`${base}\`, resolve the conflicts, and push.` };
    }
    const rougesLus = (await github.ci(pr.sha)).filter((check) => check.outcome === "red");
    const rouges = rougesLus.map((check) => check.name);
    if (rougesLus[0] !== undefined) {
      const echec = await lireLEchec(github, rougesLus[0], pr.number, pr.sha);
      return { cause: "red-check", echec, consigne: `PR #${pr.number} has ${rouges.length === 1 ? "a red check" : "red checks"} on \`${pr.sha.slice(0, 7)}\`: make ${rouges.map((nom) => `\`${nom}\``).join(", ")} green. Failing ${direLEchec(echec)}.` };
    }
    const commentairesDeLaPR = await github.commentaires(pr.number);
    const verdict = dernierVerdict(commentairesDeLaPR);
    if (verdict !== null && verdict.verdict === "request-changes" && verdict.sha === pr.sha) {
      const corps = commentairesDeLaPR.find((c) => c.id === verdict.commentaire)?.body ?? "";
      const points = pointsBloquants(corps.split("\n").slice(2).join("\n"));
      return { cause: "review", consigne: `The review of PR #${pr.number} on \`${pr.sha.slice(0, 7)}\` has blocking points; fix each of them:\n${points.map((point) => `- ${point}`).join("\n")}` };
    }
  }
  const dernier = await dernierDeLaStation(ticket, contexte);
  if (dernier?.body.startsWith(MARQUE_D_ECHEC)) {
    const motif = / — ([^\n]*)/.exec(dernier.body)?.[1] ?? "no reason given";
    return { cause: "cook-stopped", consigne: `The last cook stopped without a delivery — ${motif}. Pick the ticket up again and deliver it.` };
  }
  return null;
}

// Relance le ticket mis de côté si sa raison est réparable par un cook, ou
// ouvre le bug d'une boucle. Rend ce qui a été fait.
export async function relancer(ticket: TicketDeCote, contexte: ContexteDeLaGuerison): Promise<Guerison> {
  const { github, station } = contexte;
  if (!estMisDeCote(ticket.labels)) return { fait: "rien", pourquoi: "not set aside" };
  if (ticket.labels.includes(CHEF_TODO)) return { fait: "rien", pourquoi: "a card awaits the chef: a product or design decision" };
  if (ticket.labels.includes(LABEL_WAITING)) return { fait: "rien", pourquoi: "it waits for something on purpose (`waiting`)" };
  // Mis de côté parce que ses tests gelés faux, retirés, ne laisseraient rien pour prouver un critère (#3799) :
  // aucun cook n'y peut rien, et le relancer referait la boucle que cette mise de côté arrête.
  if ((await dernierDeLaStation(ticket, contexte))?.body.startsWith(MARQUE_MISE_DE_COTE_GELE)) return { fait: "rien", pourquoi: "its wrong frozen acceptance tests leave a criterion with nothing to prove it: a human decides" };
  const diagnostic = await diagnostiquer(ticket, contexte);
  if (diagnostic === null) return { fait: "rien", pourquoi: "no reason a cook can fix: a human decides" };
  const { cause, consigne, echec } = diagnostic;
  const commentaires = deLaCuisine(await github.commentaires(ticket.number));
  const cle = echec === undefined ? null : empreinte(echec);
  const coupe = cle === null || echec === undefined ? undefined : (contexte.coupes?.get(cle) ?? (await coupeVue(ticket.number, echec, cle, github)));
  if (coupe !== undefined) {
    const marque = marqueDeCoupe(coupe.prs);
    if (!commentaires.some((c) => c.body.startsWith(marque))) {
      await github.commenter(ticket.number, `${marque}\nStation \`${station}\`: not relaunched — step \`${coupe.etape}\` fails with \`${coupe.ligne}\` on the PRs of ${coupe.prs.length} tickets (${coupe.prs.map((n) => `#${n}`).join(", ")}): the kitchen relaunches no ticket for this reason until that step is green again.`);
    }
    return { fait: "rien", pourquoi: `step \`${coupe.etape}\` is red with the same log line on the PRs of several tickets: no relaunch until it is green` };
  }
  const boucle = commentaires.map((c) => MARQUE_DE_BOUCLE.exec(c.body)).find((marque) => marque?.[1] === cause);
  if (boucle) return { fait: "deja-signale", cause, bug: Number(boucle[2]) };
  const relances = commentaires.filter((c) => MARQUE_DE_RELANCE.exec(c.body)?.[1] === cause);
  if (relances.length >= RELANCES_MAX && TITRE_DE_BOUCLE.test(ticket.title)) {
    // Un ticket de boucle qui boucle : un seul constat pour le chef, jamais un ticket de plus.
    const marque = marqueDArret(cause);
    if (commentaires.some((c) => c.body.startsWith(marque))) return { fait: "rien", pourquoi: "a loop ticket that loops in turn: already signalled to the chef" };
    await github.commenter(ticket.number, `${marque}\nStation \`${station}\`: not relaunched, and no new loop ticket — #${ticket.number} was opened for a loop and loops in turn: ${DIT[cause]} again after ${relances.length} relaunches${echec === undefined ? "" : `, ${direLEchec(echec)}`}. A human decides.`);
    return { fait: "arret", cause };
  }
  if (relances.length >= RELANCES_MAX) {
    const bug = await github.creerIssue({
      titre: `#${ticket.number} loops: set aside again after ${relances.length} relaunches for the same reason (${cause}${echec === undefined ? "" : `: ${direLEchec(echec).replaceAll("`", "")}`})`,
      corps: [
        `Ticket #${ticket.number} (${ticket.title}) was set aside (\`${ticket.labels.includes(ECHECS_ATTEINTS) ? ECHECS_ATTEINTS : HORS_CUISINE}\`) because ${DIT[cause]}. The kitchen relaunched it ${relances.length} times for this reason, and each cook brought it back to the same point: it is not relaunched a ${relances.length + 1}th time.`,
        "",
        "## What makes it loop",
        "",
        consigne,
        "",
        "## Relaunches",
        "",
        ...relances.map((c) => `- ${c.createdAt}`),
        "",
        `Find why a cook cannot fix this on #${ticket.number}, then fix it. The ticket stays set aside until then.`,
      ].join("\n"),
      labels: [LABEL_DU_BUG],
    });
    await github.commenter(ticket.number, `${marqueDeBoucle(cause, bug)}\nStation \`${station}\`: not relaunched — ${DIT[cause]} again after ${relances.length} relaunches for this reason. The loop is filed as #${bug}; the ticket stays set aside.`);
    return { fait: "boucle", cause, bug };
  }
  const n = relances.length + 1;
  // Le commentaire avant le label : relancé sans lui, le cook ne saurait pas quoi réparer.
  await github.commenter(ticket.number, `${marqueDeRelance(cause, n)}\nStation \`${station}\`: put back on the rail (relaunch ${n}/${RELANCES_MAX}) — ${DIT[cause]}, which a cook can fix.\n\n**What the cook must fix:** ${consigne}`);
  if (!ticket.labels.includes(LABEL)) await github.labelliser(ticket.number, [LABEL]);
  for (const label of [HORS_CUISINE, ECHECS_ATTEINTS]) if (ticket.labels.includes(label)) await github.delabelliser(ticket.number, label);
  return { fait: "relance", cause, n };
}

// Les raisons rouges que la cuisine ne relance plus : un même pas de la CI, de
// la même ligne de journal, rouge sur les PR de deux tickets différents. Relu à
// chaque tour sur les PR : il tombe dès que ce pas n'est plus rouge sur elles.
export async function disjoncteurs(tickets: readonly TicketDeCote[], contexte: ContexteDeLaGuerison): Promise<Map<string, Coupe>> {
  const groupes = new Map<string, { etape: string; ligne: string; prs: Map<number, number> }>();
  for (const ticket of tickets) {
    // Un ticket illisible ne compte pas ici : `relancer`, qui le relit, dit son échec.
    const echec = (await diagnostiquer(ticket, contexte).catch(() => null))?.echec;
    const cle = echec === undefined ? null : empreinte(echec);
    if (echec === undefined || echec.ligne === null || cle === null) continue;
    const groupe = groupes.get(cle) ?? { etape: echec.etape, ligne: echec.ligne, prs: new Map<number, number>() };
    groupe.prs.set(ticket.number, echec.pr);
    groupes.set(cle, groupe);
  }
  const coupes = new Map<string, Coupe>();
  for (const [cle, { etape, ligne, prs }] of groupes) if (prs.size >= 2) coupes.set(cle, { etape, ligne, prs: [...prs.values()].sort((a, b) => a - b) });
  return coupes;
}

// Les PR rouges déjà vues par ce process, par empreinte : de quoi couper dès le
// second ticket quand l'appelant ne liste pas tous les tickets de côté. Chaque
// PR vue est relue sur la CI avant de compter : un pas redevenu vert la sort.
const VUES = new Map<string, Map<number, { pr: number; sha: string }>>();
export const oublierLesVues = () => VUES.clear();

async function coupeVue(ticket: number, echec: EchecDeCi, cle: string, github: GitHubDeLaGuerison): Promise<Coupe | undefined> {
  const vues = VUES.get(cle) ?? new Map<number, { pr: number; sha: string }>();
  for (const [autre, { pr, sha }] of vues) {
    if (autre === ticket) continue;
    try {
      const rouge = (await github.ci(sha)).find((check) => check.outcome === "red");
      const relu = rouge === undefined ? null : await lireLEchec(github, rouge, pr, sha);
      if (relu !== null && empreinte(relu) === cle) continue;
    } catch {
      // Une PR illisible ne compte pas.
    }
    vues.delete(autre);
  }
  vues.set(ticket, { pr: echec.pr, sha: echec.sha });
  VUES.set(cle, vues);
  if (vues.size < 2 || echec.ligne === null) return undefined;
  return { etape: echec.etape, ligne: echec.ligne, prs: [...vues.values()].map((v) => v.pr).sort((a, b) => a - b) };
}
