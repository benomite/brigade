// Les cooks d'un projet sur GitHub seul (ticket 2220, épique 2209), tels que l'onglet Cooks les montre : qui tient chaque
// ticket se lit des commentaires de prise de son issue, comme la station qui prend le ticket le lit
// (runtime/src/github-etat/prise.ts, `tenant`) — ni boîte, ni journal. Le plus ancien commentaire de prise l'emporte ; un
// commentaire de lâcher, ou le retrait du label `taken` ou `fire`, annule toutes les prises postées avant lui. Seul qui a
// la main sur le dépôt prend un ticket : un commentaire d'un autre ne compte pas.
//
// Ce module redit la règle du runtime sans l'importer : prise.ts tire avec lui le rail du runtime, que l'app ne charge pas.
// Un test les joue toutes deux sur les mêmes commentaires (test/vue/cooks/prises.test.ts).
import { stationsSurGithub, type SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import type { Cook } from "../../facts.ts";
import type { FactsStation } from "../../ordinaires.ts";

const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];
const LABELS_QUI_LACHENT = ["taken", "fire"];
const MARQUE_DE_TAKING = /^<!-- brigade:prise station=([A-Za-z0-9._/-]+) -->/;
const MARQUE_DE_LACHER = /^<!-- brigade:lache station=([A-Za-z0-9._/-]+) -->/;

type Brut = Record<string, unknown>;

// La prise qui tient un ticket : la station, et l'heure de son commentaire.
export type Taking = { station: string; le: string };

// Qui tient le ticket, d'après les commentaires de son issue et ses événements (`unlabeled`), tels que l'API de GitHub
// les rend ; null si personne. Les faits se rangent par instant, puis par id de commentaire ; un retrait de label passe
// après les commentaires de sa seconde : dans le doute, le lâcher l'emporte.
export function tenantDeLIssue(commentaires: readonly Brut[], events: readonly Brut[]): Taking | null {
  const facts: { instant: number; rang: number; prise: Taking | null }[] = [];
  for (const { id, body, author_association: association, created_at: le } of commentaires) {
    if (typeof association !== "string" || !DE_CONFIANCE.includes(association) || typeof le !== "string" || typeof body !== "string") continue;
    const instant = Date.parse(le);
    if (Number.isNaN(instant)) continue;
    const rang = typeof id === "number" ? id : 0;
    const taking = MARQUE_DE_TAKING.exec(body)?.[1];
    if (taking !== undefined) facts.push({ instant, rang, prise: { station: taking, le } });
    else if (MARQUE_DE_LACHER.test(body)) facts.push({ instant, rang, prise: null });
  }
  for (const { event, label, created_at: le } of events) {
    const name = typeof label === "object" && label !== null ? (label as Brut).name : undefined;
    const instant = typeof le === "string" ? Date.parse(le) : Number.NaN;
    if (event === "unlabeled" && typeof name === "string" && LABELS_QUI_LACHENT.includes(name) && !Number.isNaN(instant)) facts.push({ instant, rang: Number.POSITIVE_INFINITY, prise: null });
  }
  facts.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  let tient: Taking | null = null;
  for (const { prise: taking } of facts) {
    if (taking === null) tient = null;
    else if (tient === null) tient = taking;
  }
  return tient;
}

// Les prises d'un ticket, de la plus ancienne à la plus récente : l'heure de chaque commentaire de prise de confiance. Chaque
// relance d’un cook en pose une (ticket 3823) : le rail les compte pour dire un ticket relancé en boucle.
export function prisesDeLIssue(commentaires: readonly Brut[]): string[] {
  return commentaires
    .flatMap(({ body, author_association: association, created_at: le }) => (typeof association === "string" && DE_CONFIANCE.includes(association) && typeof body === "string" && MARQUE_DE_TAKING.test(body) && typeof le === "string" && !Number.isNaN(Date.parse(le)) ? [le] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

// Les stations du projet sur l'onglet Cooks (ticket 2358) : chacune telle que GitHub la dit — les tickets qu'elle tient, et
// son dernier signe de vie dans son gist (runtime/src/stations-github/stations.ts) —, la box comme un ordinateur, par la
// même règle. Aucune n'est distante d'une autre, ni principale : toutes prennent, cuisent, jugent et mergent. Son mot est
// `cooking` (elle tient un ticket), `idle` (fraîche, sans ticket) ou `silent` (tue) ; `presente`, son signe de vie
// frais, absent quand aucun ne se lit pour elle ; `vueLe`, ce dernier signe de vie. Ce que GitHub ne dit pas d'elle —
// son plafond, son bac à sable, ses tickets ordinaires — reste nul.
export function stationsDeGithub(cooks: readonly (Cook & { le: string })[], signes: readonly SigneDeVie[] | null, repository: string, maintenant: number): FactsStation[] {
  return stationsSurGithub({ depot: repository, prises: cooks, signes, maintenant }).map(({ station, etat: state, atteinte, cooks: siens, signeDeVie, retenue }) => ({
    station,
    distante: false,
    plafond: null,
    ordinaires: false,
    bacASable: null,
    prendOrdinaires: false,
    cuisson: state,
    cooks: siens.map(({ ticket, titre }) => ({ ticket, titre, station })),
    ...(atteinte === null ? {} : { presente: atteinte }),
    ...(retenue === undefined ? {} : { retenue }),
    vueLe: signeDeVie,
  }));
}
