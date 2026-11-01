// Les directions du chef, telles que le rôle produit les lit : ce que le chef
// écrit pour orienter ce qui se dépose (« focus on onboarding this month »),
// sans rouvrir de session. Une direction est une issue ouverte du dépôt servi
// qui porte le label `direction`, ouverte par le chef : son corps est la
// direction, et les commentaires du chef sur elle la prolongent. Une ligne
// `until: YYYY-MM-DD` lui donne une fin ; la fermer, ou passer ce jour, l'éteint.
//
// Qui est le chef se dit par les réglages du projet servi : ce module reçoit
// ses comptes GitHub, il ne les devine pas — sans compte, aucune direction.
// Rien ici ne nomme un dépôt ni un chemin : tout se lit du GitHub qu'on lui
// donne.
import type { Commentaire, GitHub, IssueOuverte, Sondage } from "../../github.ts";
import { couper, COMMENTAIRES_MAX, CORPS_MAX } from "../../juger.ts";

// Le label qui fait d'une issue une direction.
export const LABEL_DIRECTION = "direction";

// Une issue telle que le lecteur la juge : ce que GitHub en rend, avec son
// auteur et ses commentaires, du plus ancien au plus récent.
export type IssueDeDirection = {
  number: number;
  url: string;
  title: string;
  body: string;
  author: string;
  state: "open" | "closed";
  labels: string[];
  commentaires: Commentaire[];
};

// Une direction active, prête à entrer dans la consigne du rôle. `texte` : le
// corps de l'issue, tel que le chef l'a écrit. `jusqua` : son dernier jour,
// nul si rien ne la borne. `commentaires` : ceux du chef, du plus ancien au
// plus récent.
export type Direction = {
  numero: number;
  lien: string;
  titre: string;
  texte: string;
  jusqua: string | null;
  commentaires: Array<{ texte: string; date: string }>;
};

// Une ligne `until: 2026-11-30`, avec ou sans puce ni gras autour.
const JUSQUA = /^[\s>*_-]*until[\s*_]*:[\s*_]*(\d{4}-\d{2}-\d{2})(?![\d-])/gim;

const jourValide = (jour: string): boolean => {
  const date = new Date(`${jour}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === jour;
};

// Le dernier jour écrit dans un texte, ou null : la dernière ligne `until:`
// qui porte une vraie date. Une date impossible (`2026-02-30`) ne borne rien.
export function jusquaDans(texte: string): string | null {
  let dernier: string | null = null;
  for (const trouve of texte.matchAll(JUSQUA)) if (jourValide(trouve[1]!)) dernier = trouve[1]!;
  return dernier;
}

const estDuChef = (chefs: ReadonlySet<string>, compte: string) => compte !== "" && chefs.has(compte.toLowerCase());

// Les directions actives parmi des issues lues : ouvertes, labellisées
// `direction`, ouvertes par l'un des `chefs`, et dont le dernier jour n'est pas
// passé au jour (UTC) de `maintenant` — le jour même de `until:` compte
// encore. Un `until:` qu'un commentaire du chef écrit plus tard l'emporte sur
// celui du corps : le chef prolonge ou avance la fin sans éditer l'issue. Les
// commentaires d'un autre que le chef ne sont pas rendus. La plus récente
// d'abord (le numéro le plus haut).
export function directionsActives(issues: readonly IssueDeDirection[], options: { chefs: readonly string[]; maintenant: Date }): Direction[] {
  const chefs = new Set(options.chefs.map((compte) => compte.trim().toLowerCase()).filter((compte) => compte !== ""));
  const aujourdhui = options.maintenant.toISOString().slice(0, 10);
  const directions: Direction[] = [];
  for (const issue of issues) {
    if (issue.state !== "open") continue;
    if (!issue.labels.some((label) => label.toLowerCase() === LABEL_DIRECTION)) continue;
    if (!estDuChef(chefs, issue.author)) continue;
    const commentaires = issue.commentaires.filter((commentaire) => estDuChef(chefs, commentaire.author));
    const jusqua = [issue.body, ...commentaires.map(({ body }) => body)].reduce<string | null>((dernier, texte) => jusquaDans(texte) ?? dernier, null);
    if (jusqua !== null && jusqua < aujourdhui) continue;
    directions.push({
      numero: issue.number,
      lien: issue.url,
      titre: issue.title,
      texte: issue.body.trim(),
      jusqua,
      commentaires: commentaires.map(({ body, createdAt }) => ({ texte: body.trim(), date: createdAt })),
    });
  }
  return directions.sort((a, b) => b.numero - a.numero);
}

// Ce que le lecteur demande à GitHub : les issues ouvertes, puis, pour chaque
// direction, son auteur et ses commentaires.
export type GitHubDesDirections = {
  ouvertes(): Promise<Sondage<IssueOuverte>>;
  issue: GitHub["issue"];
  commentaires: GitHub["commentaires"];
};

// Le lecteur des directions d'un projet. Son GitHub doit n'être qu'à lui : il
// sonde les issues ouvertes sous leur ETag et confirme ce qu'il a lu, ce qui
// cacherait un changement au sondage d'un autre consommateur du même GitHub
// (le manager). Un 304 rend la dernière liste lue ; l'auteur et les
// commentaires de chaque direction sont relus à chaque lecture — un
// commentaire du chef ne change pas la liste des issues ouvertes.
export function lecteurDesDirections(github: GitHubDesDirections): (options: { chefs: readonly string[]; maintenant: Date }) => Promise<Direction[]> {
  let derniere: IssueOuverte[] | null = null;
  return async (options) => {
    const sondage = await github.ouvertes();
    if (sondage.inchange) {
      if (derniere === null) throw new Error("GitHub answered “unchanged” to a first reading of the open issues");
    } else {
      sondage.confirmer();
      derniere = sondage.issues;
    }
    const candidates = derniere.filter((issue) => !issue.pr && issue.labels.some((label) => label.toLowerCase() === LABEL_DIRECTION));
    const lues: IssueDeDirection[] = [];
    for (const candidate of candidates) {
      const issue = await github.issue(candidate.number);
      if (issue === null) continue;
      lues.push({
        number: issue.number,
        url: issue.url,
        title: issue.title,
        body: issue.body ?? "",
        author: issue.author ?? "",
        state: issue.state,
        labels: issue.labels,
        commentaires: await github.commentaires(issue.number),
      });
    }
    return directionsActives(lues, options);
  };
}

// Les directions, telles qu'elles entrent dans la consigne du rôle : une
// section par direction, son lien, sa fin, son texte et les commentaires du
// chef. Sans direction active, la section le dit : l'usage seul décide.
export function consigneDesDirections(directions: readonly Direction[]): string {
  if (directions.length === 0) return ["### Les directions du chef", "", "Aucune direction active : l'usage seul décide de ce que tu déposes."].join("\n");
  return [
    "### Les directions du chef",
    "",
    `Le chef les a écrites sur le dépôt, en issues labellisées \`${LABEL_DIRECTION}\`. À usage égal, ce qui sert une direction passe devant ; ce qui la contredit ne se dépose pas. La plus récente d'abord.`,
    ...directions.flatMap((direction) => [
      "",
      `#### #${direction.numero} — ${direction.titre}`,
      "",
      `${direction.lien} — ${direction.jusqua === null ? "sans date de fin" : `jusqu'au ${direction.jusqua} inclus`}`,
      "",
      "<direction>",
      couper(direction.texte, CORPS_MAX),
      "</direction>",
      ...(direction.commentaires.length === 0
        ? []
        : ["", "<commentaires-du-chef>", couper(direction.commentaires.map(({ texte, date }) => `${date}\n${texte}`).join("\n\n---\n\n"), COMMENTAIRES_MAX), "</commentaires-du-chef>"]),
    ]),
  ].join("\n");
}
