// Ce qui attend le chef, lu de GitHub seul (#2460) : le TODO de l'app et la file que le second relaie à son ouverture
// (second/file.ts) sont cette lecture, et elle seule — la même source, les mêmes entrées, le même bloc `awaiting`
// (rail.ts, `blocAwaiting`). Ni tableau de la cuisine, ni box, ni station : il suffit de joindre GitHub.
//
// La règle du chef (#2455) : une entrée de TODO est un fait de GitHub — un label, une PR qui attend le chef — et lui pose
// toujours une question. Sont lus, sur les issues ouvertes du dépôt :
//   - une issue au label `fire` que `served-elsewhere` ou `blocked-on-human` met de côté (tableau/mise-de-cote-github.ts,
//     #2075, #2422), quand elle demande quelque chose au chef : la PR qui touche à ce qui la juge, à merger à la main ;
//     la question de produit d'un `served-elsewhere`, tant qu'aucune réponse ne la suit ; un `blocked-on-human` sans PR, à lever ;
//   - une issue au label `chef-todo` : la carte que son dernier commentaire marqué pose (tableau/todo-github.ts, #2217) ;
//     une carte dont la question ne se lit pas (pas de commentaire marqué, ou sans texte) n'est pas une entrée : elle est
//     dite au second, dans le bloc, avec pourquoi (`illisibles`) ;
//   - une issue que le manager a écartée et qui porte le label du chef — `question`, `decision`, `blocked-on-human` — : depuis
//     la pose de son label, sa carte pose la question du manager, avec ses boutons (#3370, `carteDeLEcart`).
// Une issue au label `waiting` attend un tiers, pas le chef : elle n'est jamais une entrée, quoi qu'elle porte d'autre
// (#3075) ; l'issue du tableau de la cuisine non plus.
//
// Ce qu'attend chaque issue au label `waiting` de ces listes est lu aussi (#3075) — sans liste de plus : le budget GitHub
// de l'app (budget-github.ts) ne la paie pas. Son dernier commentaire d'entrée en WAITING (vue/attente/attente-github.ts,
// `tiersDesCommentaires`) dit ce que sa carte de WAITING montre, quoi, de qui, sa relance. Une issue qui n'est pas sur le
// rail (sans `fire`, une carte `chef-todo`) y est posée, dans WAITING : mise en attente depuis TODO, elle quitte TODO et
// se montre là. Cette lecture qui échoue ne fait pas tomber celle du chef : ses cartes de WAITING ne disent pas ce
// qu'elles attendent, et le bloc dit pourquoi (`illisibles`).
//
// Chaque entrée dit sa question puis son geste, sur sa ligne du bloc, et porte ce que la carte de TODO en fait (`chef`,
// `miseDeCote`, `decision`) ; le bloc les range de la plus ancienne à la plus récente, et dit « nothing awaits the chef »
// quand il n'y en a aucune. Une lecture qui échoue n'est jamais « rien n'attend » : elle dit pourquoi.
import type { AttenduDAutrui, Tiers } from "../faits.ts";
import type { Partage } from "../vue/cartes-assignees/cartes-assignees.ts";
import type { AppelGitHub } from "./client.ts";
import type { LectureDuTableauDuDepot, LigneDeLaFile, TableauLu } from "./lecture.ts";
import { BLOCKED_ON_HUMAN, carteDeLEcart, LABEL_DU_TABLEAU_DE_LA_CUISINE, labelDeMiseDeCote, miseDeCoteDe, miseDeCoteLe, type MiseDeCote } from "./mise-de-cote-github.ts";
import { blocAwaiting } from "./rail.ts";
import type { RailBloqueLu } from "../vue/rail-bloque/rail-bloque.ts";
import { carteDuCommentaire, formeDuChef, LABEL_DU_CHEF, type CarteDuChef } from "./todo-github.ts";
import { tiersDesCommentaires } from "../vue/attente/attente-github.ts";
import { revueDuCorps, SORTE_SENSIBLE } from "../vue/carte-sensible/carte-sensible-github.ts";
import { SORTE_DE_VALIDATION, validationDuCorps } from "../vue/validation-design/validation-design-github.ts";

const LABEL_FIRE = "fire";
const LABEL_WAITING = "waiting";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;
// Ce que le manager attend du chef quand il écarte une issue qui porte son label, mot pour mot comme la box l'écrit
// (runtime/src/attend.ts, `GESTES_D_ECART_EN`).
export const ECARTS = {
  question: "set aside by the manager, it carries `question` — to decide: answer it then remove the label, the manager judges it; or close the issue",
  decision: "set aside by the manager, it carries `decision` — to decide: decide then remove the label, the manager judges it; or close the issue",
  [BLOCKED_ON_HUMAN]: "held back, it carries `blocked-on-human` — to lift: remove the label, the manager judges it; or close the issue",
} as const;

// La décision de merge d'une PR qui touche à ce qui la juge : à faire sur GitHub (decision.ts).
export type DecisionDeMerge = { quoi: "merge"; motif: "review-required"; cause: null; pr: string };
// Une entrée : son ticket, depuis quand elle attend, sa ligne — sa question, puis son geste —, et ce que sa carte de TODO
// en fait. `quoi` : d'où elle vient — une issue mise de côté, une carte `chef-todo`, un écart du manager.
export type AttenteDuChef = {
  ticket: number;
  titre: string;
  url: string;
  depuis: string;
  quoi: "mise-de-cote" | "carte" | "ecart";
  ligne: string;
  chef?: CarteDuChef;
  miseDeCote?: MiseDeCote;
  decision?: DecisionDeMerge;
  // Les logins de ses assignés sur GitHub, quand elle en a : qui elle attend, à la place du chef (vue/cartes-assignees/, #2761).
  assignes?: string[];
};
// Une issue au label `waiting` : son ticket, et ce qu'elle attend d'un tiers — nul quand son commentaire ne se lit pas.
export type EnWaiting = { ticket: number; titre: string; url: string; tiers: Tiers | null };
// Ce que la lecture rend : les entrées et l'heure de la lecture — ou pourquoi rien ne se lit. `horsLigne` : GitHub n'a
// pas été joint du tout. `enWaiting` : les issues au label `waiting`.
export type AttenteLue = { lue: true; lu: string; attentes: AttenteDuChef[]; illisibles: string[]; enWaiting: EnWaiting[] } | { lue: false; raison: string; horsLigne?: true };

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");
const date = (valeur: unknown): string | null => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : null);
const labelsDe = (issue: Brut): string[] => liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

class Refus extends Error {}
class HorsLigne extends Error {}

// La ligne d'une carte du chef : sa question, puis comment y répondre — un choix de la carte, ou ses propres mots.
function ligneDeLaCarte({ sorte, texte: dit }: CarteDuChef): string {
  const { question, choix } = formeDuChef(dit);
  if (sorte === SORTE_DE_VALIDATION && question !== null) return `${question} — on its Todo card: Validate, or Send back to the kitchen with a comment`;
  if (sorte === SORTE_SENSIBLE && question !== null) return `${question} — on its Todo card: Merge, or Send back with a note`;
  const repondre = choix.length === 0 ? "answer on its Todo card, in your own words" : `answer on its Todo card: ${choix.map(({ texte: libelle }) => `“${libelle}”`).join(" or ")} — or in your own words`;
  return `${question ?? `A ${sorte} card without its question: what does it ask you?`} — ${repondre}`;
}

// La ligne d'un ticket mis de côté au chef : sa carte — la PR à merger à la main, avec son bouton (#3368), ou la question de
// produit —, ou ce qui le retient.
function ligneDeLaMiseDeCote(miseDeCote: MiseDeCote): string {
  if (miseDeCote.chef !== undefined) return ligneDeLaCarte(miseDeCote.chef);
  return `${miseDeCote.raison === null ? "" : `${miseDeCote.raison} — `}${ECARTS[BLOCKED_ON_HUMAN]}`;
}

// Ce qui attend le chef dans `depot`, lu de GitHub. `appeler` : le `GET` de l'API — celui de l'app (sous condition, un 304
// ne coûte rien) ou le `gh` du poste, pour le second. `maintenant` : l'heure de la lecture, jusqu'à laquelle les durées
// du bloc se comptent.
// `enWaiting` : lire aussi ce qu'attend chaque issue en WAITING — ce que le rail de l'app montre ; le second et les
// notifications ne s'en servent pas, et ne paient pas sa lecture.
export async function lireCeQuiAttendLeChef(options: { depot: string; appeler: AppelGitHub; maintenant?: () => Date; enWaiting?: true }): Promise<AttenteLue> {
  const { depot, appeler } = options;
  const lire = async (chemin: string): Promise<unknown> => {
    const reponse = await appeler(chemin).catch((erreur: unknown) => {
      throw new HorsLigne(erreur instanceof Error ? erreur.message : String(erreur));
    });
    if (reponse.status !== 200) throw new Refus(`GitHub answered HTTP ${reponse.status} on ${chemin.split("?")[0]}`);
    return reponse.data;
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
    (await pages(`/repos/${depot}/issues?state=open&labels=${label}&sort=created&direction=asc`)).filter((issue) => {
      const labels = labelsDe(issue);
      return (issue.pull_request === undefined || label === LABEL_DU_CHEF) && typeof issue.number === "number" && labels.includes(label) && !labels.includes(LABEL_DU_TABLEAU_DE_LA_CUISINE);
    });
  const enAttente = (issue: Brut) => labelsDe(issue).includes(LABEL_WAITING);
  const commentaires = (numero: number) => pages(`/repos/${depot}/issues/${numero}/comments`);
  const entree = (issue: Brut) => {
    const assignes = liste(issue.assignees).flatMap(({ login }) => (typeof login === "string" ? [login] : []));
    return { ticket: issue.number as number, titre: texte(issue.title), url: texte(issue.html_url) || `https://github.com/${depot}/issues/${issue.number}`, ...(assignes.length === 0 ? {} : { assignes }) };
  };
  const creee = (issue: Brut) => date(issue.created_at) ?? new Date(0).toISOString();

  try {
    const lu = (options.maintenant ?? (() => new Date()))().toISOString();
    const attentes: AttenteDuChef[] = [];
    const dits = new Set<number>();
    const illisibles: string[] = [];
    const poser = (attente: AttenteDuChef) => {
      if (dits.has(attente.ticket)) return;
      dits.add(attente.ticket);
      attentes.push(attente);
    };
    // Les listes d'abord, puis ce que chaque issue en dit — chaque fois toutes à la fois : le `gh` du second paie chaque
    // lecture d'un processus, et son crochet a peu de temps.
    const labelsDEcart = Object.keys(ECARTS) as (keyof typeof ECARTS)[];
    const listes = await Promise.all([issuesAuLabel(LABEL_FIRE), issuesAuLabel(LABEL_DU_CHEF), ...labelsDEcart.map(issuesAuLabel)]);
    // Une issue en WAITING n'attend pas le chef : elle n'est l'entrée d'aucun label.
    const [auFeu, auChef, ...ecartees] = listes.map((issues) => issues.filter((issue) => !enAttente(issue)));
    const misesDeCote = await Promise.all(
      (auFeu ?? []).flatMap((issue) => {
        const label = labelDeMiseDeCote(labelsDe(issue));
        return label === null ? [] : [commentaires(issue.number as number).then((lus) => ({ issue, label, lus }))];
      }),
    );
    const cartes = await Promise.all((auChef ?? []).map((issue) => commentaires(issue.number as number).then((lus) => ({ issue, lus }))));
    // Les tickets du rail mis de côté qui demandent quelque chose au chef.
    for (const { issue, label, lus } of misesDeCote) {
      const miseDeCote = miseDeCoteDe(depot, label, lus);
      if (miseDeCote.auChef !== true) continue;
      poser({
        ...entree(issue),
        depuis: miseDeCoteLe(label, lus) ?? creee(issue),
        quoi: "mise-de-cote",
        ligne: ligneDeLaMiseDeCote(miseDeCote),
        miseDeCote,
        ...(miseDeCote.pr == null ? {} : { decision: { quoi: "merge", motif: "review-required", cause: null, pr: miseDeCote.pr.url } }),
        ...(miseDeCote.chef === undefined ? {} : { chef: miseDeCote.chef }),
      });
    }
    // Les cartes `chef-todo` : celle du dernier commentaire marqué.
    for (const { issue, lus } of cartes) {
      const marque = lus
        .flatMap((commentaire) => {
          const carte = carteDuCommentaire(texte(commentaire.body));
          return carte === null ? [] : [{ carte, le: date(commentaire.created_at) }];
        })
        .at(-1);
      const { ticket } = entree(issue);
      if (marque === undefined || formeDuChef(marque.carte.texte).question === null) {
        const pourquoi = marque === undefined ? "no comment marked `<!-- brigade:todo kind=… -->` says what it asks" : "its marked card has no text: nothing is asked";
        illisibles.push(`#${ticket} carries \`${LABEL_DU_CHEF}\` but is not shown in Todo: ${pourquoi} — write the question on the ticket (the chef sees it once it is written), or take the label off if it is technical`);
        continue;
      }
      // La carte « Validate its screen » (ticket 3185) : sa PR et ses captures, lues du corps de son issue.
      const design = marque.carte.sorte === SORTE_DE_VALIDATION ? validationDuCorps(depot, texte(issue.body)) : null;
      // La carte « review before merge » d'un ticket sensible (ticket 3224) : sa PR et son ticket, lus du corps de son issue.
      const sensible = marque.carte.sorte === SORTE_SENSIBLE ? revueDuCorps(depot, texte(issue.body)) : null;
      const chef = { ...marque.carte, ...(design === null ? {} : { design }), ...(sensible === null ? {} : { sensible }) };
      poser({ ...entree(issue), depuis: marque.le ?? creee(issue), quoi: "carte", ligne: ligneDeLaCarte(marque.carte), chef });
    }
    // Les écarts du manager qui ne sont pas déjà dits : depuis la pose de leur label.
    const poses = await Promise.all(
      labelsDEcart.flatMap((label, rang) =>
        (ecartees[rang] ?? [])
          .filter((issue) => !dits.has(issue.number as number) && !labelsDe(issue).includes(LABEL_WAITING))
          .map((issue) => Promise.all([pages(`/repos/${depot}/issues/${issue.number}/events`), commentaires(issue.number as number)]).then(([evenements, lus]) => ({ issue, label: label as keyof typeof ECARTS, evenements, lus }))),
      ),
    );
    // Sa carte pose la question du manager, avec ses boutons (#3370, mise-de-cote-github.ts, `carteDeLEcart`).
    for (const { issue, label, evenements, lus } of poses) {
      const pose = evenements.filter(({ event, label: lequel }) => event === "labeled" && objet(lequel)?.name === label).at(-1);
      const chef = carteDeLEcart(label, lus);
      poser({ ...entree(issue), depuis: date(pose?.created_at) ?? creee(issue), quoi: "ecart", ligne: ligneDeLaCarte(chef), chef });
    }
    // La plus ancienne d'abord, comme le bloc de la box.
    const instant = (iso: string) => Date.parse(iso);
    attentes.sort((a, b) => instant(a.depuis) - instant(b.depuis) || a.ticket - b.ticket);
    // Ce qu'attend chaque issue en WAITING : une lecture qui échoue le dit au bloc, et laisse ses cartes sans ce qu'elles
    // attendent — jamais l'attente du chef tombée avec elle.
    const attendent = [...new Map(listes.flat().filter(enAttente).map((issue) => [issue.number as number, issue])).values()];
    // Une issue dont les commentaires ne se lisent pas garde sa carte, sans ce qu'elle attend ; le bloc dit pourquoi, une fois.
    let rate: string | undefined;
    const enWaiting: EnWaiting[] = await Promise.all(
      (options.enWaiting === undefined ? [] : attendent).map(async (issue) => {
        const { ticket, titre, url } = entree(issue);
        const tiers = await commentaires(ticket).then(tiersDesCommentaires, (erreur: unknown) => {
          rate ??= (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
          return null;
        });
        return { ticket, titre, url, tiers };
      }),
    );
    if (rate !== undefined) illisibles.push(`what the \`${LABEL_WAITING}\` issues wait for was not read from GitHub: ${rate} — their WAITING cards do not say it until the next reading`);
    return { lue: true, lu, attentes, illisibles, enWaiting };
  } catch (erreur) {
    const dit = (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    const raison = `What awaits the chef in ${depot} was not read from GitHub: ${dit}.`;
    return erreur instanceof HorsLigne ? { lue: false, raison, horsLigne: true } : { lue: false, raison };
  }
}

// Les entrées comme lignes de la file, dans la forme que le bloc `awaiting` écrit (rail.ts, `blocAwaiting`).
export const fileDuChef = (attentes: readonly AttenteDuChef[]): LigneDeLaFile[] =>
  attentes.map(({ ticket, titre, depuis, quoi, ligne }) => ({ nom: `#${ticket}`, ticket, titre: titre === "" ? null : titre, quoi, depuis, ligne }));

// Le bloc `awaiting` de ce qui attend le chef, de sa tête à `end awaiting` : ce que le second relaie, et ce que le TODO
// de l'app lit.
// `railBloque` : le rail bloqué (vue/rail-bloque/, #3358), sous la tête du bloc.
export const blocDuChef = ({ lu, attentes, illisibles, depot, railBloque }: { lu: string; attentes: readonly AttenteDuChef[]; illisibles: readonly string[]; depot?: string; railBloque?: RailBloqueLu }): string[] =>
  blocAwaiting({ file: fileDuChef(attentes), bilans: [...illisibles], lu, ...(depot === undefined ? {} : { depot }), ...(railBloque === undefined ? {} : { railBloque }) });

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
export function avecLAttenteDuChef(lu: TableauLu, { attentes, illisibles, autres = [], enWaiting = [] }: { attentes: readonly AttenteDuChef[]; illisibles: readonly string[]; autres?: Partage<AttenteDuChef>["autres"]; enWaiting?: readonly EnWaiting[] }): TableauLu {
  const dit = ({ ticket, titre, url, chef, miseDeCote, decision }: AttenteDuChef) => ({
    ticket,
    titre,
    url,
    ...(miseDeCote === undefined ? {} : { miseDeCote }),
    ...(decision === undefined ? {} : { decision }),
    ...(chef === undefined ? {} : { chef }),
  });
  const attend = attentes.map(dit);
  return {
    ...lu,
    file: fileDuChef(attentes),
    bilans: [...illisibles],
    faits: { ...lu.faits, ...avecEnWaiting(lu.faits.rail, enWaiting), attend, ...(autres.length === 0 ? {} : { attendAutres: autres.map(({ attente, qui }) => ({ ...dit(attente), qui })) }), compteurs: { ...(objet(lu.faits.compteurs) ?? {}), attend: attend.length } },
  };
}

// La lecture du rail, avec ce qui attend le chef lu de GitHub comme le second le lit (main.ts) : l'app ne dit jamais autre
// chose que lui. Pas lu : une lecture ratée, jamais un TODO vide. `partager` : les cartes qui attendent le compte connecté,
// et celles qui attendent un autre humain (vue/cartes-assignees/, #2761, #2985).
export async function avecCeQuiAttendLeChef(lu: LectureDuTableauDuDepot, appeler: AppelGitHub, partager?: (attentes: AttenteDuChef[]) => Promise<Partage<AttenteDuChef>>): Promise<LectureDuTableauDuDepot> {
  if (!lu.lu) return lu;
  const attente = await lireCeQuiAttendLeChef({ depot: lu.depot, appeler, maintenant: () => new Date(lu.luLe), enWaiting: true });
  if (!attente.lue) return { lu: false, depot: lu.depot, luLe: lu.luLe, raison: attente.raison, ...(attente.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  if (partager === undefined) return avecLAttenteDuChef(lu, attente);
  const { siennes, autres } = await partager(attente.attentes);
  return avecLAttenteDuChef(lu, { ...attente, attentes: siennes, autres });
}
