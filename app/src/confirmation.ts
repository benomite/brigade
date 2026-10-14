// Ce qu'un geste confirmé dit avant de partir : son prix, en clair. Un geste destructif ou
// lourd (gestes.ts, `CONFIRMES`) ne part qu'après un « oui » du chef, et ce « oui » se donne
// devant ce qu'il coûte — pas devant « es-tu sûr ? » (docs/superpowers/specs/
// 2026-10-13-app-poste-de-travail-design.md, « Le modèle, en quatre règles », la troisième).
// La convention est celle du geste de désinstallation : dire ce qu'il va faire. Aucun LLM.
// Le prix se tire de ce que la box a déjà dit : les cooks en vol et ce qu'ils ont dépensé
// (`faits`, `miseEnService` — version.ts), le rail, la version qui attend. Ce qui n'est pas lu
// se dit tel — jamais « aucun cook en vol » à la place d'un « pas lu ». Le prix d'« allumer »
// se complète d'une lecture à la box, au moment du geste (allumage.ts) : la vue la demande.
// Chaque « oui » est un geste du socle, qui part dans le second ; la mise en service en offre
// deux — attendre le rail calme, ou couper. Ce module ne lance rien, n'écrit dans aucun
// terminal, et ne fait rien partir : il dit.
import { AVERTISSEMENT as ALLUMER } from "./allumage.ts";
import type { Projet } from "./config.ts";
import { duree, type Faits } from "./faits.ts";
import { commandeDuGeste, CONFIRMES } from "./gestes.ts";
import { AVERTISSEMENT as REDEMARRER, COUPER, DEMANDER, enVolDe, voir as voirVersion, type Vu as VersionVue } from "./version.ts";
import { heure, nombre } from "./format.ts";

// Un « oui » : le geste du socle qu'il fait partir, ce que son bouton dit, et ce qu'il engage.
export type Choix = { id: string; libelle: string; dit: string };
// `titre` : ce que le geste fait. `prix` : ce qu'il coûte, dans les mots de l'app, une phrase par
// ligne. `enVol` : les cooks en vol à la lecture, et ce qu'ils ont dépensé. `lu` : l'heure de la
// lecture de `faits` dont le prix est tiré — absente, il n'en doit rien. `chiffrer` : le prix
// se complète de `manager backlog`, que la vue demande à la box dès que la confirmation s'ouvre.
// `choix` : les « oui » ; `renoncer` : le « non », qui ne fait rien partir.
export type Confirmation = { titre: string; prix: string[]; enVol?: NonNullable<VersionVue["enVol"]>; lu?: string; chiffrer?: true; choix: Choix[]; renoncer: string };

// Les derniers faits lus d'un projet, et l'heure de leur lecture — ou pourquoi il n'y en a pas.
export type Lus = { faits: Faits; a: string } | { sans: string };

const s = (combien: number) => (combien > 1 ? "s" : "");

// Ce que le runtime fait d'un « stop » (docs/runtime.md, « Les garde-fous », et « Ce qu'un arrêt récolte »).
const STOP = [
  "All running cooks are stopped within the second, and nothing is harvested: their tickets go back to queued and will start again from zero — what they already spent delivers nothing.",
  "No more cooks are launched — runtime restarts included — until “resume”.",
];
const REPRENDRE = "The “stop” is lifted, and the breaker closed: queued tickets start again right away, on your quota.";
const MERGE_SANS_TOI = "A green pass will be merged without you: the pass merges what it judges green, with no expiry or number of uses — until you revoke it.";
const PLUS_SANS_TOI = "Nothing is merged without you any more: the pass stops at the open PR, and every green delivery awaits you — until you enable it again.";

// Les cooks en vol à cette lecture, d'après `faits` : chacun avec ses tokens, quand le runtime
// les donne (`miseEnService`) ; sinon ce qu'il en donne, et ce qui manque, dit tel.
function cooksEnVol(lus: Lus): { prix: string[]; enVol?: Confirmation["enVol"]; lu?: string } {
  if ("sans" in lus) return { prix: [`Cooks in flight are not read: ${lus.sans}. This is not “no cook in flight”.`] };
  const { faits, a } = lus;
  if (faits.miseEnService !== undefined) return { prix: [], enVol: enVolDe(faits.miseEnService, new Map(faits.rail.map(({ ticket, titre }) => [ticket, titre]))), lu: a };
  if (faits.cooks === undefined) return { prix: ["Cooks in flight are not read: this box's runtime does not give them in `faits`. This is not “no cook in flight”."], lu: a };
  const tickets = faits.cooks.map(({ ticket }) => `#${ticket}`).join(", ");
  return {
    prix: [
      faits.cooks.length === 0
        ? "No cook running at this reading — what they would have spent, this box's runtime does not say."
        : `${faits.cooks.length} cook${s(faits.cooks.length)} running at this reading (${tickets}) — what they spent, this box's runtime does not say in \`faits\`.`,
    ],
    lu: a,
  };
}

// Les tickets que « reprendre » laisse partir, d'après `faits`.
const surLeRail = (lus: Lus): string[] => ("sans" in lus ? [] : [`${nombre(lus.faits.compteurs.rail)} ticket${s(lus.faits.compteurs.rail)} on the rail at this reading.`]);

// Ce qu'un « oui » sur la mise en service engage — ou pourquoi le geste ne s'offre pas.
function deLaMiseEnService(id: string, lus: Lus): Confirmation | { refus: string } {
  if ("sans" in lus) return { refus: `nothing is offered: the version is not read — ${lus.sans}` };
  const { faits, a } = lus;
  const vu = voirVersion(faits, undefined, (instant) => duree(Date.parse(faits.lu) - Date.parse(instant)));
  const PAS_OFFERT = `nothing is offered: according to \`faits\` read at ${heure(a)}, this action does not apply right now — the version is “${vu.etat}”${vu.demande === undefined ? "" : `, and a deploy is ${vu.demande.etat}`}`;
  if (id === DEMANDER) {
    if (vu.mettre === undefined) return { refus: PAS_OFFERT };
    return { titre: "deploy", prix: [vu.mettre.avertissement], ...(vu.enVol === undefined ? {} : { enVol: vu.enVol }), lu: a, choix: [...vu.mettre.choix], renoncer: vu.mettre.renoncer };
  }
  const couper = vu.gestes.find((offert) => offert.id === COUPER);
  if (couper === undefined) return { refus: PAS_OFFERT };
  return { titre: "interrupt without waiting for a quiet rail", prix: [REDEMARRER], ...(vu.enVol === undefined ? {} : { enVol: vu.enVol }), lu: a, choix: [couper], renoncer: "no, wait for a quiet rail" };
}

// Ce que ce geste confirmé dira avant de partir, pour ce projet — ou pourquoi il ne s'offre
// pas. Rien pour un geste qui ne se confirme pas, ou que le socle ne connaît pas.
export function confirmationDe(id: unknown, projet: Projet, lus: Lus, grant?: unknown): Confirmation | { refus: string } | undefined {
  if (typeof id !== "string" || !CONFIRMES.includes(id)) return undefined;
  // Un geste qui n'écrirait rien n'a rien à confirmer : son refus se dit à la place.
  const ecrit = commandeDuGeste(id, projet, grant);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  const nomme = String(grant);
  switch (id) {
    case "stop": {
      const { prix, enVol, lu } = cooksEnVol(lus);
      const perdus = enVol === undefined || enVol.cooks.length === 0 ? "" : ` — ${enVol.titre}`;
      return { titre: "stop the kitchen", prix: [...STOP, ...prix], ...(enVol === undefined ? {} : { enVol }), ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "yes, stop the kitchen", dit: `running cooks are stopped${perdus}` }], renoncer: "no, let it run" };
    }
    case "reprendre": {
      const { prix, enVol, lu } = cooksEnVol(lus);
      return { titre: "resume the kitchen", prix: [REPRENDRE, ...surLeRail(lus), ...prix], ...(enVol === undefined ? {} : { enVol }), ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "yes, resume the kitchen", dit: "queued tickets start again, on your quota" }], renoncer: "no, leave it stopped" };
    }
    case "grant-activer":
      return { titre: `enable the \`${nomme}\` grant`, prix: [MERGE_SANS_TOI], choix: [{ id, libelle: `yes, enable \`${nomme}\``, dit: "a green pass will be merged without you" }], renoncer: "no, keep control" };
    case "grant-revoquer":
      return { titre: `revoke the \`${nomme}\` grant`, prix: [PLUS_SANS_TOI], choix: [{ id, libelle: `yes, revoke \`${nomme}\``, dit: "nothing is merged without you any more" }], renoncer: "no, leave it active" };
    case "manager-allumer":
      return { titre: "turn the manager on", prix: [ALLUMER], chiffrer: true, choix: [{ id, libelle: "yes, turn the manager on", dit: "what it judges executable is taken up right away" }], renoncer: "no, leave it off" };
    default:
      return deLaMiseEnService(id, lus);
  }
}
