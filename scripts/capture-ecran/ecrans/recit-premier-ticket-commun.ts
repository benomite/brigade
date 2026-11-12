// Le premier ticket du premier projet du chef, raconté pas à pas (#3302) : « cantine » ajouté par « Add a project » — le
// seul projet du fichier —, cet ordinateur choisi, le dépôt déjà prêt. Puis son rail, lu sur GitHub, lecture après
// lecture : #5 pris par un cook, sa PR #6 ouverte et en pass, renvoyé par la pass et pourquoi, repris, de nouveau en pass —
// et, pour l'écran servi, sa PR mergée. Chaque lecture arrive à la vue comme le process principal l'enverrait : la vue
// raconte ce qu'elle a vu passer.
import type { Faits } from "../../../app/src/faits.ts";
import { cuisine, type Ecran } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { CHOISIR_LE_RECOMMANDE, parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";

const CANTINE = RENDUS.cantine!.facts;
const ISSUE = "https://github.com/chef/cantine/issues/5";
const PR = { numero: 6, url: "https://github.com/chef/cantine/pull/6" };
const TITRE = "La carte du midi";
const RAISON = "the review requested changes on `3f2a9c1` (PR #6):\n\nThe price of a dish shows `NaN €` when the dish has no price yet: show “price to come” instead.";
type Entree = Faits["rail"][number] & { pr?: typeof PR; renvoi?: { n: number; raison: string } };
const entree = (etat: string, plus: Partial<Entree> = {}): Entree => ({ ticket: 5, etat, titre: TITRE, url: ISSUE, activite: null, attente: null, station: "box/claude", ...plus });

// Les lectures du rail, dans l'ordre où elles arrivent.
export const PRIS: Faits = { ...CANTINE, livres: [], rail: [entree("pris")] };
export const EN_PASS: Faits = { ...CANTINE, livres: [], rail: [entree("en pass", { pr: PR })] };
export const RENVOYE: Faits = { ...CANTINE, livres: [], rail: [entree("pris", { pr: PR, renvoi: { n: 1, raison: RAISON } })] };
export const DE_NOUVEAU_EN_PASS: Faits = { ...CANTINE, livres: [], rail: [entree("en pass", { pr: PR, renvoi: { n: 1, raison: RAISON } })] };
export const SERVI: Faits = { ...CANTINE, rail: [], livres: [{ ticket: 5, titre: TITRE, url: ISSUE, livre: "2026-10-13T10:01:00.000Z", station: "box/claude", pr: PR.url, relecture: null }] };

export function recitDuPremierTicket(dit: string, lectures: Faits[]): Ecran {
  const base = parcoursPremierProjet(dit, true, [CHOISIR_LE_RECOMMANDE]);
  return {
    ...base,
    donnees: () => {
      const donnees = base.donnees();
      // Les lectures suivantes du rail arrivent une fois l'espace du projet ouvert, comme celles que la veille relance.
      const suivantes = lectures.flatMap((facts) => cuisine({ cantine: { facts, status: "", station: "" } }).faits.filter(({ sur }) => sur === "surFaits"));
      return { ...donnees, envois: { ...donnees.envois, regarder: { ...donnees.envois.regarder, cantine: [...(donnees.envois.regarder?.cantine ?? []), ...suivantes] } } };
    },
  };
}
