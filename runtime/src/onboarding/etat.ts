// Où en est un projet neuf, entre « projet ajouté » et « premier ticket
// servi » : l'onboarding, en quatre étapes, dans l'ordre —
//   1. `depot`          les Apps de brigade autorisées sur le dépôt, son clone,
//                       et l'accès de la station au dépôt, en lecture et en écriture ;
//   2. `machine`        la station qui le cuit, sa cuisine ouverte ;
//   3. `preparation`    le ticket qui prépare le dépôt (`preparation-depot/`), mergé ;
//   4. `premier-ticket` le premier ticket du chef, posé avec le label `fire`.
//
// Chaque étape dit en une phrase ce qui se passe, et, quand un geste du chef
// est attendu, lequel et où le faire. L'étape courante est la première qui
// n'est pas faite ; chacune des autres est faite ou à venir, d'après ses
// propres faits. Le projet est prêt (`pret`) dès que le premier ticket peut
// être posé — les trois premières étapes faites — : son onboarding est fini.
//
// Pur : rien n'est lu ici. Les faits viennent de ce que la station sait déjà
// (son suivi du projet, son clone) et du journal du projet (`lire.ts`). Les
// phrases sont en anglais : c'est l'app qui les montre.
import { CAUSES_DU_PROJET } from "../mise-de-cote.ts";
import { ATTEND_UN_TIERS, REVENU_D_ATTENTE, SANS_STATION, STATION_ABSENTE } from "../events/rail.ts";
import type { Phase } from "../projections/pass.ts";
import type { Etat as EtatDuRail } from "../projections/rail.ts";
import type { SuiviDuProjet } from "../projets/demande.ts";
import { decisionAttendue, type DecisionSansBacASable } from "./attente.ts";

export const ETAPES = ["depot", "machine", "preparation", "premier-ticket"] as const;
export type Etape = (typeof ETAPES)[number];

export const TITRES: Record<Etape, string> = {
  depot: "Repository",
  machine: "Cooking machine",
  preparation: "Repository preparation",
  "premier-ticket": "First ticket",
};

// Ce que le chef a à faire : `quoi`, en une phrase ; `ou`, l'endroit ; `liens`,
// les pages où le faire, s'il y en a.
export type Geste = { quoi: string; ou: string; liens: string[] };

export type EtatDEtape = "faite" | "courante" | "a-venir";

export type EtapeDOnboarding = { etape: Etape; titre: string; etat: EtatDEtape; dit: string; geste: Geste | null };

// Le ticket de préparation, tel que l'app le montre :
// - `en-cours`   ouvert, sur le rail, en attente d'un cook ou entre ses mains ;
// - `en-echec`   son cook a échoué, il est mis de côté — `raison`, et l'heure
//                du prochain essai (`prochainEssai`, un instant ISO) quand elle est connue ;
// - `a-relire`   livré, à la pass : sa PR (`pr`) attend d'être jugée, puis mergée ;
// - `suspendu`   sorti du rail par son label, sans être servi : le rail l'attend toujours ;
// - `faite`      mergé — ou le dépôt servait déjà avant qu'un tel ticket existe ;
// - `abandonne`  fermé, ou disparu, sans être mergé : le rail ne l'attend plus.
export type EtatDePreparation = "en-cours" | "en-echec" | "a-relire" | "suspendu" | "faite" | "abandonne";

export type PreparationVue = {
  ticket: number;
  url: string;
  etat: EtatDePreparation;
  raison: string | null;
  prochainEssai: string | null;
  pr: string | null;
};

export type Onboarding = {
  // `pret` : le premier ticket peut être posé ; l'onboarding est fini (`termine`).
  etat: "en-cours" | "pret";
  termine: boolean;
  courante: Etape | null;
  etapes: EtapeDOnboarding[];
  preparation: PreparationVue | null;
  // La station fait tourner ses cooks sans bac à sable (le dernier
  // `isolation.configured` du journal, `sandbox: null`). Null : on ne le sait pas encore.
  sansBacASable: boolean | null;
  // Une station sans bac à sable retient le projet jusqu'à ce que le chef
  // choisisse : `true` tant que la décision est attendue — rien ne part.
  decisionAttendue: boolean;
};

// Ce que le journal du projet dit de son ticket de préparation.
export type FaitsDePreparation = {
  ticket: number;
  // Sur le rail : son état, la station qui le tient, le motif et l'heure de
  // retour d'un 86. Null : il n'y est pas — pas encore lu, ou sorti.
  rail: { etat: EtatDuRail; station: string | null; raison: string | null; retour: string | null; url: string } | null;
  // Son sort : servi, ou sorti du rail sans l'être (et pourquoi).
  sort: { issue: "served" | "left"; raison: string | null } | null;
  // Sa livraison à la pass : la phase, et sa PR.
  pass: { phase: Phase; pr: string | null } | null;
  // Le setup du projet échoue sur la station où son dernier cook est parti :
  // ce qui a échoué, en une phrase sans majuscule ni point. Absent ou null :
  // rien n'en est su.
  setup?: string | null;
};

export type Entrees = {
  projet: string;
  // `<owner>/<repo>`.
  depot: string;
  // La station principale du projet — celle qui le cuit —, ou null : aucune n'est choisie.
  station: string | null;
  // Ce que cette station dit du projet dans son suivi ; null : rien encore.
  suivi: Pick<SuiviDuProjet, "etat" | "dit" | "autoriser" | "acces" | "clone"> | null;
  // Le dépôt est cloné sur la station.
  clone: boolean;
  sansBacASable: boolean | null;
  // La décision du chef de continuer sans bac à sable, avec la station pour
  // laquelle il l'a prise, ou null.
  decision: Pick<DecisionSansBacASable, "station"> | null;
  // Le ticket de préparation ouvert pour ce projet, ou null.
  preparation: FaitsDePreparation | null;
  // Le premier ticket, autre que celui de préparation, entré sur le rail, ou null.
  premierTicket: { ticket: number; url: string } | null;
  // Des tickets, autres que celui de préparation, ont déjà été servis.
  dejaServi: boolean;
};

// Une phrase : majuscule en tête, point au bout. Pas pour celle qui commence
// par un nom — de station, de projet —, qui s'écrit tel qu'il est.
export function phrase(texte: string): string {
  const net = texte.trim();
  if (net === "") return net;
  const tete = `${net[0]?.toUpperCase() ?? ""}${net.slice(1)}`;
  return /[.!?]$/.test(tete) ? tete : `${tete}.`;
}

// Pourquoi le cook de préparation a été mis de côté, en une phrase.
const RAISONS: Record<string, string> = {
  quota: "the account's quota is used up",
  disconnected: "the Max connection has expired",
  refused: "the model refused to answer",
  "setup-failed": "the worktree setup of the project fails",
  "no-calibration": "the issue carries no calibration (model, effort)",
  "unreadable-card": "the ticket's card cannot be read",
  "pass:unjudged": "the pass could not judge its delivery",
  "pass:still-red": "the pass still finds its delivery red",
  [ATTEND_UN_TIERS]: "it waits for a third party",
  [REVENU_D_ATTENTE]: "it came back from waiting for a third party",
};

// Sans majuscule ni point : `raisonEnClair` en fait une phrase.
function cause(motif: string | null): string {
  if (motif === null || motif === "") return "it was set aside, without a reason";
  const connue = CAUSES_DU_PROJET[motif]?.text ?? RAISONS[motif];
  if (connue !== undefined) return connue;
  if (motif.startsWith(`${SANS_STATION}: `)) return `no station provides ${motif.slice(SANS_STATION.length + 2)}`;
  if (motif.startsWith(`${STATION_ABSENTE}: `)) return `the station that cooks it is absent (${motif.slice(STATION_ABSENTE.length + 2)})`;
  return `it was set aside (${motif})`;
}

export const raisonEnClair = (motif: string | null): string => phrase(cause(motif));

// Les phases où la livraison attend le chef : arrêtée faute de grant, ou
// remontée jusqu'à lui.
const ATTEND_LE_CHEF: readonly Phase[] = ["held", "escalated"];

type Vue = { faite: boolean; dit: string; geste: Geste | null };

// L'écart entre deux essais, dit au chef : « within 30 s », « within 2 min ».
export const dansLeDelai = (secondes: number): string => (secondes < 120 ? `within ${Math.max(1, Math.round(secondes))} s` : `within ${Math.round(secondes / 60)} min`);

function etapeDepot({ depot, station, suivi, clone }: Entrees): Vue {
  if (station === null) return { faite: true, dit: `${depot} is added.`, geste: null };
  if (suivi?.etat === "a-autoriser") {
    return {
      faite: false,
      dit: `brigade's GitHub Apps are not authorized on ${depot} yet: ${station} can neither read nor write there.`,
      geste: { quoi: `Authorize brigade's GitHub Apps on ${depot}.`, ou: "On GitHub, one click per page.", liens: suivi.autoriser },
    };
  }
  // Le clone ne peut pas récupérer le dépôt, ou y pousser : le geste est sur la station.
  if (suivi?.acces !== undefined) {
    return { faite: false, dit: suivi.acces.raison, geste: { quoi: suivi.acces.geste, ou: `On ${station}, under the account that runs it.`, liens: [] } };
  }
  // Le clone échoue : la cause, le compte de la station et le geste — le plus
  // souvent sur GitHub ; l'étape passe au vert seule, à l'essai qui suit le geste.
  if (!clone && suivi?.clone !== undefined) {
    const { raison, geste, ou, liens, reessaieToutesLes } = suivi.clone;
    return { faite: false, dit: `${raison} ${station} tries again ${dansLeDelai(reessaieToutesLes)}: this step turns green by itself once it is fixed.`, geste: { quoi: geste, ou, liens } };
  }
  if (!clone) {
    const dit = suivi === null || suivi.etat === "servi" || suivi.dit === "" ? `${station} checks that it may act on ${depot}, then clones it.` : phrase(suivi.dit);
    return { faite: false, dit, geste: null };
  }
  return { faite: true, dit: `${depot} is authorized and cloned on ${station}.`, geste: null };
}

function etapeMachine(entrees: Entrees): Vue {
  const { projet, station, suivi, sansBacASable } = entrees;
  if (station === null) {
    return {
      faite: false,
      dit: `No station cooks ${projet} yet.`,
      geste: { quoi: `Choose the station that cooks ${projet}.`, ou: "In the app, on the project's page.", liens: [] },
    };
  }
  const sansBac = sansBacASable === true ? `: its cooks run without a sandbox, they read everything the station's account reads` : "";
  // Un accès refusé est dit par l'étape du dépôt : la cuisine attend qu'il soit levé.
  if (suivi?.acces !== undefined) return { faite: false, dit: `${station} opens the kitchen of ${projet} once it may fetch from and push to its repository.`, geste: null };
  // De même pour un clone en échec.
  if (suivi?.clone !== undefined) return { faite: false, dit: `${station} opens the kitchen of ${projet} once it has cloned its repository.`, geste: null };
  if (suivi?.etat === "refuse") return { faite: false, dit: phrase(suivi.dit), geste: null };
  if (decisionAttendue(entrees)) {
    return {
      faite: false,
      dit: `${station} has no sandbox: its cooks would read everything the station's account reads. Nothing is launched for ${projet} until you choose.`,
      geste: { quoi: `Continue without a sandbox on ${station}, or choose another station for ${projet}.`, ou: "In the app, on the project's page.", liens: [] },
    };
  }
  if (suivi?.etat === "servi") return { faite: true, dit: `${station} cooks ${projet}${sansBac}.`, geste: null };
  return { faite: false, dit: `${station} is opening the kitchen of ${projet}${sansBac}.`, geste: null };
}

// Tant que la préparation n'est pas faite, ce que son setup a d'échoué se dit
// à la suite : c'est ce que son cook répare, et ce que le chef doit savoir.
function etapePreparation(entrees: Entrees): Vue & { vue: PreparationVue | null } {
  const vue = etapePreparationSeule(entrees);
  const setup = entrees.preparation?.setup ?? null;
  return vue.faite || setup === null ? vue : { ...vue, dit: `${vue.dit} ${phrase(setup)}` };
}

function etapePreparationSeule(entrees: Entrees): Vue & { vue: PreparationVue | null } {
  const { depot, station, preparation, dejaServi } = entrees;
  if (preparation === null) {
    if (dejaServi) return { faite: true, dit: `${depot} was served before any preparation ticket: nothing to prepare.`, geste: null, vue: null };
    return { faite: false, dit: `${station ?? "The main station"} opens the ticket that prepares ${depot}: its gates, its worktree setup, the sites it may reach.`, geste: null, vue: null };
  }
  const { ticket, rail, sort, pass } = preparation;
  const url = rail?.url ?? `https://github.com/${depot}/issues/${ticket}`;
  const vue = (etat: EtatDePreparation, plus: Partial<PreparationVue> = {}): PreparationVue => ({ ticket, url, etat, raison: null, prochainEssai: null, pr: pass?.pr ?? null, ...plus });
  const surLeTicket = { ou: `On GitHub, on #${ticket}.`, liens: [url] };
  if (sort?.issue === "served") return { faite: true, dit: `#${ticket} is merged: ${depot} is prepared.`, geste: null, vue: vue("faite") };
  if (rail === null) {
    if (sort?.issue === "left" && (sort.raison === "closed" || sort.raison === "gone")) {
      return { faite: true, dit: `#${ticket} left the rail without being merged (${sort.raison}): the rail no longer waits for it.`, geste: null, vue: vue("abandonne") };
    }
    if (sort?.issue === "left" && sort.raison === "unfired") {
      return {
        faite: false,
        dit: `#${ticket} lost its \`fire\` label: no ticket of the project leaves until it is merged.`,
        geste: { quoi: `Put the \`fire\` label back on #${ticket}.`, ...surLeTicket },
        vue: vue("suspendu"),
      };
    }
    if (sort?.issue === "left") {
      return {
        faite: false,
        dit: `#${ticket} left the rail (${sort.raison ?? "no reason"}): no ticket of the project leaves until it is merged.`,
        geste: { quoi: `Put #${ticket} back on the rail, or close it.`, ...surLeTicket },
        vue: vue("suspendu"),
      };
    }
    return { faite: false, dit: `#${ticket} is opened: the kitchen puts it on its rail.`, geste: null, vue: vue("en-cours") };
  }
  switch (rail.etat) {
    case "taken":
      return { faite: false, dit: `A cook on ${rail.station ?? station ?? "the station"} prepares ${depot} (#${ticket}).`, geste: null, vue: vue("en-cours") };
    case "pass": {
      const pr = pass?.pr ?? null;
      if (pass !== null && ATTEND_LE_CHEF.includes(pass.phase)) {
        return {
          faite: false,
          dit: `The preparation PR awaits you: no other ticket leaves before its merge.`,
          geste: { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr ?? url] },
          vue: vue("a-relire"),
        };
      }
      return { faite: false, dit: `The pass judges the preparation PR of #${ticket}.`, geste: null, vue: vue("a-relire") };
    }
    case "86": {
      const duProjet = rail.raison === null ? undefined : CAUSES_DU_PROJET[rail.raison];
      const essai = rail.retour === null ? "it is not retried by itself" : "it is retried by itself";
      return {
        faite: false,
        dit: `The cook of #${ticket} failed — ${cause(rail.raison)}; ${essai}.`,
        geste: duProjet === undefined ? null : { quoi: phrase(duProjet.action), ou: `On ${rail.station ?? station ?? "the station"}.`, liens: [] },
        vue: vue("en-echec", { raison: raisonEnClair(rail.raison), prochainEssai: rail.retour }),
      };
    }
    case "served":
      return { faite: true, dit: `#${ticket} is merged: ${depot} is prepared.`, geste: null, vue: vue("faite") };
    default:
      return { faite: false, dit: `#${ticket} waits for a cook on ${station ?? "the station"}.`, geste: null, vue: vue("en-cours") };
  }
}

function etapePremierTicket({ projet, depot, premierTicket }: Entrees, pret: boolean): Vue {
  if (premierTicket !== null) {
    return { faite: true, dit: pret ? `#${premierTicket.ticket} is on the rail: the kitchen serves it.` : `#${premierTicket.ticket} is on the rail: it leaves once ${depot} is prepared.`, geste: null };
  }
  if (!pret) return { faite: false, dit: `Once ${depot} is prepared, post your first ticket with the \`fire\` label.`, geste: null };
  return {
    faite: false,
    dit: `${projet} is ready: post your first ticket with the \`fire\` label.`,
    geste: { quoi: "Post your first ticket with the `fire` label.", ou: `On GitHub, in the issues of ${depot}.`, liens: [`https://github.com/${depot}/issues/new`] },
  };
}

export function etatDOnboarding(entrees: Entrees): Onboarding {
  const depot = etapeDepot(entrees);
  const machine = etapeMachine(entrees);
  const preparation = etapePreparation(entrees);
  const pret = depot.faite && machine.faite && preparation.faite;
  const vues: Record<Etape, Vue> = { depot, machine, preparation, "premier-ticket": etapePremierTicket(entrees, pret) };
  const courante = ETAPES.find((etape) => !vues[etape].faite) ?? null;
  return {
    etat: pret ? "pret" : "en-cours",
    termine: pret,
    courante,
    etapes: ETAPES.map((etape) => {
      const { faite, dit, geste } = vues[etape];
      return { etape, titre: TITRES[etape], etat: faite ? "faite" : etape === courante ? "courante" : "a-venir", dit, geste: etape === courante ? geste : null };
    }),
    preparation: preparation.vue,
    sansBacASable: entrees.sansBacASable,
    decisionAttendue: decisionAttendue(entrees),
  };
}
