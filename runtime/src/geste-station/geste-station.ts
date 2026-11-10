// Un geste sur GitHub que la station sait faire n'est jamais une carte du chef
// (#3136, épique #3129 ; CLAUDE.md, « Brigade's goal: autonomy »). Le
// 2026-11-10, un cook a demandé qu'une issue soit ouverte pour un constat et
// son numéro noté dans son compte-rendu : le chef a reçu une commande
// `gh issue create` à lancer, puis un numéro à reposter, puis un label à
// retirer.
//
// Quand le manager lit, dans le blocage d'un cook, un « geste que seul le chef
// peut faire » qui est l'une de ces commandes `gh` — ouvrir une issue,
// commenter, poser ou retirer un label, relancer un check —, la station la
// fait elle-même, avec son accès GitHub (`GitHubDuTour`) : elle poste le
// résultat (le numéro de l'issue ouverte…) en commentaire sur le ticket, où le
// cook le lit, retire `blocked-on-human` et rend le ticket à la cuisine. Un
// autre geste — un accès, un secret, un réglage — reste la carte du chef.
//
// Un appel GitHub qui échoue n'est pas avalé : la station rend l'échec avec
// l'erreur, que son chemin d'échec écrit sur le ticket — jamais une carte qui
// demande au chef de lancer la commande à la main.
import { A_LA_MAIN, type GitHubDuTour } from "../brigade-github.ts";

export type GesteGitHub =
  | { sorte: "issue"; titre: string; corps: string; labels: string[] }
  | { sorte: "commentaire"; numero: number; corps: string }
  | { sorte: "labels"; numero: number; poser: string[]; retirer: string[] }
  | { sorte: "relance"; run: number };

export type GitHubDuGeste = Pick<GitHubDuTour, "creerIssue" | "commenter" | "labelliser" | "delabelliser" | "relancerLesEchecs">;

// Les mots d'une commande, comme un shell les coupe : guillemets simples ou
// doubles, `\"` dans les doubles. Null sur un guillemet resté ouvert, ou sur ce
// qu'un shell interpréterait (`$(…)`, `$VAR`, une redirection, un `|`) : la
// station ne fait que ce qui est écrit.
function mots(commande: string): string[] | null {
  const lus: string[] = [];
  let mot: string | null = null;
  for (let i = 0; i < commande.length; i += 1) {
    const c = commande[i] as string;
    if (/\s/.test(c)) {
      if (mot !== null) lus.push(mot);
      mot = null;
    } else if (c === "'" || c === '"') {
      const fin = c === "'" ? commande.indexOf("'", i + 1) : finDeDoubles(commande, i + 1);
      if (fin < 0) return null;
      const dedans = commande.slice(i + 1, fin);
      if (c === '"' && /\$|`/.test(dedans)) return null;
      mot = (mot ?? "") + (c === '"' ? dedans.replace(/\\(["\\$`])/g, "$1") : dedans);
      i = fin;
    } else if (/[$|;&<>`\\]/.test(c)) return null;
    else mot = (mot ?? "") + c;
  }
  if (mot !== null) lus.push(mot);
  return lus;
}

function finDeDoubles(texte: string, depuis: number): number {
  for (let i = depuis; i < texte.length; i += 1) {
    if (texte[i] === "\\") i += 1;
    else if (texte[i] === '"') return i;
  }
  return -1;
}

// Les options d'une commande : chacune avec ses valeurs, dans l'ordre. Null sur
// une option hors de `connues`, sans valeur, ou sur un argument de trop.
function options(args: string[], connues: Record<string, string>, drapeaux: Record<string, string> = {}): { valeurs: Map<string, string[]>; positionnels: string[] } | null {
  const valeurs = new Map<string, string[]>();
  const positionnels: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (!arg.startsWith("-")) {
      positionnels.push(arg);
      continue;
    }
    const egal = arg.indexOf("=");
    const nom = egal > 0 ? arg.slice(0, egal) : arg;
    const drapeau = drapeaux[nom];
    if (drapeau !== undefined && egal < 0) {
      valeurs.set(drapeau, ["true"]);
      continue;
    }
    const cle = connues[nom];
    if (cle === undefined) return null;
    const valeur = egal > 0 ? arg.slice(egal + 1) : args[(i += 1)];
    if (valeur === undefined) return null;
    valeurs.set(cle, [...(valeurs.get(cle) ?? []), valeur]);
  }
  return { valeurs, positionnels };
}

const numero = (mot: string | undefined): number | null => {
  const lu = /^#?(\d+)$/.exec(mot ?? "");
  return lu ? Number(lu[1]) : null;
};
const listeDeLabels = (valeurs: string[] | undefined) => (valeurs ?? []).flatMap((v) => v.split(",")).map((l) => l.trim()).filter((l) => l !== "");
const DEPOT = { "-R": "depot", "--repo": "depot" };

// Le geste que dit une commande `gh`, ou null quand la station ne le fait pas.
// `depot` : le dépôt servi ; une commande qui en vise un autre n'est pas faite.
function lireLaCommande(commande: string, depot: string | null): GesteGitHub | null {
  const lus = mots(commande);
  if (lus === null || lus[0] !== "gh") return null;
  const [, objet, verbe, ...reste] = lus;
  const geste = (connues: Record<string, string>, drapeaux?: Record<string, string>) => {
    const lu = options(reste, { ...connues, ...DEPOT }, drapeaux);
    if (lu === null) return null;
    const vise = lu.valeurs.get("depot");
    if (vise !== undefined && vise.some((d) => depot === null || d.toLowerCase() !== depot.toLowerCase())) return null;
    return lu;
  };
  if (objet === "issue" && verbe === "create") {
    const lu = geste({ "-t": "titre", "--title": "titre", "-b": "corps", "--body": "corps", "-l": "label", "--label": "label" });
    const titre = lu?.valeurs.get("titre")?.at(-1)?.trim() ?? "";
    if (lu === null || lu.positionnels.length > 0 || titre === "") return null;
    return { sorte: "issue", titre, corps: lu.valeurs.get("corps")?.at(-1) ?? "", labels: listeDeLabels(lu.valeurs.get("label")) };
  }
  if ((objet === "issue" || objet === "pr") && verbe === "comment") {
    const lu = geste({ "-b": "corps", "--body": "corps" });
    const n = numero(lu?.positionnels[0]);
    const corps = lu?.valeurs.get("corps")?.at(-1) ?? "";
    if (lu === null || lu.positionnels.length !== 1 || n === null || corps.trim() === "") return null;
    return { sorte: "commentaire", numero: n, corps };
  }
  if ((objet === "issue" || objet === "pr") && verbe === "edit") {
    const lu = geste({ "--add-label": "poser", "--remove-label": "retirer" });
    const n = numero(lu?.positionnels[0]);
    if (lu === null || lu.positionnels.length !== 1 || n === null) return null;
    const poser = listeDeLabels(lu.valeurs.get("poser"));
    const retirer = listeDeLabels(lu.valeurs.get("retirer"));
    if (poser.length + retirer.length === 0) return null;
    return { sorte: "labels", numero: n, poser, retirer };
  }
  if (objet === "run" && verbe === "rerun") {
    const lu = geste({}, { "--failed": "failed" });
    const run = numero(lu?.positionnels[0]);
    if (lu === null || lu.positionnels.length !== 1 || run === null) return null;
    return { sorte: "relance", run };
  }
  return null;
}

// Les gestes GitHub que le geste lu par le manager demande, dans l'ordre : ses
// commandes `gh` entre backticks, ou le geste entier s'il est une commande
// (« Run gh … »). Null quand il n'en porte aucune, ou qu'une seule n'est pas
// un geste que la station fait : le geste entier reste alors au chef, comme
// avant — la station n'en fait pas la moitié.
export function lireLesGestesGitHub(geste: string, depot: string | null = null): GesteGitHub[] | null {
  const citees = [...geste.matchAll(/`(gh\s[^`]*)`/g)].map((lu) => (lu[1] as string).trim());
  const commandes = citees.length > 0 ? citees : [/^(?:run\s+)?(gh\s.*?)\.?$/is.exec(geste.trim())?.[1] ?? ""].filter((c) => c !== "");
  if (commandes.length === 0) return null;
  const lus = commandes.map((commande) => lireLaCommande(commande, depot));
  return lus.every((lu): lu is GesteGitHub => lu !== null) ? lus : null;
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Fait un geste, et rend ce qu'il a donné, en une ligne : ce que le cook lit.
async function faire(github: GitHubDuGeste, geste: GesteGitHub): Promise<string> {
  if (geste.sorte === "issue") {
    const ouverte = await github.creerIssue({ titre: geste.titre, corps: geste.corps, labels: geste.labels });
    return `Issue #${ouverte} is open: “${geste.titre}”.`;
  }
  if (geste.sorte === "commentaire") {
    await github.commenter(geste.numero, geste.corps);
    return `A comment is posted on #${geste.numero}.`;
  }
  if (geste.sorte === "labels") {
    if (geste.poser.length > 0) await github.labelliser(geste.numero, geste.poser);
    for (const label of geste.retirer) await github.delabelliser(geste.numero, label);
    const dit = [...geste.poser.map((l) => `\`${l}\` set`), ...geste.retirer.map((l) => `\`${l}\` removed`)];
    return `On #${geste.numero}: ${dit.join(", ")}.`;
  }
  await github.relancerLesEchecs(geste.run);
  return `The failed jobs of run ${geste.run} are rerun.`;
}

const nommer = (geste: GesteGitHub): string =>
  geste.sorte === "issue" ? "open an issue" : geste.sorte === "commentaire" ? `comment on #${geste.numero}` : geste.sorte === "labels" ? `change the labels of #${geste.numero}` : `rerun run ${geste.run}`;

export type IssueDuGeste = { fait: string[] } | { echec: string };

// Fait les gestes GitHub que le cook du `ticket` a demandés, poste leur
// résultat sur le ticket, où le cook le lit en reprenant, et retire
// `blocked-on-human` du ticket : il retourne à la cuisine. Rend ce qui a été
// fait, ou l'échec avec l'erreur de GitHub — ce qui a été fait avant lui y est
// dit, pour que rien ne soit refait à l'aveugle.
export async function faireLesGestesGitHub(github: GitHubDuGeste, { station, ticket, gestes }: { station: string; ticket: number; gestes: GesteGitHub[] }): Promise<IssueDuGeste> {
  const faits: string[] = [];
  for (const geste of gestes) {
    try {
      faits.push(await faire(github, geste));
    } catch (erreur) {
      const avant = faits.length === 0 ? "" : ` (already done: ${faits.join(" ")})`;
      return { echec: `the cook asked for a GitHub gesture (${nommer(geste)}), and the station's GitHub call failed: ${message(erreur)}${avant}` };
    }
  }
  try {
    await github.commenter(ticket, corpsDuGeste(station, faits));
    await github.delabelliser(ticket, A_LA_MAIN);
  } catch (erreur) {
    return { echec: `the station made the GitHub gesture the cook asked for (${faits.join(" ")}), but could not report it on the ticket: ${message(erreur)}` };
  }
  return { fait: faits };
}

export function corpsDuGeste(station: string, faits: string[]): string {
  return [
    `**Station \`${station}\` — the cook asked for a GitHub gesture: the station made it, no card for the chef.**`,
    "",
    ...faits.map((fait) => `- ${fait}`),
    "",
    "The ticket goes back to the kitchen: a cook resumes it from its branch, with this result.",
  ].join("\n");
}
