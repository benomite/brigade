// L'essai à blanc du grant `merge` : ce que la pass aurait mergé si le chef
// l'avait accordé, lu avant de dire oui. Sans grant, une livraison verte que la
// pass arrête répète son merge sans le faire (`pass.rehearsed`) : elle regarde
// la base, n'y joue rien, et l'écrit. Ce que le chef a fait à la place — mergée
// à la main, fermée, laissée ouverte — est déjà au journal, constaté par le
// runtime qui tourne : la liste se lit là, sans GitHub.
import type { Depot } from "./depot.ts";
import type { Evenement } from "./evenements.ts";
import { declarationsDuMotif, JUGES_MODIFIES, type Repetition, type VueDeLaBase } from "./evenements/pass.ts";
import { dateLocale, dureeTapee, GrantRefuse } from "./grant.ts";
import type { EtatDeLaBase } from "./projections/pass.ts";

export const LIRE_LES_ESSAIS = "npm --prefix runtime run grant -- essai";

// Ce que la répétition lit du dépôt : rien n'y est écrit, aucun worktree posé.
export type DepotDEssai = Pick<Depot, "connait" | "rapatrier" | "livree" | "retard" | "arrives" | "changes">;

// Les fichiers croisés nommés au journal : au-delà, la liste n'apprend plus rien.
const CROISES_MAX = 20;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la pass aurait trouvé de la base avant de merger, sous grant — la même
// lecture que sa rencontre, moins tout ce qui a un effet : ni attente écrite,
// ni rejeu des gates. `commun` : vrai pour un fichier qui n'appartient à
// personne, et ne se paie pas un rejeu. Ce qui ne se lit pas ne se devine pas.
export async function repeterLeMerge(
  depot: DepotDEssai,
  livraison: { branch: string | null; checkedBase: string | null },
  controle: EtatDeLaBase | null,
  commun: (fichier: string) => boolean,
): Promise<VueDeLaBase> {
  const inconnue = (reason: string): VueDeLaBase => ({ outcome: "unknown", head: null, behind: null, overlap: [], reason });
  if (controle?.outcome === "red") return { outcome: "wait", head: controle.sha, behind: null, overlap: [], reason: "base-red" };
  // Tout ce qui touche au dépôt peut lever — un clone abîmé, dès la première
  // lecture : l'essai le dit, et l'arrêt qu'il précède s'écrit quand même.
  try {
    if (livraison.branch === null || !depot.connait(livraison.branch)) return inconnue("branch-lost");
    const head = await depot.rapatrier();
    const branche = depot.livree(livraison.branch);
    const { depart, commits: behind } = depot.retard(branche);
    if (behind === 0) return { outcome: "merge", head, behind, overlap: [], reason: null };
    if (livraison.checkedBase === head) return { outcome: "merge", head, behind, overlap: [], reason: "replayed" };
    const arrives = new Set(depot.arrives(livraison.checkedBase ?? depart));
    const croises = depot.changes(branche).filter((fichier) => arrives.has(fichier) && !commun(fichier));
    return croises.length === 0 ? { outcome: "merge", head, behind, overlap: [], reason: null } : { outcome: "replay", head, behind, overlap: croises.slice(0, CROISES_MAX), reason: null };
  } catch (erreur) {
    return inconnue(message(erreur));
  }
}

const court = (sha: string | null) => (sha ?? "?").slice(0, 7);
const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien > 1 ? "s" : ""}`;

// Ce que la pass aurait fait de cette livraison, au vu de la base.
export function direVue({ outcome, base, head, behind, overlap, reason }: Pick<Repetition, "outcome" | "base" | "head" | "behind" | "overlap" | "reason">): string {
  const avance = `${base} avancée de ${pluriel(behind ?? 0, "commit")}`;
  switch (outcome) {
    case "merge":
      if (reason === "replayed") return `aurait mergé, déjà rejouée verte sur ${base} telle qu'elle était`;
      return (behind ?? 0) === 0 ? "aurait mergé" : `aurait mergé sans rejeu, ${avance} hors de ses fichiers`;
    case "replay":
      return `n'aurait pas mergé telle quelle : ${avance} sur ses fichiers (${overlap.slice(0, 5).join(", ")}${overlap.length > 5 ? "…" : ""}), un rejeu des gates aurait tranché — non joué`;
    case "wait":
      return `aurait attendu : ${base} était rouge (${court(head)})`;
    default:
      return `n'a pas pu regarder ${base} (${reason ?? "?"}) : rien n'est dit de ce qu'elle aurait fait`;
  }
}

// La ligne du journal : celle d'un usage du grant, à ceci près que rien n'a bougé.
export function direEssai(repetition: Repetition): string {
  const { pr, base, sha, verdict } = repetition;
  return `essai à blanc, sans grant : merge de ${pr} sur ${base}, commit ${court(sha)}, autorisé par le verdict n° ${verdict} — ${direVue(repetition)} ; rien n'a bougé`;
}

// Ce qu'une livraison répétée est devenue. `open` : rien n'a été constaté
// depuis. `closed` : sa PR a été fermée sans merge — constaté par la pass, ou
// en la lâchant. `merged` : `sha` est le commit mergé, nul s'il n'a pas été relevé.
// `unfollowed` : la pass ne la suit plus — `open` dit si sa PR était encore
// ouverte ce jour-là, nul si personne ne l'a regardé.
export type SuiteDEssai =
  | { quoi: "open" }
  | { quoi: "merged"; at: string; sha: string | null; by: "pass" | "outside"; actor: string | null }
  | { quoi: "closed"; at: string }
  | { quoi: "unfollowed"; at: string; open: boolean | null };

export type Essai = Repetition & { at: string; ticket: number | null; suite: SuiteDEssai };

// Les essais à blanc écrits depuis `depuis` (tous, s'il est nul), dans l'ordre,
// un par PR — une PR rejugée ne garde que sa dernière livraison —, chacun avec
// ce que le journal sait de sa suite. `jamaisMergees` : les arrêts verts que la
// pass ne merge jamais elle-même, sur la même période.
export function lireEssais(evenements: Evenement[], depuis: string | null): { essais: Essai[]; jamaisMergees: number } {
  const parPR = new Map<string, Essai>();
  const apres = (at: string) => depuis === null || at >= depuis;
  let jamaisMergees = 0;
  for (const evenement of evenements) {
    const { at, ticket } = evenement;
    switch (evenement.type) {
      case "pass.rehearsed":
        // Rejugée, elle prend sa place d'aujourd'hui dans la liste.
        parPR.delete(evenement.payload.pr);
        parPR.set(evenement.payload.pr, { ...evenement.payload, at, ticket, suite: { quoi: "open" } });
        break;
      case "merge.done": {
        const essai = parPR.get(evenement.payload.pr);
        if (essai) essai.suite = { quoi: "merged", at, sha: evenement.payload.sha, by: evenement.payload.by === "pass" ? "pass" : "outside", actor: evenement.payload.actor ?? null };
        break;
      }
      case "pass.pr-closed": {
        const essai = parPR.get(evenement.payload.pr);
        if (essai && essai.suite.quoi !== "merged") essai.suite = { quoi: "closed", at };
        break;
      }
      // Le ticket a quitté le rail : ce que GitHub disait de la PR ce jour-là.
      case "pass.abandoned":
        for (const essai of parPR.values()) {
          if (essai.ticket !== ticket || essai.branch !== evenement.payload.branch) continue;
          if (evenement.payload.merged === true) {
            if (essai.suite.quoi !== "merged") essai.suite = { quoi: "merged", at, sha: null, by: "outside", actor: null };
          } else if (essai.suite.quoi !== "open") continue;
          // Fermée sans merge avant que la pass ne l'ait constaté : c'est le
          // refus du chef, pas une livraison perdue de vue.
          else if (evenement.payload.closed === true) essai.suite = { quoi: "closed", at };
          else essai.suite = { quoi: "unfollowed", at, open: evenement.payload.pr !== null };
        }
        break;
      // Reparti sur une autre branche, le ticket laisse là sa livraison arrêtée.
      case "cook.launched":
        for (const essai of parPR.values()) {
          if (essai.ticket === ticket && essai.suite.quoi === "open" && essai.branch !== evenement.payload.branch) essai.suite = { quoi: "unfollowed", at, open: null };
        }
        break;
      case "pass.held": {
        const motif = String(evenement.payload.reason);
        if (apres(at) && (motif === JUGES_MODIFIES || declarationsDuMotif(motif) !== null)) jamaisMergees++;
        break;
      }
    }
  }
  return { essais: [...parPR.values()].filter((essai) => apres(essai.at)), jamaisMergees };
}

const autreCommit = (essai: Essai) => essai.suite.quoi === "merged" && essai.suite.sha !== null && essai.suite.sha !== essai.sha;
// Ce que le chef a mergé lui-même — un merge de la pass, le grant accordé
// depuis, n'est pas son geste —, et l'écart entre son merge et le verdict.
const parLeChef = (essai: Essai) => essai.suite.quoi === "merged" && essai.suite.by === "outside";
const ecart = (essai: Essai) => parLeChef(essai) && autreCommit(essai);
const desaccord = (essai: Essai) => essai.suite.quoi === "closed" && essai.outcome === "merge";

function direSuite(essai: Essai): string {
  const { suite } = essai;
  switch (suite.quoi) {
    case "open":
      return "encore ouverte";
    case "merged": {
      const qui = suite.by === "pass" ? `mergée par la pass le ${suite.at}` : `mergée à la main le ${suite.at}${suite.actor === null ? "" : ` par ${suite.actor}`}`;
      if (suite.sha === null) return `${qui}, commit non relevé`;
      return autreCommit(essai) ? `${ecart(essai) ? "ÉCART — " : ""}${qui}, sur un autre commit : ${court(suite.sha)} au lieu de ${court(essai.sha)}` : `${qui}, même commit`;
    }
    case "closed":
      return `${desaccord(essai) ? "DÉSACCORD — " : ""}PR fermée sans merge le ${suite.at}`;
    case "unfollowed":
      return `plus suivie depuis le ${suite.at}${suite.open === null ? " : le ticket est reparti sur une autre branche" : suite.open ? ", sa PR encore ouverte ce jour-là" : ", sans PR ouverte ce jour-là"}`;
  }
}

// La liste que le chef lit avant d'accorder : une livraison par ligne, ce
// qu'il en a fait en regard, puis le compte — le chiffre sur lequel on accorde.
export function montrerEssais(evenements: Evenement[], depuis: string | null): string[] {
  const { essais, jamaisMergees } = lireEssais(evenements, depuis);
  const tete = `essai à blanc — ce que la pass aurait mergé sous le grant \`merge\`, depuis le ${depuis ?? "début du journal"}`;
  const autres =
    jamaisMergees === 0
      ? []
      : [
          `${jamaisMergees} ${jamaisMergees > 1 ? "autres livraisons vertes arrêtées" : "autre livraison verte arrêtée"} que la pass ne merge jamais elle-même, grant ou pas (juges ou déclarations modifiés) : ${jamaisMergees > 1 ? "elles ne sont" : "elle n'est"} pas dans ce compte`,
        ];
  if (essais.length === 0) return [tete, "aucune livraison verte arrêtée faute de grant", ...autres];

  const combien = (garde: (essai: Essai) => boolean) => essais.filter(garde).length;
  const s = (n: number) => (n > 1 ? "s" : "");
  const rejeu = combien((essai) => essai.outcome === "replay");
  const attente = combien((essai) => essai.outcome === "wait");
  const inconnu = combien((essai) => essai.outcome === "unknown");
  const reserves = [
    ...(rejeu === 0 ? [] : [`${rejeu} qu'un rejeu des gates aurait tranchée${s(rejeu)}`]),
    ...(attente === 0 ? [] : [`${attente} qu'elle aurait fait attendre`]),
    ...(inconnu === 0 ? [] : [`${inconnu} dont elle n'a rien pu dire`]),
  ];
  const mergees = combien(parLeChef);
  const parLaPass = combien((essai) => essai.suite.quoi === "merged") - mergees;
  const ecarts = combien(ecart);
  const fermees = combien((essai) => essai.suite.quoi === "closed");
  const ouvertes = combien((essai) => essai.suite.quoi === "open");
  const lachees = combien((essai) => essai.suite.quoi === "unfollowed");
  const desaccords = combien(desaccord);
  return [
    tete,
    `lu au journal seul, GitHub n'est pas interrogé : l'état des PR est celui que le runtime a constaté — dernier fait au journal le ${evenements.at(-1)?.at ?? "?"}`,
    "",
    ...essais.flatMap((essai) => [
      `${essai.at}  #${essai.ticket}  ${essai.pr}  ${court(essai.sha)} sur ${essai.base}  verdict n° ${essai.verdict}  ${direVue(essai)}`,
      `    → ${direSuite(essai)}`,
    ]),
    "",
    `sur ${essais.length} livraison${s(essais.length)} arrêtée${s(essais.length)} faute de grant, la brigade en aurait mergé ${combien((essai) => essai.outcome === "merge")}${reserves.length === 0 ? "" : ` ; ${reserves.join(", ")}`}`,
    `tu en as mergé ${mergees}${ecarts === 0 ? "" : ` (dont ${ecarts} sur un autre commit)`}, fermé ${fermees} ; ${ouvertes} encore ouverte${s(ouvertes)}${lachees === 0 ? "" : `, ${lachees} plus suivie${s(lachees)}`}${parLaPass === 0 ? "" : ` ; la pass en a mergé ${parLaPass} elle-même depuis`}`,
    `désaccords : ${desaccords === 0 ? "aucun" : `${desaccords} fermée${s(desaccords)} sans merge que la brigade aurait mergée${s(desaccords)}`} · écarts : ${ecarts === 0 ? "aucun" : `${ecarts} mergée${s(ecarts)} sur un autre commit que celui du verdict`}`,
    ...autres,
  ];
}

// `--depuis` : une date (le début de cette journée), une date et une heure —
// à l'heure de la machine —, ou une durée qui remonte de `maintenant`.
export function lireDepuis(valeur: string, maintenant: Date): string {
  const complet = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}))?$/.exec(valeur);
  const duree = dureeTapee(valeur);
  let instant: Date | null = null;
  if (complet) {
    const [, annee, mois, jour, h, min] = complet;
    instant = dateLocale(Number(annee), Number(mois), Number(jour), Number(h ?? 0), Number(min ?? 0));
  } else if (duree !== null) instant = new Date(maintenant.getTime() - duree);
  if (instant === null || Number.isNaN(instant.getTime())) {
    throw new GrantRefuse(`--depuis : « ${valeur} » ne se lit pas — attendu une date (2026-10-08), une date et une heure (2026-10-08T14:00) ou une durée (48h, 7j)`);
  }
  if (instant.getTime() > maintenant.getTime()) throw new GrantRefuse(`--depuis : ${valeur} n'est pas encore arrivé`);
  return instant.toISOString();
}

// Ce que le chef a tapé après `essai` : `--depuis <date ou durée>`, ou rien —
// tout le journal.
export function lireOptionsDEssai(options: string[], maintenant: Date): string | null {
  if (options.length === 0) return null;
  const [option, valeur, ...reste] = options;
  if (option !== "--depuis") throw new GrantRefuse(`option inconnue : ${option}`);
  if (valeur === undefined || reste.length > 0) throw new GrantRefuse("--depuis attend une valeur, et une seule");
  return lireDepuis(valeur, maintenant);
}
