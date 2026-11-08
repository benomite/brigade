// Les PR externes (#2933) : une PR ouverte depuis un fork — sa tête vient d'un
// autre dépôt que celui du projet (`github-etat/instantane.ts` la reconnaît).
// Elle n'est la PR d'aucun ticket : la cuisine la relit et joue ses gates, sans
// les secrets du projet, poste son verdict et le résultat des gates en un seul
// commentaire sur la PR, puis pose une carte de TODO à l'humain `review` du
// projet (#2760) : « merge #N? », avec la réponse que le verdict recommande.
//
// La cuisine ne merge jamais une PR externe, quel que soit son verdict : ce
// module ne reçoit aucun client qui sache merger ou mettre à jour une branche,
// et c'est l'humain qui répond à la carte qui merge, à la main, ou ferme.
//
// Sans secrets : la relecture et les gates exécutent ou lisent le code de la
// PR, que personne de la cuisine n'a écrit. Ce que leur environnement reçoit,
// c'est la station qui le décide (`brigade-github.ts`, `stationDuDepot`) ; ici,
// rien ne leur passe de secret.
//
// Une tête se sert une fois, par une seule station : le travail sur une tête
// se prend sur la PR comme celui du manager sur une issue
// (`github-etat/prise-du-manager.ts`), l'état étant le sha de la tête. Une tête
// nouvelle — le fork pousse — se relit, et sa carte remplace la précédente.
// Une station qui tombe après le commentaire et avant la fin de son travail
// ne relit pas la tête : elle repart du commentaire qu'elle trouve.
import { aiguiller, type Humain } from "../aiguillage-humains/aiguillage.ts";
import { DE_CONFIANCE } from "../alimenter.ts";
import type { Jugement } from "../github-etat/fusion.ts";
import type { VerdictDesGates } from "../github-etat/gates-de-la-tete.ts";
import { finirLeTravail, prendreLeTravail, type GitHubDuTravail } from "../github-etat/prise-du-manager.ts";
import { leverCarte, lireCarte, poserCarte, type Carte, type GitHubDesCartes } from "../github-seul/carte-todo/carte-todo.ts";

// Une PR externe ouverte, telle que le tour la lit.
export type PRExterne = { number: number; sha: string };

// Ce que les gates d'une PR externe ont dit, ou pourquoi elles ne se sont pas
// jouées — un projet sans gates : c'est un fait, que le commentaire dit.
export type GatesExternes = VerdictDesGates | { nonJouees: string };

// Ce que ce module demande au client de GitHub : lire et écrire les
// commentaires et les labels de la PR, l'assigner. Ni merge, ni mise à jour.
export type GitHubDesPRExternes = GitHubDuTravail & {
  issue(numero: number): Promise<{ labels: string[] } | null>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  delabelliser(numero: number, label: string): Promise<void>;
  assigner?(numero: number, logins: string[]): Promise<void>;
};

export type ContexteDesPRExternes = {
  github: GitHubDesPRExternes;
  station: string;
  maintenant: () => Date;
  // La relecture de la cuisine sur la tête, sans les secrets du projet.
  juger(pr: PRExterne): Promise<Jugement>;
  // Les gates du projet sur la tête, sans ses secrets.
  gates(pr: PRExterne): Promise<GatesExternes>;
  // Les humains du projet (`humans` de ses réglages), relus à chaque PR.
  humains(): Humain[];
};

const MARQUE = /^<!-- brigade:pr-externe station=([A-Za-z0-9._/-]+) sha=([0-9a-f]+) verdict=(approve|request-changes) gates=(green|red|none) -->/;

export type VerdictExterne = { verdict: Jugement["verdict"]; gates: "green" | "red" | "none" };

// La réponse que le verdict recommande : oui seulement si la relecture
// approuve et qu'aucune gate n'est rouge.
export const recommande = ({ verdict, gates }: VerdictExterne): "yes" | "no" => (verdict === "approve" && gates !== "red" ? "yes" : "no");

const couleurDesGates = (gates: GatesExternes): VerdictExterne["gates"] => ("nonJouees" in gates ? "none" : gates.vert ? "green" : "red");

function direLesGates(gates: GatesExternes): string {
  if ("nonJouees" in gates) return `**Gates:** not run — ${gates.nonJouees}.`;
  if (gates.vert) return "**Gates:** green.";
  return [`**Gates:** red${gates.resume === "" ? "" : ` — ${gates.resume}`}.`, ...(gates.detail === "" ? [] : ["", gates.detail])].join("\n");
}

// Le commentaire unique : la marque, le verdict de la relecture, puis les gates.
export function corpsDuVerdictExterne(station: string, pr: PRExterne, jugement: Jugement, gates: GatesExternes): string {
  const verdict = jugement.verdict === "approve" ? "Approved" : "Changes requested";
  return [
    `<!-- brigade:pr-externe station=${station} sha=${pr.sha} verdict=${jugement.verdict} gates=${couleurDesGates(gates)} -->`,
    `Outside PR, judged by station \`${station}\` on \`${pr.sha.slice(0, 7)}\` without the project's secrets. The kitchen never merges an outside PR: a human decides.`,
    "",
    `**Review:** ${verdict}.${jugement.motif === "" ? "" : `\n\n${jugement.motif}`}`,
    "",
    direLesGates(gates),
  ].join("\n");
}

// Le verdict que la PR porte déjà pour cette tête, posé par le dépôt ; nul sinon.
export function verdictDeLaTete(commentaires: Array<{ body: string; association: string }>, sha: string): VerdictExterne | null {
  for (const { body, association } of [...commentaires].reverse()) {
    if (!DE_CONFIANCE.includes(association)) continue;
    const marque = MARQUE.exec(body);
    if (marque !== null && marque[2] === sha) return { verdict: marque[3] as VerdictExterne["verdict"], gates: marque[4] as VerdictExterne["gates"] };
  }
  return null;
}

// La carte : la question « merge #N? » sur sa première ligne, puis la réponse
// recommandée et ce qui la fonde.
export function carteDeLaPRExterne(pr: PRExterne, verdict: VerdictExterne): Carte {
  const reponse = recommande(verdict);
  const revue = verdict.verdict === "approve" ? "the kitchen's review approves it" : "the kitchen's review requests changes";
  const gates = verdict.gates === "none" ? "its gates did not run" : `its gates are ${verdict.gates}`;
  return {
    sorte: "merge-by-hand",
    texte: [`merge #${pr.number}?`, "", `Recommended answer: **${reponse}** — on \`${pr.sha.slice(0, 7)}\`, ${revue} and ${gates} (the kitchen's comment above says why).`, "", "This PR comes from a fork: the kitchen never merges it. Merge it by hand, or close it."].join("\n"),
  };
}

// Pose la carte de la tête : celle qui attend déjà, d'une tête d'avant, cède
// la place ; la même, déjà posée, ne s'écrit pas deux fois. Assignée à
// l'humain `review` du projet, s'il en déclare un.
async function poserLaCarte(pr: PRExterne, verdict: VerdictExterne, { github, humains }: Pick<ContexteDesPRExternes, "github" | "humains">): Promise<void> {
  // Les cartes lisent les commentaires sans leur auteur, qu'elles n'utilisent pas.
  const cartes: GitHubDesCartes = {
    issue: async (numero) => {
      const lue = await github.issue(numero);
      return lue === null ? null : ({ ...lue, number: numero } as Awaited<ReturnType<GitHubDesCartes["issue"]>>);
    },
    commentaires: async (numero) => (await github.commentaires(numero)).map((c) => ({ ...c, author: "" })),
    commenter: (numero, corps) => github.commenter(numero, corps),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
  };
  const carte = carteDeLaPRExterne(pr, verdict);
  const enCours = await lireCarte(pr.number, cartes);
  if (enCours?.sorte === carte.sorte && enCours.texte !== carte.texte.trim()) await leverCarte(pr.number, cartes, carte.sorte);
  const aiguillage = aiguiller(humains(), carte.sorte);
  // Assignée avant la carte : un arrêt entre les deux rejoue l'assignation, sans doubler.
  if (aiguillage.vers === "humain") await github.assigner?.(pr.number, [aiguillage.login]);
  await poserCarte(pr.number, carte, cartes);
}

// `servie` : le verdict et la carte de cette tête sont posés. `tenue` : une
// autre station la sert. `deja` : elle était servie.
export type IssueDeLaPRExterne = { issue: "servie"; verdict: VerdictExterne } | { issue: "tenue"; par: string } | { issue: "deja" };

// Sert la tête de la PR externe depuis la station : la prend, la juge et joue
// ses gates, poste leur commentaire, pose la carte, et dit son travail fait.
export async function servirLaPRExterne(pr: PRExterne, contexte: ContexteDesPRExternes): Promise<IssueDeLaPRExterne> {
  const { github, station, maintenant } = contexte;
  const { prise, tenant } = await prendreLeTravail(pr.number, pr.sha, { github, station, maintenant });
  if (tenant?.fait === true) return { issue: "deja" };
  if (!prise || tenant === null) return { issue: "tenue", par: tenant?.station ?? "another station" };
  let verdict = verdictDeLaTete(await github.commentaires(pr.number), pr.sha);
  if (verdict === null) {
    // Les gates d'abord : elles ne coûtent aucun jeton, et une relecture ne se
    // paie pas pour une tête dont les gates n'ont pas pu se préparer.
    const gates = await contexte.gates(pr);
    const jugement = await contexte.juger(pr);
    await github.commenter(pr.number, corpsDuVerdictExterne(station, pr, jugement, gates));
    verdict = { verdict: jugement.verdict, gates: couleurDesGates(gates) };
  }
  await poserLaCarte(pr, verdict, contexte);
  await finirLeTravail(pr.number, tenant, github);
  return { issue: "servie", verdict };
}
