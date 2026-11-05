// Ce qui attend le chef, lu de GitHub seul (#2460) : le TODO de l'app et la file que le second relaie à son ouverture
// (second/file.ts) sont cette lecture, et elle seule — la même source, les mêmes entrées, le même bloc `awaiting`
// (rail.ts, `blocAwaiting`). Ni tableau de la cuisine, ni box, ni station : il suffit de joindre GitHub.
//
// La règle du chef (#2455) : une entrée de TODO est un fait de GitHub — un label, une PR qui attend le chef — et lui pose
// toujours une question. Sont lus, sur les issues ouvertes du dépôt :
//   - une issue au label `fire` que `hors-cuisine` ou `blocked-on-human` met de côté (tableau/mise-de-cote-github.ts,
//     #2075, #2422), quand elle demande quelque chose au chef : la PR qui touche à ce qui la juge, à merger à la main ;
//     la question de produit d'un `hors-cuisine`, tant qu'aucune réponse ne la suit ; un `blocked-on-human` sans PR, à lever ;
//   - une issue au label `chef-todo` : la carte que son dernier commentaire marqué pose (tableau/todo-github.ts, #2217) ;
//     une carte dont la question ne se lit pas (pas de commentaire marqué, ou sans texte) n'est pas une entrée : elle est
//     dite au second, dans le bloc, avec pourquoi (`illisibles`) ;
//   - une issue que le manager a écartée et qui porte le label du chef — `question`, `decision`, `blocked-on-human` —, dans
//     les mots du bloc `awaiting` de la box (runtime/src/attend.ts, `GESTES_D_ECART_EN`) : depuis la pose de son label.
// Une issue au label `waiting` attend un tiers, pas le chef ; l'issue du tableau de la cuisine n'est jamais une entrée.
//
// Chaque entrée dit sa question puis son geste, sur sa ligne du bloc, et porte ce que la carte de TODO en fait (`chef`,
// `miseDeCote`, `decision`) ; le bloc les range de la plus ancienne à la plus récente, et dit « nothing awaits the chef »
// quand il n'y en a aucune. Une lecture qui échoue n'est jamais « rien n'attend » : elle dit pourquoi.
import type { LigneDeLaFile } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { AppelGitHub } from "./client.ts";
import type { TableauLu } from "./lecture.ts";
import { BLOCKED_ON_HUMAN, LABEL_DU_TABLEAU_DE_LA_CUISINE, labelDeMiseDeCote, miseDeCoteDe, miseDeCoteLe, type MiseDeCote } from "./mise-de-cote-github.ts";
import { blocAwaiting } from "./rail.ts";
import { carteDuCommentaire, formeDuChef, LABEL_DU_CHEF, type CarteDuChef } from "./todo-github.ts";

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

// La décision de merge d'une PR qui touche à ce qui la juge : le geste `merge the PR` de sa carte (decision.ts).
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
};
// Ce que la lecture rend : les entrées et l'heure de la lecture — ou pourquoi rien ne se lit. `horsLigne` : GitHub n'a
// pas été joint du tout.
export type AttenteLue = { lue: true; lu: string; attentes: AttenteDuChef[]; illisibles: string[] } | { lue: false; raison: string; horsLigne?: true };

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
  const repondre = choix.length === 0 ? "answer on its Todo card, in your own words" : `answer on its Todo card: ${choix.map(({ texte: libelle }) => `“${libelle}”`).join(" or ")} — or in your own words`;
  return `${question ?? `A ${sorte} card without its question: what does it ask you?`} — ${repondre}`;
}

// La ligne d'un ticket mis de côté au chef : la PR à merger à la main, la question de produit, ou ce qui le retient.
function ligneDeLaMiseDeCote(miseDeCote: MiseDeCote): string {
  if (miseDeCote.chef !== undefined) return ligneDeLaCarte(miseDeCote.chef);
  if (miseDeCote.pr != null) return `${miseDeCote.raison ?? `Merge PR #${miseDeCote.pr.numero} by hand?`} — merge PR #${miseDeCote.pr.numero} with \`merge the PR\` on its Todo card, or on GitHub`;
  return `${miseDeCote.raison === null ? "" : `${miseDeCote.raison} — `}${ECARTS[BLOCKED_ON_HUMAN]}`;
}

// Ce qui attend le chef dans `depot`, lu de GitHub. `appeler` : le `GET` de l'API — celui de l'app (sous condition, un 304
// ne coûte rien) ou le `gh` du poste, pour le second. `maintenant` : l'heure de la lecture, jusqu'à laquelle les durées
// du bloc se comptent.
export async function lireCeQuiAttendLeChef(options: { depot: string; appeler: AppelGitHub; maintenant?: () => Date }): Promise<AttenteLue> {
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
  const issuesAuLabel = async (label: string) =>
    (await pages(`/repos/${depot}/issues?state=open&labels=${label}&sort=created&direction=asc`)).filter((issue) => {
      const labels = labelsDe(issue);
      return issue.pull_request === undefined && typeof issue.number === "number" && labels.includes(label) && !labels.includes(LABEL_DU_TABLEAU_DE_LA_CUISINE);
    });
  const commentaires = (numero: number) => pages(`/repos/${depot}/issues/${numero}/comments`);
  const entree = (issue: Brut) => ({ ticket: issue.number as number, titre: texte(issue.title), url: texte(issue.html_url) || `https://github.com/${depot}/issues/${issue.number}` });
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
    const [auFeu, auChef, ...ecartees] = await Promise.all([issuesAuLabel(LABEL_FIRE), issuesAuLabel(LABEL_DU_CHEF), ...labelsDEcart.map(issuesAuLabel)]);
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
      poser({ ...entree(issue), depuis: marque.le ?? creee(issue), quoi: "carte", ligne: ligneDeLaCarte(marque.carte), chef: marque.carte });
    }
    // Les écarts du manager qui ne sont pas déjà dits : depuis la pose de leur label.
    const poses = await Promise.all(
      labelsDEcart.flatMap((label, rang) =>
        (ecartees[rang] ?? [])
          .filter((issue) => !dits.has(issue.number as number) && !labelsDe(issue).includes(LABEL_WAITING))
          .map((issue) => pages(`/repos/${depot}/issues/${issue.number}/events`).then((evenements) => ({ issue, label: label as keyof typeof ECARTS, evenements }))),
      ),
    );
    for (const { issue, label, evenements } of poses) {
      const pose = evenements.filter(({ event, label: lequel }) => event === "labeled" && objet(lequel)?.name === label).at(-1);
      poser({ ...entree(issue), depuis: date(pose?.created_at) ?? creee(issue), quoi: "ecart", ligne: ECARTS[label] });
    }
    // La plus ancienne d'abord, comme le bloc de la box.
    const instant = (iso: string) => Date.parse(iso);
    attentes.sort((a, b) => instant(a.depuis) - instant(b.depuis) || a.ticket - b.ticket);
    return { lue: true, lu, attentes, illisibles };
  } catch (erreur) {
    const dit = (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    const raison = `What awaits the chef in ${depot} was not read from GitHub: ${dit}.`;
    return erreur instanceof HorsLigne ? { lue: false, raison, horsLigne: true } : { lue: false, raison };
  }
}

// Les entrées comme lignes de la file, dans la forme que le bloc `awaiting` écrit (rail.ts, `blocAwaiting`).
export const fileDuChef = (attentes: readonly AttenteDuChef[]): LigneDeLaFile[] =>
  attentes.map(({ ticket, titre, depuis, quoi, ligne }) => ({ nom: `#${ticket}`, ticket, titre: titre === "" ? null : titre, quoi, depuis, ligne, decision: null, carte: null }));

// Le bloc `awaiting` de ce qui attend le chef, de sa tête à `end awaiting` : ce que le second relaie, et ce que le TODO
// de l'app lit.
export const blocDuChef = ({ lu, attentes, illisibles }: { lu: string; attentes: readonly AttenteDuChef[]; illisibles: readonly string[] }): string[] =>
  blocAwaiting({ file: fileDuChef(attentes), bilans: [...illisibles], lu });

// Le tableau lu, dont ce qui attend le chef est cette lecture, et rien d'autre : la file du bloc `awaiting` de `status` et
// `faits.attend`, que TODO dessine, dans le même ordre. Ce que la box publiait d'autre dans sa file — ce qui n'est pas un
// fait de GitHub — n'y est plus.
export function avecLAttenteDuChef(lu: TableauLu, { attentes, illisibles }: { attentes: readonly AttenteDuChef[]; illisibles: readonly string[] }): TableauLu {
  const attend = attentes.map(({ ticket, titre, url, chef, miseDeCote, decision }) => ({
    ticket,
    titre,
    url,
    ...(miseDeCote === undefined ? {} : { miseDeCote }),
    ...(decision === undefined ? {} : { decision }),
    ...(chef === undefined ? {} : { chef }),
  }));
  const faits = lu.faits === undefined ? {} : { faits: { ...lu.faits, attend, compteurs: { ...(objet(lu.faits.compteurs) ?? {}), attend: attend.length } } };
  return { ...lu, file: fileDuChef(attentes), pages: attentes.map(({ url, decision }) => decision?.pr ?? url), bilans: [...illisibles], ...faits };
}
