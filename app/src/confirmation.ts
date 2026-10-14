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
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

// Ce que le runtime fait d'un « stop » (docs/runtime.md, « Les garde-fous », et « Ce qu'un arrêt récolte »).
const STOP = [
  "Tous les cooks en cours sont arrêtés dans la seconde, et rien n'est récolté : leurs tickets retournent en attente et repartiront de zéro — ce qu'ils ont déjà dépensé ne livre rien.",
  "Plus aucun cook n'est lancé — redémarrage du runtime compris — jusqu'à « reprendre ».",
];
const REPRENDRE = "Le « stop » est levé, et le disjoncteur refermé : les tickets en attente repartent aussitôt, sur ton quota.";
const MERGE_SANS_TOI = "Une pass verte sera mergée sans toi : la pass merge ce qu'elle juge vert, sans échéance ni nombre d'usages — jusqu'à ce que tu le révoques.";
const PLUS_SANS_TOI = "Plus rien n'est mergé sans toi : la pass s'arrête à la PR ouverte, et chaque livraison verte t'attend — jusqu'à ce que tu le réaccordes.";

// Les cooks en vol à cette lecture, d'après `faits` : chacun avec ses tokens, quand le runtime
// les donne (`miseEnService`) ; sinon ce qu'il en donne, et ce qui manque, dit tel.
function cooksEnVol(lus: Lus): { prix: string[]; enVol?: Confirmation["enVol"]; lu?: string } {
  if ("sans" in lus) return { prix: [`Les cooks en vol ne sont pas lus : ${lus.sans}. Ce n'est pas « aucun cook en vol ».`] };
  const { faits, a } = lus;
  if (faits.miseEnService !== undefined) return { prix: [], enVol: enVolDe(faits.miseEnService, new Map(faits.rail.map(({ ticket, titre }) => [ticket, titre]))), lu: a };
  if (faits.cooks === undefined) return { prix: ["Les cooks en vol ne sont pas lus : le runtime de cette box ne les donne pas dans `faits`. Ce n'est pas « aucun cook en vol »."], lu: a };
  const tickets = faits.cooks.map(({ ticket }) => `#${ticket}`).join(", ");
  return {
    prix: [
      faits.cooks.length === 0
        ? "Aucun cook en cours à cette lecture — ce qu'ils auraient dépensé, le runtime de cette box ne le dit pas."
        : `${faits.cooks.length} cook${s(faits.cooks.length)} en cours à cette lecture (${tickets}) — ce qu'ils ont dépensé, le runtime de cette box ne le dit pas dans \`faits\`.`,
    ],
    lu: a,
  };
}

// Les tickets que « reprendre » laisse partir, d'après `faits`.
const surLeRail = (lus: Lus): string[] => ("sans" in lus ? [] : [`${nombre(lus.faits.compteurs.rail)} ticket${s(lus.faits.compteurs.rail)} sur le rail à cette lecture.`]);

// Ce qu'un « oui » sur la mise en service engage — ou pourquoi le geste ne s'offre pas.
function deLaMiseEnService(id: string, lus: Lus): Confirmation | { refus: string } {
  if ("sans" in lus) return { refus: `rien n'est offert : la version n'est pas lue — ${lus.sans}` };
  const { faits, a } = lus;
  const vu = voirVersion(faits, undefined, (instant) => duree(Date.parse(faits.lu) - Date.parse(instant)));
  const PAS_OFFERT = `rien n'est offert : d'après \`faits\` lu à ${new Date(a).toLocaleTimeString("fr-FR")}, ce geste ne vaut pas en ce moment — la version est « ${vu.etat} »${vu.demande === undefined ? "" : `, et une mise en service est ${vu.demande.etat}`}`;
  if (id === DEMANDER) {
    if (vu.mettre === undefined) return { refus: PAS_OFFERT };
    return { titre: "mettre en service", prix: [vu.mettre.avertissement], ...(vu.enVol === undefined ? {} : { enVol: vu.enVol }), lu: a, choix: [...vu.mettre.choix], renoncer: vu.mettre.renoncer };
  }
  const couper = vu.gestes.find((offert) => offert.id === COUPER);
  if (couper === undefined) return { refus: PAS_OFFERT };
  return { titre: "couper sans attendre le rail calme", prix: [REDEMARRER], ...(vu.enVol === undefined ? {} : { enVol: vu.enVol }), lu: a, choix: [couper], renoncer: "non, attendre le rail calme" };
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
      return { titre: "arrêter la cuisine", prix: [...STOP, ...prix], ...(enVol === undefined ? {} : { enVol }), ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "oui, arrêter la cuisine", dit: `les cooks en cours sont arrêtés${perdus}` }], renoncer: "non, la laisser tourner" };
    }
    case "reprendre": {
      const { prix, enVol, lu } = cooksEnVol(lus);
      return { titre: "reprendre la cuisine", prix: [REPRENDRE, ...surLeRail(lus), ...prix], ...(enVol === undefined ? {} : { enVol }), ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "oui, reprendre la cuisine", dit: "les tickets en attente repartent, sur ton quota" }], renoncer: "non, la laisser à l'arrêt" };
    }
    case "grant-activer":
      return { titre: `accorder le grant \`${nomme}\``, prix: [MERGE_SANS_TOI], choix: [{ id, libelle: `oui, accorder \`${nomme}\``, dit: "une pass verte sera mergée sans toi" }], renoncer: "non, garder la main" };
    case "grant-revoquer":
      return { titre: `révoquer le grant \`${nomme}\``, prix: [PLUS_SANS_TOI], choix: [{ id, libelle: `oui, révoquer \`${nomme}\``, dit: "plus rien n'est mergé sans toi" }], renoncer: "non, le laisser actif" };
    case "manager-allumer":
      return { titre: "allumer le manager", prix: [ALLUMER], chiffrer: true, choix: [{ id, libelle: "oui, allumer le manager", dit: "ce qu'il juge exécutable part aussitôt en cuisine" }], renoncer: "non, le laisser éteint" };
    default:
      return deLaMiseEnService(id, lus);
  }
}
