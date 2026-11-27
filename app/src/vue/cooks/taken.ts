// Les cooks d'un projet sur GitHub seul (ticket 2220, épique 2209), tels que l'onglet Cooks les montre : qui tient chaque
// ticket se lit des commentaires de prise de son issue, comme la station qui prend le ticket le lit
// (runtime/src/github-etat/prise.ts, `tenant`) — ni boîte, ni journal. Le plus ancien commentaire de prise l'emporte ; un
// commentaire de lâcher, ou le retrait du label `taken` ou `fire`, annule toutes les prises postées avant lui. Seul qui a
// la main sur le dépôt prend un ticket : un commentaire d'un autre ne compte pas.
//
// Ce module redit la règle du runtime sans l'importer : prise.ts tire avec lui le rail du runtime, que l'app ne charge pas.
// Un test les joue toutes deux sur les mêmes commentaires (test/vue/cooks/taken.test.ts).
import { stationsSurGithub, type SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import type { Cook } from "../../facts.ts";
import type { FactsStation } from "../../ordinary.ts";

const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];
const LABELS_WHO_RELEASE = ["taken", "fire"];
const BRAND_OF_TAKING = /^<!-- brigade:prise station=([A-Za-z0-9._/-]+) -->/;
const BRAND_OF_RELEASE = /^<!-- brigade:lache station=([A-Za-z0-9._/-]+) -->/;

type Raw = Record<string, unknown>;

// La prise qui tient un ticket : la station, et l'heure de son commentaire.
export type Taking = { station: string; le: string };

// Qui tient le ticket, d'après les commentaires de son issue et ses événements (`unlabeled`), tels que l'API de GitHub
// les rend ; null si personne. Les faits se rangent par instant, puis par id de commentaire ; un retrait de label passe
// après les commentaires de sa seconde : dans le doute, le lâcher l'emporte.
export function holdingOfTheIssue(comments: readonly Raw[], events: readonly Raw[]): Taking | null {
  const facts: { instant: number; rang: number; prise: Taking | null }[] = [];
  for (const { id, body, author_association: association, created_at: the } of comments) {
    if (typeof association !== "string" || !OF_TRUST.includes(association) || typeof the !== "string" || typeof body !== "string") continue;
    const instant = Date.parse(the);
    if (Number.isNaN(instant)) continue;
    const rank = typeof id === "number" ? id : 0;
    const taking = BRAND_OF_TAKING.exec(body)?.[1];
    if (taking !== undefined) facts.push({ instant, rang: rank, prise: { station: taking, le: the } });
    else if (BRAND_OF_RELEASE.test(body)) facts.push({ instant, rang: rank, prise: null });
  }
  for (const { event, label, created_at: the } of events) {
    const name = typeof label === "object" && label !== null ? (label as Raw).name : undefined;
    const instant = typeof the === "string" ? Date.parse(the) : Number.NaN;
    if (event === "unlabeled" && typeof name === "string" && LABELS_WHO_RELEASE.includes(name) && !Number.isNaN(instant)) facts.push({ instant, rang: Number.POSITIVE_INFINITY, prise: null });
  }
  facts.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  let holds: Taking | null = null;
  for (const { prise: taking } of facts) {
    if (taking === null) holds = null;
    else if (holds === null) holds = taking;
  }
  return holds;
}

// Les prises d'un ticket, de la plus ancienne à la plus récente : l'heure de chaque commentaire de prise de confiance. Chaque
// relance d’un cook en pose une (ticket 3823) : le rail les compte pour dire un ticket relancé en boucle.
export function takenOfTheIssue(comments: readonly Raw[]): string[] {
  return comments
    .flatMap(({ body, author_association: association, created_at: the }) => (typeof association === "string" && OF_TRUST.includes(association) && typeof body === "string" && BRAND_OF_TAKING.test(body) && typeof the === "string" && !Number.isNaN(Date.parse(the)) ? [the] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

// Les stations du projet sur l'onglet Cooks (ticket 2358) : chacune telle que GitHub la dit — les tickets qu'elle tient, et
// son dernier signe de vie dans son gist (runtime/src/stations-github/stations.ts) —, la box comme un ordinateur, par la
// même règle. Aucune n'est distante d'une autre, ni principale : toutes prennent, cuisent, jugent et mergent. Son mot est
// `cooking` (elle tient un ticket), `idle` (fraîche, sans ticket) ou `silent` (tue) ; `presente`, son signe de vie
// frais, absent quand aucun ne se lit pour elle ; `vueLe`, ce dernier signe de vie. Ce que GitHub ne dit pas d'elle —
// son plafond, son bac à sable, ses tickets ordinaires — reste nul.
export function stationsOfGithub(cooks: readonly (Cook & { le: string })[], signs: readonly SigneDeVie[] | null, repository: string, now: number): FactsStation[] {
  return stationsSurGithub({ depot: repository, prises: cooks, signes: signs, maintenant: now }).map(({ station, etat: state, atteinte: reached, cooks: itsOwn, signeDeVie: signOfLife, retenue: retainedOne }) => ({
    station,
    distante: false,
    plafond: null,
    ordinaires: false,
    bacASable: null,
    prendOrdinaires: false,
    cuisson: state,
    cooks: itsOwn.map(({ ticket, titre: title }) => ({ ticket, titre: title, station })),
    ...(reached === null ? {} : { presente: reached }),
    ...(retainedOne === undefined ? {} : { retenue: retainedOne }),
    vueLe: signOfLife,
  }));
}
