// Les cooks d'un projet sur GitHub seul (ticket 2220, épique 2209), tels que l'onglet Cooks les montre : qui tient chaque
// ticket se lit des commentaires de prise de son issue, comme la station qui prend le ticket le lit
// (runtime/src/github-etat/prise.ts, `tenant`) — ni boîte, ni journal. Le plus ancien commentaire de prise l'emporte ; un
// commentaire de lâcher, ou le retrait du label `taken` ou `fire`, annule toutes les prises postées avant lui. Seul qui a
// la main sur le dépôt prend un ticket : un commentaire d'un autre ne compte pas.
//
// Ce module redit la règle du runtime sans l'importer : prise.ts tire avec lui le rail du runtime, que l'app ne charge pas.
// Un test les joue toutes deux sur les mêmes commentaires (test/vue/cooks/prises.test.ts).
import { stationsSurGithub, type SigneDeVie } from "../../../../runtime/src/stations-github/stations.ts";
import type { Cook } from "../../faits.ts";
import type { StationDesFaits } from "../../ordinaires.ts";

const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];
const LABELS_QUI_LACHENT = ["taken", "fire"];
const MARQUE_DE_PRISE = /^<!-- brigade:prise station=([A-Za-z0-9._/-]+) -->/;
const MARQUE_DE_LACHER = /^<!-- brigade:lache station=([A-Za-z0-9._/-]+) -->/;

type Brut = Record<string, unknown>;

// La prise qui tient un ticket : la station, et l'heure de son commentaire.
export type Prise = { station: string; le: string };

// Qui tient le ticket, d'après les commentaires de son issue et ses événements (`unlabeled`), tels que l'API de GitHub
// les rend ; null si personne. Les faits se rangent par instant, puis par id de commentaire ; un retrait de label passe
// après les commentaires de sa seconde : dans le doute, le lâcher l'emporte.
export function tenantDeLIssue(commentaires: readonly Brut[], evenements: readonly Brut[]): Prise | null {
  const faits: { instant: number; rang: number; prise: Prise | null }[] = [];
  for (const { id, body, author_association: association, created_at: le } of commentaires) {
    if (typeof association !== "string" || !DE_CONFIANCE.includes(association) || typeof le !== "string" || typeof body !== "string") continue;
    const instant = Date.parse(le);
    if (Number.isNaN(instant)) continue;
    const rang = typeof id === "number" ? id : 0;
    const prise = MARQUE_DE_PRISE.exec(body)?.[1];
    if (prise !== undefined) faits.push({ instant, rang, prise: { station: prise, le } });
    else if (MARQUE_DE_LACHER.test(body)) faits.push({ instant, rang, prise: null });
  }
  for (const { event, label, created_at: le } of evenements) {
    const nom = typeof label === "object" && label !== null ? (label as Brut).name : undefined;
    const instant = typeof le === "string" ? Date.parse(le) : Number.NaN;
    if (event === "unlabeled" && typeof nom === "string" && LABELS_QUI_LACHENT.includes(nom) && !Number.isNaN(instant)) faits.push({ instant, rang: Number.POSITIVE_INFINITY, prise: null });
  }
  faits.sort((a, b) => a.instant - b.instant || a.rang - b.rang);
  let tient: Prise | null = null;
  for (const { prise } of faits) {
    if (prise === null) tient = null;
    else if (tient === null) tient = prise;
  }
  return tient;
}

// Les stations du projet sur l'onglet Cooks (ticket 2358) : chacune telle que GitHub la dit — les tickets qu'elle tient, et
// son dernier signe de vie dans son gist (runtime/src/stations-github/stations.ts) —, la box comme un ordinateur, par la
// même règle. Aucune n'est distante d'une autre, ni principale : toutes prennent, cuisent, jugent et mergent. Son mot est
// `cooking` (elle tient un ticket), `idle` (fraîche, sans ticket) ou `silent` (tue) ; `presente`, son signe de vie
// frais, absent quand aucun ne se lit pour elle ; `vueLe`, ce dernier signe de vie. Ce que GitHub ne dit pas d'elle —
// son plafond, son bac à sable, ses tickets ordinaires — reste nul.
export function stationsDeGithub(cooks: readonly (Cook & { le: string })[], signes: readonly SigneDeVie[] | null, depot: string, maintenant: number): StationDesFaits[] {
  return stationsSurGithub({ depot, prises: cooks, signes, maintenant }).map(({ station, etat, atteinte, cooks: siens, signeDeVie, retenue }) => ({
    station,
    distante: false,
    plafond: null,
    ordinaires: false,
    bacASable: null,
    prendOrdinaires: false,
    cuisson: etat,
    cooks: siens.map(({ ticket, titre }) => ({ ticket, titre, station })),
    ...(atteinte === null ? {} : { presente: atteinte }),
    ...(retenue === undefined ? {} : { retenue }),
    vueLe: signeDeVie,
  }));
}
