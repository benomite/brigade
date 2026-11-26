// Le compte total des essais d'un ticket (#4217, règle 12 de docs/superpowers/specs/2026-11-24-simplified-process.md) :
// sur BOBL-tech/mirrorlab #923, chaque prise, réécriture du manager ou passe du superviseur repartait de n=1, et le
// ticket a vu 13 cooks ratés en deux heures. Un essai est un cook rendu sans livraison : son commentaire
// `<!-- brigade:echec … -->`, hors des runs finis `ok`, qui ne sont pas des échecs (#3652, echecs-sans-livraison.ts).
// Le compte se lit sur l'issue, de tous ses commentaires d'échec : ni une prise, ni une réécriture, ni une passe du
// superviseur ne le remettent à zéro.
// À `ESSAIS_AU_TOTAL` essais, le ticket s'arrête pour de bon : il est parqué pour le chef (`chef-todo`), et un seul
// commentaire le dit — la carte de TODO de l'arrêt, qui liste ce qui a été tenté. Aucune station ne le prend plus
// (retenue.ts) tant que le chef n'a pas agi : retirer `chef-todo` lui rend un nouveau budget, compté depuis l'arrêt.
import { BOUTONS_DE_LA_CARTE } from "../blocages-sans-question.ts";
import { DE_CONFIANCE } from "../attente-github/marque.ts";
import { CHEF_TODO } from "../github-etat/etats.ts";
import { runFiniOk } from "../echecs-sans-livraison.ts";
import type { GitHub } from "../github.ts";

// Les essais d'un ticket au total : trois pour la première boucle, avant le manager ou le superviseur, puis deux.
export const ESSAIS_AU_TOTAL = 5;

export type RetraitLu = { label: string; createdAt: string };
type CommentaireLu = { body: string; association: string; createdAt: string };

const MARQUE_D_ECHEC = /^<!-- brigade:echec[ >]/;
// L'arrêt pour de bon : une carte de TODO (github-seul/carte-todo/carte-todo.ts) qui porte `stop=<essais>`.
const MARQUE_D_ARRET = /^<!-- brigade:todo kind=blocked stop=(\d+) -->/;
const marqueDArret = (essais: number) => `<!-- brigade:todo kind=blocked stop=${essais} -->`;

const deConfiance = <C extends { association: string }>(commentaires: readonly C[]) => commentaires.filter((c) => DE_CONFIANCE.includes(c.association));

// Le motif d'un essai, tel que son commentaire `brigade:echec` ou `brigade:renvoi` le dit.
export const motifDeLEssai = (corps: string) => corps.match(/ — ([^\n]*)/)?.[1] ?? "";

// Les essais du ticket : `total`, tous ses commentaires d'échec — le `n` du prochain est `total + 1` ; `depuisLArret`,
// les motifs des runs échoués postés depuis son dernier arrêt pour de bon, du plus ancien au plus récent.
export function essaisDuTicket(commentaires: readonly CommentaireLu[]): { total: number; depuisLArret: string[] } {
  const lus = deConfiance(commentaires);
  const arret = lus.findLastIndex((c) => MARQUE_D_ARRET.test(c.body));
  const echecs = (liste: readonly CommentaireLu[]) => liste.filter((c) => MARQUE_D_ECHEC.test(c.body));
  return { total: echecs(lus).length, depuisLArret: echecs(lus.slice(arret + 1)).filter((c) => !runFiniOk(c.body)).map((c) => motifDeLEssai(c.body)) };
}

// L'arrêt pour de bon qui tient le ticket : ses essais, ou null. Il tient tant que `chef-todo` n'a pas été retiré
// après lui — le geste du chef. Des retraits illisibles ne le lèvent pas : un arrêt dans le doute tient.
export async function arretEnCours(commentaires: readonly CommentaireLu[], retraits: () => Promise<RetraitLu[]>): Promise<number | null> {
  const arret = deConfiance(commentaires).findLast((c) => MARQUE_D_ARRET.test(c.body));
  if (arret === undefined) return null;
  const essais = Number(MARQUE_D_ARRET.exec(arret.body)?.[1]);
  const lus = await retraits().catch(() => [] as RetraitLu[]);
  const leve = lus.some((r) => r.label === CHEF_TODO && Date.parse(r.createdAt) >= Date.parse(arret.createdAt));
  return leve ? null : essais;
}

// Le commentaire de l'arrêt : la carte du chef, sa question en première ligne, puis ce qui a été tenté.
function corpsDeLArret(numero: number, station: string, motifs: readonly string[]): string {
  return [
    marqueDArret(motifs.length),
    `#${numero} stopped for good after ${motifs.length} tries in total, none delivered: back to the kitchen for ${ESSAIS_AU_TOTAL} more tries, or close it?`,
    "",
    `Station \`${station}\` stopped this ticket: its cooks stopped without a delivery ${motifs.length} times in total, across claims, manager rewrites and supervisor passes. No station takes it again until the chef acts.`,
    "",
    "What was tried:",
    ...motifs.map((motif, i) => `${i + 1}. ${motif}`),
    "",
    ...BOUTONS_DE_LA_CARTE,
  ].join("\n");
}

// Arrête le ticket pour de bon : `chef-todo` d'abord — aucune station ne le prend plus —, puis son commentaire, un seul :
// un arrêt qui tient déjà n'en écrit pas d'autre. Rend vrai si le commentaire est posté.
export async function arreterPourDeBon(
  github: Pick<GitHub, "labelliser" | "commenter"> & { commentaires(numero: number): Promise<CommentaireLu[]>; retraitsDeLabels(numero: number): Promise<RetraitLu[]> },
  numero: number,
  station: string,
  motifs: readonly string[],
): Promise<boolean> {
  await github.labelliser(numero, [CHEF_TODO]);
  if ((await arretEnCours(await github.commentaires(numero), () => github.retraitsDeLabels(numero))) !== null) return false;
  await github.commenter(numero, corpsDeLArret(numero, station, motifs));
  return true;
}
