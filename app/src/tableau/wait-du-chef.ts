// Ce qui attend le chef, lu de GitHub seul (#2460) : le TODO de l'app et la file que le second relaie à son ouverture
// (second/file.ts) sont cette lecture, et elle seule — la même source, les mêmes entrées, le même bloc `awaiting`
// (rail.ts, `blocAwaiting`). Ni tableau de la cuisine, ni box, ni station : il suffit de joindre GitHub.
//
// La règle du chef (#2455) : une entrée de TODO est un fait de GitHub — un label, une PR qui attend le chef — et lui pose
// toujours une question. Sont lus, sur les issues ouvertes du dépôt :
//   - une issue au label `fire` que `served-elsewhere` met de côté (tableau/mise-de-side-github.ts, #2075, #2422), quand
//     elle demande quelque chose au chef : la question de produit d'un `served-elsewhere`, tant qu'aucune réponse ne la suit ;
//   - une issue au label `chef-todo` : la carte que son dernier commentaire marqué pose (tableau/todo-github.ts, #2217) ;
//     une carte dont la question ne se lit pas (pas de commentaire marqué, ou sans texte) n'est pas une entrée : elle est
//     dite au second, dans le bloc, avec pourquoi (`illisibles`) ;
//   - une issue parquée pour le chef par un label d'attente d'avant parked (#4129, `LABELS_D_AVANT_PARKED_SANS_CARTE` de
//     runtime/src/github-etat/etats.ts, seul module qui les nomme) : depuis la pose de son label, sa carte pose la question
//     du manager, avec ses boutons (#3370, `carteDeLEcart`).
//   - une épique ouverte (`epic`) dont la dernière parole du manager est une question avant de la découper, tant qu'aucune
//     réponse ne la suit : sa carte pose cette question, avec ses choix en boutons (tableau/question-d-epic-github.ts) ;
// Une issue au label `parked` attend quelqu'un d'autre que le chef : elle n'est jamais une entrée, quoi qu'elle porte
// d'autre (#3075, #4129) ; l'issue du tableau de la cuisine non plus.
//
// Ce qu'attend chaque issue au label `parked` de ces listes est lu aussi (#3075), et de la liste des issues au label
// `parked`, quand `enWaiting` le demande (#3814). Son dernier commentaire de parking (vue/wait/wait-github.ts,
// `tiersDesCommentaires`) dit ce que sa carte de WAITING montre, quoi, de qui, sa relance. Une issue qui n'est pas sur le
// rail (sans `fire`, une carte `chef-todo`) y est posée, dans WAITING : mise en attente depuis TODO, elle quitte TODO et
// se montre là. Cette lecture qui échoue ne fait pas tomber celle du chef : ses cartes de WAITING ne disent pas ce
// qu'elles attendent, et le bloc dit pourquoi (`illisibles`).
// Le bloc dit aussi chaque issue en WAITING dont l'attente se lit, une ligne chacune sous les entrées : ce qu'elle attend,
// de qui, et sa relance (#3814) — sans être une entrée : elle ne demande rien au chef. Elle se lit de la marque que la station,
// le second et l'app posent (runtime/src/attente-github/marque.ts, `corpsDuParking`).
//
// Chaque entrée dit sa question puis son geste, sur sa ligne du bloc, et porte ce que la carte de TODO en fait (`chef`,
// `miseDeCote`) ; le bloc les range de la plus ancienne à la plus récente, et dit « nothing awaits the chef »
// quand il n'y en a aucune. Une lecture qui échoue n'est jamais « rien n'attend » : elle dit pourquoi.
import type { AttenduDAutrui, Tiers } from "../facts.ts";
import type { Partage } from "../vue/cards-assignees/cards-assignees.ts";
import type { CallGitHub } from "./client.ts";
import type { ReadDuTableauDuRepository, LineDeLaFile, TableauLu } from "./read.ts";
import { LABEL_PARKED } from "../../../runtime/src/attente-github/marque.ts";
import { LABELS_D_AVANT_PARKED_SANS_CARTE } from "../../../runtime/src/github-etat/etats.ts";
import { cardDeLEcart, LABEL_DU_TABLEAU_DE_LA_KITCHEN, labelDeMiseDeSide, miseDeSideDe, miseDeSideLe, recommandeeDe, type MiseDeSide } from "./mise-de-side-github.ts";
import { blocAwaiting } from "./rail.ts";
import type { RailBlockedLu } from "../vue/rail-blocked/rail-blocked.ts";
import { cardDeLaQuestionDEpic, EPIC_LABEL, questionDEpicLe } from "./question-d-epic-github.ts";
import { cardDuComment, formeDuChef, LABEL_DU_CHEF, type CardDuChef } from "./todo-github.ts";
import { tiersDesCommentaires } from "../vue/wait/wait-github.ts";
import { revueDuCorps, SORTE_SENSITIVE } from "../vue/card-sensitive/card-sensitive-github.ts";
import { SORTE_DE_VALIDATION, validationDuCorps } from "../vue/validation-design/validation-design-github.ts";

const LABEL_FIRE = "fire";
// Parqué (`parked`, #4129) : il attend quelqu'un d'autre que le chef — jamais une entrée, une carte du chef parquée pour un
// autre comprise. Parqué pour le chef, il ne porte que `chef-todo` : une entrée.
const awaitingUnAutre = (labels: readonly string[]) => labels.includes(LABEL_PARKED);
// Les auteurs dont le runtime croit une marque (runtime/src/alimenter.ts, `DE_CONFIANCE`).
const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];
// La marque d'un commentaire de parking (runtime/src/attente-github/marque.ts), ou `waiting`, d'avant #4129.
const MARQUE_DE_PARKING = /^<!-- brigade:(?:parked|waiting) (\{.*?\}) -->/;
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;
// Une entrée : son ticket, depuis quand elle attend, sa ligne — sa question, puis son geste —, et ce que sa carte de TODO
// en fait. `quoi` : d'où elle vient — une issue mise de côté, une carte `chef-todo`, une issue parquée pour le chef par un
// label d'avant parked.
export type WaitDuChef = {
  ticket: number;
  titre: string;
  url: string;
  depuis: string;
  quoi: "mise-de-cote" | "carte" | "ecart";
  ligne: string;
  chef?: CardDuChef;
  miseDeCote?: MiseDeSide;
  // Les logins de ses assignés sur GitHub, quand elle en a : qui elle attend, à la place du chef (vue/cards-assignees/, #2761).
  assignes?: string[];
};
// Une issue au label `parked` : son ticket, et ce qu'elle attend d'un tiers — nul quand son commentaire ne se lit pas.
export type EnWaiting = { ticket: number; titre: string; url: string; tiers: Tiers | null };
// Ce que la lecture rend : les entrées et l'heure de la lecture — ou pourquoi rien ne se lit. `horsLigne` : GitHub n'a
// pas été joint du tout. `enWaiting` : les issues au label `parked`. `illisibles` : les lignes du bloc qui ne sont pas des
// entrées — ce qui ne se lit pas, et chaque issue en WAITING avec ce qu'elle attend (#3814).
export type WaitLue = { lue: true; lu: string; attentes: WaitDuChef[]; illisibles: string[]; enWaiting: EnWaiting[] } | { lue: false; raison: string; horsLigne?: true };

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");
const date = (valeur: unknown): string | null => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const labelsDe = (issue: Brut): string[] => liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

// Ce qu'une issue parquée attend, d'après son dernier commentaire de parking : la marque `<!-- brigade:parked … -->` (ou
// `waiting`, d'avant #4129) que la station, le second et l'app posent, d'un auteur du dépôt, ou le commentaire de l'app
// d'avant. `rentre` : parquée jusqu'à une date, elle reprend seule où elle était à cette date.
// Null sans aucun qui se lise : rien n'est inventé.
function waitDeLIssue(commentaires: readonly Brut[]): { quoi: string; qui: string; relance: string | null; rentre: boolean } | null {
  for (const comment of [...commentaires].reverse()) {
    const brut = DE_CONFIANCE.includes(texte(comment.author_association)) ? MARQUE_DE_PARKING.exec(texte(comment.body))?.[1] : undefined;
    if (brut !== undefined) {
      try {
        const { what, who, followUp, fact } = objet(JSON.parse(brut)) ?? {};
        // Parqué jusqu'à une date, il reprend seul à cette date (#4129) ; jusqu'à un fait, il attend qu'on le dise arrivé.
        if (typeof what === "string" && typeof who === "string" && date(followUp) !== null) return { quoi: what, qui: who, relance: followUp as string, rentre: typeof fact !== "string" };
      } catch {
        // Une marque illisible ne dit rien : la précédente, s'il y en a une.
      }
      continue;
    }
    const tiers = tiersDesCommentaires([comment]);
    if (tiers !== null) return { quoi: tiers.quoi, qui: tiers.qui, relance: tiers.relance, rentre: false };
  }
  return null;
}

// La ligne du bloc d'une issue en WAITING : ce qu'elle attend, de qui, sa relance — la date avec son année.
const relanceDite = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
// Une issue en WAITING dont aucun commentaire ne dit l'attente n'a pas de ligne : rien à montrer, comme avant.
function lineEnWaiting(ticket: number, titre: string, wait: NonNullable<ReturnType<typeof waitDeLIssue>>): string {
  const relance = wait.relance === null ? "" : ` — ${wait.rentre ? "resumes where it was on its own on" : "follow-up on"} ${relanceDite(new Date(wait.relance).toISOString())}`;
  return `#${ticket}  WAITING  awaiting ${wait.qui}: “${wait.quoi}”${relance} — it does not await you${titre === "" ? "" : `  ${titre}`}`;
}

class Refusal extends Error {}
class OutsideLine extends Error {}

// La ligne d'une carte du chef : sa question, puis comment y répondre — un choix de la carte, ou ses propres mots.
function lineDeLaCard({ sorte, texte: dit }: CardDuChef): string {
  const { question, choix: choice } = formeDuChef(dit);
  if (sorte === SORTE_DE_VALIDATION && question !== null) return `${question} — on its Todo card: Validate, or Send back to the kitchen with a comment`;
  if (sorte === SORTE_SENSITIVE && question !== null) return `${question} — on its Todo card: Merge, or Send back with a note`;
  const repondre = choice.length === 0 ? "answer on its Todo card, in your own words" : `answer on its Todo card: ${choice.map(({ texte: libelle }) => `“${libelle}”`).join(" or ")} — or in your own words`;
  return `${question ?? `A ${sorte} card without its question: what does it ask you?`} — ${repondre}`;
}

// Ce qui attend le chef dans `depot`, lu de GitHub. `appeler` : le `GET` de l'API — celui de l'app (sous condition, un 304
// ne coûte rien) ou le `gh` du poste, pour le second. `maintenant` : l'heure de la lecture, jusqu'à laquelle les durées
// du bloc se comptent.
// `enWaiting` : lire aussi ce qu'attend chaque issue en WAITING — ce que le rail de l'app montre, et les lignes de WAITING
// du bloc (#3814) ; les notifications ne s'en servent pas, et ne paient pas sa lecture. `true` lit aussi la liste des
// issues au label `parked` : le second, qui lit la file une fois par session, y voit chaque ticket parqué et sa
// relance. `"du-rail"` s'en tient aux issues parquées des listes déjà lues — un ticket que la cuisine parque
// garde `fire` —, pour l'app, qui relit chaque projet toutes les trente secondes sous son budget GitHub (budget-github.ts).
// `epiquesAvantLeRail` : les épiques sans `fire` que la lecture du rail a dites (`avantLeRail`) — sans elles, seules les épiques
// au label `fire` posent leur question.
export async function lireCeQuiAwaitingLeChef(options: { depot: string; appeler: CallGitHub; maintenant?: () => Date; enWaiting?: boolean | "du-rail"; epiquesAvantLeRail?: readonly { ticket: number; titre: string }[] }): Promise<WaitLue> {
  const { depot: repository, appeler } = options;
  const lire = async (chemin: string): Promise<unknown> => {
    const answer = await appeler(chemin).catch((error: unknown) => {
      throw new OutsideLine(error instanceof Error ? error.message : String(error));
    });
    if (answer.status !== 200) throw new Refusal(`GitHub answered HTTP ${answer.status} on ${chemin.split("?")[0]}`);
    return answer.data;
  };
  // Une liste, page après page, jusqu'à une page qui n'est pas pleine.
  const pages = async (chemin: string): Promise<Brut[]> => {
    const toutes: Brut[] = [];
    for (let page = 1; page <= PAGES_AU_PLUS; page++) {
      const lue = liste(await lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=${PAR_PAGE}&page=${page}`));
      toutes.push(...lue);
      if (lue.length < PAR_PAGE) break;
    }
    return toutes;
  };
  // Les issues ouvertes qui portent `label` — la vérification tient même d'une réponse que GitHub n'aurait pas filtrée.
  // Une PR de fork porte sa carte `chef-todo` elle-même (runtime/src/pr-externe/pr-externe.ts) : seule cette liste la garde.
  const issuesAuLabel = async (label: string) =>
    (await pages(`/repos/${repository}/issues?state=open&labels=${label}&sort=created&direction=asc`)).filter((issue) => {
      const labels = labelsDe(issue);
      return (issue.pull_request === undefined || label === LABEL_DU_CHEF) && typeof issue.number === "number" && labels.includes(label) && !labels.includes(LABEL_DU_TABLEAU_DE_LA_KITCHEN);
    });
  const queued = (issue: Brut) => awaitingUnAutre(labelsDe(issue));
  const commentaires = (numero: number) => pages(`/repos/${repository}/issues/${numero}/comments`);
  const entree = (issue: Brut) => {
    const assignes = liste(issue.assignees).flatMap(({ login }) => (typeof login === "string" ? [login] : []));
    return { ticket: issue.number as number, titre: texte(issue.title), url: texte(issue.html_url) || `https://github.com/${repository}/issues/${issue.number}`, ...(assignes.length === 0 ? {} : { assignes }) };
  };
  const creee = (issue: Brut) => date(issue.created_at) ?? new Date(0).toISOString();

  try {
    const lu = (options.maintenant ?? (() => new Date()))().toISOString();
    const attentes: WaitDuChef[] = [];
    const dits = new Set<number>();
    const illisibles: string[] = [];
    const poser = (wait: WaitDuChef) => {
      if (dits.has(wait.ticket)) return;
      dits.add(wait.ticket);
      attentes.push(wait);
    };
    // Les listes d'abord, puis ce que chaque issue en dit — chaque fois toutes à la fois : le `gh` du second paie chaque
    // lecture d'un processus, et son crochet a peu de temps.
    const labelsDEcart = LABELS_D_AVANT_PARKED_SANS_CARTE;
    const listes = await Promise.all([issuesAuLabel(LABEL_FIRE), issuesAuLabel(LABEL_DU_CHEF), ...labelsDEcart.map(issuesAuLabel)]);
    // Une issue en WAITING n'attend pas le chef : elle n'est l'entrée d'aucun label.
    const [auFeu, auChef, ...ecartees] = listes.map((issues) => issues.filter((issue) => !queued(issue)));
    const misesDeSide = await Promise.all(
      (auFeu ?? []).flatMap((issue) => {
        const label = labelDeMiseDeSide(labelsDe(issue));
        return label === null ? [] : [commentaires(issue.number as number).then((lus) => ({ issue, label, lus }))];
      }),
    );
    const cards = await Promise.all((auChef ?? []).map((issue) => commentaires(issue.number as number).then((lus) => ({ issue, lus }))));
    // Les épiques : celles du rail, déjà lues avec `fire`, et celles que la lecture du rail dit avant lui — aucune lecture de plus
    // (le budget GitHub de l'app, budget-github.ts).
    const epics = [
      ...(auFeu ?? []).filter((issue) => labelsDe(issue).includes(EPIC_LABEL)),
      ...(options.epiquesAvantLeRail ?? []).map(({ ticket, titre }): Brut => ({ number: ticket, title: titre, labels: [{ name: EPIC_LABEL }] })),
    ].filter((issue, rang, toutes) => toutes.findIndex(({ number }) => number === issue.number) === rang);
    const epicsLues = await Promise.all(epics.map((issue) => commentaires(issue.number as number).then((lus) => ({ issue, lus }))));
    // Les tickets du rail mis de côté qui demandent quelque chose au chef : la question de produit qu'ils posent.
    for (const { issue, label, lus } of misesDeSide) {
      const miseDeSide = miseDeSideDe(repository, label, lus, issue.number as number);
      if (miseDeSide.chef === undefined) continue;
      poser({ ...entree(issue), depuis: miseDeSideLe(label, lus) ?? creee(issue), quoi: "mise-de-cote", ligne: lineDeLaCard(miseDeSide.chef), miseDeCote: miseDeSide, chef: miseDeSide.chef });
    }
    // Les cartes `chef-todo` : celle du dernier commentaire marqué.
    for (const { issue, lus } of cards) {
      const marque = lus
        .flatMap((comment) => {
          const card = cardDuComment(texte(comment.body));
          return card === null ? [] : [{ carte: card, corps: texte(comment.body), le: date(comment.created_at) }];
        })
        .at(-1);
      const { ticket } = entree(issue);
      if (marque === undefined || formeDuChef(marque.carte.texte).question === null) {
        const pourquoi = marque === undefined ? "no comment marked `<!-- brigade:todo kind=… -->` says what it asks" : "its marked card has no text: nothing is asked";
        illisibles.push(`#${ticket} carries \`${LABEL_DU_CHEF}\` but is not shown in Todo: ${pourquoi} — write the question on the ticket (the chef sees it once it is written), or take the label off if it is technical`);
        continue;
      }
      // La carte « Validate its screen » (ticket 3185) : sa PR et ses captures, lues du corps de son issue — ou du commentaire
      // de la carte, quand la validation est demandée sur le ticket même (ticket 3615).
      const design = marque.carte.sorte === SORTE_DE_VALIDATION ? (validationDuCorps(repository, texte(issue.body)) ?? validationDuCorps(repository, marque.corps)) : null;
      // La carte « review before merge » d'un ticket sensible (ticket 3224) : sa PR et son ticket, lus du corps de son issue —
      // ou du commentaire de la carte (ticket 3615).
      const sensitive = marque.carte.sorte === SORTE_SENSITIVE ? (revueDuCorps(repository, texte(issue.body)) ?? revueDuCorps(repository, marque.corps)) : null;
      // La carte d'une question du manager, qui parque l'issue pour le chef (#4129) : la réponse qu'il recommande, comme sur
      // un écart (#3434) — sa ligne `Recommended:` quitte le texte. Sans elle, la carte est comme toute autre.
      const forme = formeDuChef(marque.carte.texte.replace(/\*\*/g, ""));
      const recommandee = recommandeeDe(forme.contexte, forme.choix);
      const texteDeLaCard = recommandee === null ? marque.carte.texte : [forme.question ?? "", ...forme.choix.map(({ texte: libelle, suite }) => `- [${suite}] ${libelle}`), ...(recommandee.contexte === "" ? [] : ["", recommandee.contexte])].join("\n");
      const chef = { ...marque.carte, texte: texteDeLaCard, ...(recommandee === null ? {} : { recommandee: recommandee.recommandee }), ...(design === null ? {} : { design }), ...(sensitive === null ? {} : { sensible: sensitive }) };
      poser({ ...entree(issue), depuis: marque.le ?? creee(issue), quoi: "carte", ligne: lineDeLaCard(marque.carte), chef });
    }
    // Les épiques dont le manager attend la réponse du chef avant de les découper, si aucune carte ne les dit déjà.
    for (const { issue, lus } of epicsLues) {
      if (dits.has(issue.number as number)) continue;
      const chef = cardDeLaQuestionDEpic(lus);
      if (chef !== null) poser({ ...entree(issue), depuis: questionDEpicLe(lus) ?? creee(issue), quoi: "carte", ligne: lineDeLaCard(chef), chef });
    }
    // Les issues parquées pour le chef par un label d'avant parked, qui ne sont pas déjà dites : depuis la pose de leur label.
    const poses = await Promise.all(
      labelsDEcart.flatMap((label, rang) =>
        (ecartees[rang] ?? [])
          .filter((issue) => !dits.has(issue.number as number) && !awaitingUnAutre(labelsDe(issue)))
          .map((issue) => Promise.all([pages(`/repos/${repository}/issues/${issue.number}/events`), commentaires(issue.number as number)]).then(([events, lus]) => ({ issue, label, evenements: events, lus }))),
      ),
    );
    // Sa carte pose la question du manager, avec ses boutons (#3370, mise-de-side-github.ts, `carteDeLEcart`).
    for (const { issue, label, evenements: events, lus } of poses) {
      const pose = events.filter(({ event, label: lequel }) => event === "labeled" && objet(lequel)?.name === label).at(-1);
      const chef = cardDeLEcart(label, lus);
      poser({ ...entree(issue), depuis: date(pose?.created_at) ?? creee(issue), quoi: "ecart", ligne: lineDeLaCard(chef), chef });
    }
    // La plus ancienne d'abord, comme le bloc de la box.
    const instant = (iso: string) => Date.parse(iso);
    attentes.sort((a, b) => instant(a.depuis) - instant(b.depuis) || a.ticket - b.ticket);
    // Ce qu'attend chaque issue parquée : une lecture qui échoue le dit au bloc, et laisse ses cartes sans ce qu'elles
    // attendent — jamais l'attente du chef tombée avec elle.
    // Avec `enWaiting`, la liste des issues au label `parked` aussi : une issue parquée que rien d'autre ne liste a sa
    // ligne dans le bloc (#3814).
    // Cette liste qui ne se lit pas ne fait pas tomber la lecture du chef : le bloc le dit, et s'en tient aux autres listes.
    const auWaiting =
      options.enWaiting === true
        ? await issuesAuLabel(LABEL_PARKED).catch((error: unknown) => {
            illisibles.push(`the \`${LABEL_PARKED}\` issues were not listed from GitHub: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? ""} — only those on the rail or in Todo say what they wait for, until the next reading`);
            return [];
          })
        : [];
    const attendent = [...new Map([...listes.flat(), ...auWaiting].filter(queued).map((issue) => [issue.number as number, issue])).values()].sort((a, b) => (a.number as number) - (b.number as number));
    // Une issue dont les commentaires ne se lisent pas garde sa carte, sans ce qu'elle attend ; le bloc dit pourquoi, une fois.
    let rate: string | undefined;
    const linesEnWaiting: string[] = [];
    const enWaiting: EnWaiting[] = await Promise.all(
      (!options.enWaiting ? [] : attendent).map(async (issue) => {
        const { ticket, titre, url } = entree(issue);
        const lus = await commentaires(ticket).catch((error: unknown) => {
          rate ??= (error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
          return null;
        });
        const wait = lus === null ? null : waitDeLIssue(lus);
        if (wait !== null) linesEnWaiting[attendent.indexOf(issue)] = lineEnWaiting(ticket, titre, wait);
        return { ticket, titre, url, tiers: lus === null ? null : tiersDesCommentaires(lus) };
      }),
    );
    illisibles.push(...linesEnWaiting.filter((line) => line !== undefined));
    if (rate !== undefined) illisibles.push(`what the \`${LABEL_PARKED}\` issues wait for was not read from GitHub: ${rate} — their WAITING cards do not say it until the next reading`);
    return { lue: true, lu, attentes, illisibles, enWaiting };
  } catch (error) {
    const dit = (error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    const raison = `What awaits the chef in ${repository} was not read from GitHub: ${dit}.`;
    return error instanceof OutsideLine ? { lue: false, raison, horsLigne: true } : { lue: false, raison };
  }
}

// Les entrées comme lignes de la file, dans la forme que le bloc `awaiting` écrit (rail.ts, `blocAwaiting`).
export const fileDuChef = (attentes: readonly WaitDuChef[]): LineDeLaFile[] =>
  attentes.map(({ ticket, titre, depuis, quoi, ligne: line }) => ({ nom: `#${ticket}`, ticket, titre: titre === "" ? null : titre, quoi, depuis, ligne: line }));

// Le bloc `awaiting` de ce qui attend le chef, de sa tête à `end awaiting` : ce que le second relaie, et ce que le TODO
// de l'app lit.
// `railBloque` : le rail bloqué (vue/rail-blocked/, #3358), sous la tête du bloc.
export const blocDuChef = ({ lu, attentes, illisibles, depot: repository, railBloque: railBlocked }: { lu: string; attentes: readonly WaitDuChef[]; illisibles: readonly string[]; depot?: string; railBloque?: RailBlockedLu }): string[] =>
  blocAwaiting({ file: fileDuChef(attentes), bilans: [...illisibles], lu, ...(repository === undefined ? {} : { depot: repository }), ...(railBlocked === undefined ? {} : { railBloque: railBlocked }) });

// Le rail, avec ce qu'attend chaque issue en WAITING : rien à changer sans elles.
function avecEnWaiting(rail: unknown, enWaiting: readonly EnWaiting[]): { rail?: Brut[] } {
  if (enWaiting.length === 0) return {};
  const lus = liste(rail);
  const surLeRail = new Set(lus.map(({ ticket }) => ticket));
  const sien = new Map(enWaiting.map((issue) => [issue.ticket, issue]));
  const tiersDe = (tiers: Tiers | null) => (tiers === null ? {} : { tiers });
  return {
    rail: [
      ...lus.map((ticket) => {
        const issue = typeof ticket.ticket === "number" ? sien.get(ticket.ticket) : undefined;
        return issue === undefined || ticket.etat !== "WAITING" ? ticket : { ...ticket, ...tiersDe(issue.tiers) };
      }),
      ...enWaiting.filter(({ ticket }) => !surLeRail.has(ticket)).map(({ ticket, titre, url, tiers }) => ({ ticket, etat: "WAITING", titre, url, ...tiersDe(tiers) })),
    ],
  };
}

// La lecture du rail, dont ce qui attend le chef est cette lecture, et rien d'autre : la file du bloc `awaiting` de
// `status` et `faits.attend`, que TODO dessine, dans le même ordre. `autres` : les entrées qui attendent un autre humain
// que le compte connecté, que TODO replie sous « Awaiting others » (`faits.attendAutres`, ticket 2985) — hors de la file.
// Les issues en WAITING (`enWaiting`, #3075) : un ticket du rail en WAITING porte ce qu'il attend (`tiers`) ; une issue
// qui n'est pas sur le rail y est posée, en WAITING, pour que sa carte y soit.
export function avecLWaitDuChef(lu: TableauLu, { attentes, illisibles, autres = [], enWaiting = [] }: { attentes: readonly WaitDuChef[]; illisibles: readonly string[]; autres?: Partage<WaitDuChef>["autres"]; enWaiting?: readonly EnWaiting[] }): TableauLu {
  const dit = ({ ticket, titre, url, chef, miseDeCote: miseDeSide }: WaitDuChef) => ({
    ticket,
    titre,
    url,
    ...(miseDeSide === undefined ? {} : { miseDeCote: miseDeSide }),
    ...(chef === undefined ? {} : { chef }),
  });
  const awaiting = attentes.map(dit);
  return {
    ...lu,
    file: fileDuChef(attentes),
    bilans: [...illisibles],
    faits: { ...lu.faits, ...avecEnWaiting(lu.faits.rail, enWaiting), attend: awaiting, ...(autres.length === 0 ? {} : { attendAutres: autres.map(({ attente: wait, qui }) => ({ ...dit(wait), qui })) }), compteurs: { ...(objet(lu.faits.compteurs) ?? {}), attend: awaiting.length } },
  };
}

// La lecture du rail, avec ce qui attend le chef lu de GitHub comme le second le lit (main.ts) : l'app ne dit jamais autre
// chose que lui. Pas lu : une lecture ratée, jamais un TODO vide. `partager` : les cartes qui attendent le compte connecté,
// et celles qui attendent un autre humain (vue/cards-assignees/, #2761, #2985).
export async function avecCeQuiAwaitingLeChef(lu: ReadDuTableauDuRepository, appeler: CallGitHub, partager?: (attentes: WaitDuChef[]) => Promise<Partage<WaitDuChef>>): Promise<ReadDuTableauDuRepository> {
  if (!lu.lu) return lu;
  const epicsAvantLeRail = (lu.avantLeRail?.issues ?? []).filter(({ etat: state }) => state === "epique").map(({ ticket, titre }) => ({ ticket, titre }));
  const wait = await lireCeQuiAwaitingLeChef({ depot: lu.depot, appeler, maintenant: () => new Date(lu.luLe), enWaiting: "du-rail", epiquesAvantLeRail: epicsAvantLeRail });
  if (!wait.lue) return { lu: false, depot: lu.depot, luLe: lu.luLe, raison: wait.raison, ...(wait.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  if (partager === undefined) return avecLWaitDuChef(lu, wait);
  const { siennes, autres } = await partager(wait.attentes);
  return avecLWaitDuChef(lu, { ...wait, attentes: siennes, autres });
}
