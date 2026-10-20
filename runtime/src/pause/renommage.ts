// Le renommage du code, joué dans la pause que le chef a acceptée
// (`pause.ts`) : sur son « oui », et sur lui seul, le runtime prépare une
// branche sur la tête de la branche d'intégration fraîchement rapatriée, y
// joue l'outil de renommage (`scripts/rename-code/rename.sh --apply`, #1039),
// commite l'arbre renommé, le pousse, ouvre sa PR et la remet à la pass, hors
// du rail — comme la livraison du carnet. La pass la juge comme toute
// livraison : la fusion avec la base, les gates, le reviewer, la CI ; verte,
// elle la merge sous grant, dans la même pause, puisque la pause laisse passer
// cette PR et nulle autre. Rien ici ne merge.
//
// La pause est levée par le renommage lui-même, sans geste du chef :
//
// - mergé : la pause est levée, la cuisine repart, et les zones du rail se
//   lisent sur les nouveaux chemins (`reprise.ts`) ;
// - échoué — l'outil, les gates rouges, un conflit avec la base, la pass qui ne
//   juge pas ou s'arrête avant le merge, sa PR fermée — : rien n'est mergé, la
//   pause est levée, et la carte de la file dit pourquoi ;
// - hors délai : passé `LIMITE_DU_RENOMMAGE_MS` depuis le « oui », l'outil est
//   arrêté s'il tourne encore, et la pause levée de même — sauf si le merge
//   est déjà parti vers GitHub (`grant.used`), dont le sort est alors attendu.
//
// Une PR de renommage abandonnée n'est jamais mergée par la pass, pause levée
// ou non (`renommageEcarte`) : elle reste ouverte, sans merge. Le « oui »
// retiré par le chef abandonne de même le renommage en cours.
//
// Tout se relit du journal : un renommage parti dans une vie du runtime qui
// s'est arrêtée avant de rien remettre à la pass est dit interrompu, et la
// pause levée ; remis à la pass, il est suivi comme avant.
import { randomUUID } from "node:crypto";
import { environnementCook } from "../claude.ts";
import type { Cloison } from "../cloison.ts";
import type { Depot } from "../depot.ts";
import { ENCORE_ROUGE, A_RELIRE } from "../events/pass.ts";
import { jouerOutil, jouerSetup, SCRIPT_SETUP } from "../gates.ts";
import { geste } from "../geste.ts";
import type { GitHub } from "../github.ts";
import type { Pass } from "../pass.ts";
import { etatDuGrant } from "../projections/pass.ts";
import type { Runtime } from "../runtime.ts";
import type { CauseDEchec, FaitPause } from "./evenements.ts";
import { LIMITE_DU_RENOMMAGE_MS, pauseAccordee, pauseEnCours, type PauseAccordee } from "./pause.ts";
import { deplacementsDeLOutil, LIGNE_DE_DEPLACEMENT, reprendreLesZones } from "./reprise.ts";

const AUTEUR = "rename";
// Le run d'un renommage : c'est lui qui nomme sa branche, comme celle d'un cook.
const PREFIXE = "renommage-";
export const estUnRenommage = (run: string): boolean => run.startsWith(PREFIXE);

// L'outil, tel que son README le joue : il renomme l'arbre en place, puis le
// prouve ; s'il échoue, il défait tout, et sort en erreur.
export const OUTIL_DE_RENOMMAGE = { commande: "scripts/rename-code/rename.sh", args: ["--apply"] };
const SUJET = "refactor: les termes du glossaire du code renommés en anglais par scripts/rename-code";
const TITRE = "Renommage du code : les termes du glossaire en anglais (scripts/rename-code)";
const LIGNE_MAX = 300;

export type OptionsRenommage = {
  // Le dépôt de la station : la branche du renommage se prépare, se commite
  // et se pousse comme celle d'un cook.
  depot: Pick<Depot, "preparer" | "retirer" | "ranger" | "pousser" | "recolter" | "vue">;
  github: Pick<GitHub, "ouvrirPR" | "prDeBranche">;
  // La branche d'intégration : celle d'où part le renommage, et que vise sa PR.
  base: string;
  // L'outil, joué dans le worktree. Par défaut, celui de `scripts/rename-code`.
  outil?: { commande: string; args: string[] };
  // Au-delà, depuis le « oui » du chef, le renommage est abandonné.
  limiteMs?: number;
  // L'environnement du setup et de l'outil. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  cloison?: Cloison | null;
  maintenant?: () => Date;
  // Où va ce que le renommage a à dire hors du journal (journald).
  avertir?: (message: string) => void;
};

// Ce que la pass a fait de la PR du renommage : mergée, ou ce qui la retient
// de l'être pour de bon — null, elle la juge encore.
type FinDeLaPass = { outcome: "merged" } | { outcome: "failed"; cause: CauseDEchec; pourquoi: string } | null;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const enLigne = (texte: string) => `\`${texte.replaceAll("`", "'").slice(0, LIGNE_MAX)}\``;

// Le renommeur : un passage à chaque réveil, que `brancherRenommage` lance.
// Un passage ne fait que lire le journal et décider ; le renommage lui-même —
// le setup, l'outil, le push — tourne à part, et un passage pendant qu'il
// tourne peut l'abandonner.
export function renommeur(runtime: Runtime & Pick<Pass, "prendreHorsRail">, options: OptionsRenommage): { passer(): void; arreter(): void; enCours(): Promise<void> | null } {
  const { journal, projet } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const outil = options.outil ?? OUTIL_DE_RENOMMAGE;
  const limiteMs = options.limiteMs ?? LIMITE_DU_RENOMMAGE_MS;
  const env = environnementCook(options.env ?? process.env);
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const noter = (fait: FaitPause) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  const minutes = Math.round(limiteMs / 60_000);

  let arrete = false;
  // Le renommage qui tourne dans ce process : sa demande, de quoi l'abandonner,
  // et sa fin.
  let vol: { request: number; abandon: AbortController; fin: Promise<void> } | null = null;

  const parti = (request: number) => base.lire<{ un: number }>("SELECT 1 AS un FROM events WHERE type = 'rename.started' AND json_extract(payload, '$.request') = ? LIMIT 1", request).length > 0;
  // L'intention de merger est écrite, et son sort pas encore : le merge est
  // parti vers GitHub, rien ne le rattrape.
  const mergeEnVol = (numero: number) => journal.duTicket(numero).findLast((e) => e.type === "grant.used" || e.type === "merge.done" || e.type === "merge.failed")?.type === "grant.used";

  // La pause levée sur un échec, si elle tient encore pour cette demande et
  // qu'aucun merge n'est parti : rien n'est mergé. Le renommage en cours, s'il
  // tourne, est abandonné.
  const echouer = (request: number, cause: CauseDEchec, pourquoi: string): void => {
    const leve = base.transaction(() => {
      const pause = pauseEnCours(base);
      if (pause === null || pause.request !== request) return false;
      if (pause.pr !== null && mergeEnVol(pause.pr)) return false;
      noter({ type: "pause.released", payload: { request, why: pourquoi, outcome: "failed", cause } });
      return true;
    });
    if (!leve) return;
    if (vol?.request === request) vol.abandon.abort();
    avertir(`brigade : le renommage du code a échoué (${cause}) — ${pourquoi} — rien n'est mergé, la pause est levée`);
  };
  const reussir = (request: number, pr: string): void => {
    const leve = base.transaction(() => {
      if (pauseEnCours(base)?.request !== request) return false;
      noter({ type: "pause.released", payload: { request, why: `the code rename is merged: ${pr}`, outcome: "merged" } });
      reprendreLesZones(journal, projet, AUTEUR);
      return true;
    });
    if (leve) avertir(`brigade : le renommage du code est mergé (${pr}) — la pause est levée, la cuisine repart`);
  };

  // Ce que la pass a fait de la PR du renommage, lu à son journal. Une
  // livraison arrêtée pour ses juges n'est pas finie : son second juge peut la
  // rendre verte.
  const finDeLaPass = (numero: number, pr: string): FinDeLaPass => {
    const faits = journal.duTicket(numero);
    const dernier = faits.findLast((e) => e.type === "merge.done" || e.type === "pass.pr-closed" || e.type === "pass.escalated" || (e.type === "pass.held" && e.payload.reason !== A_RELIRE));
    if (dernier === undefined) return null;
    switch (dernier.type) {
      case "merge.done":
        return { outcome: "merged" };
      case "pass.pr-closed":
        return { outcome: "failed", cause: "closed", pourquoi: `its PR was closed without merge: ${pr}` };
      case "pass.held": {
        const { reason, cause } = dernier.payload;
        return { outcome: "failed", cause: "held", pourquoi: `the pass stopped short of merging it (\`${reason}\`${cause ? `: ${cause}` : ""}): ${pr}` };
      }
      case "pass.escalated": {
        const { reason, cause } = dernier.payload;
        if (reason !== ENCORE_ROUGE) return { outcome: "failed", cause: "unjudged", pourquoi: `the pass could not judge it (\`${cause ?? reason}\`): ${pr}` };
        const juge = faits.findLast((e) => e.type === "pass.judged");
        if (juge?.type === "pass.judged") {
          const { merged, gates } = juge.payload;
          if (merged === null) return { outcome: "failed", cause: "conflict", pourquoi: `the pass judged it red: the renamed branch no longer merges into \`${options.base}\` (conflict): ${pr}` };
          if (gates.outcome === "red" || gates.outcome === "timeout") {
            const echecs = gates.failures.length > 0 ? gates.failures.slice(0, 3).map(enLigne).join(", ") : gates.outcome === "timeout" ? "stopped at their time limit" : `exit code ${gates.code ?? "?"}`;
            return { outcome: "failed", cause: "gates", pourquoi: `the pass judged it red: red gates — ${echecs}: ${pr}` };
          }
        }
        return { outcome: "failed", cause: "verdict", pourquoi: `the pass judged it red: the reviewer or the CI found what blocks it: ${pr}` };
      }
      default:
        return null;
    }
  };

  // Le renommage, de la branche à la PR remise à la pass. Chaque échec lève
  // la pause en disant pourquoi ; abandonné — hors délai, le « oui » retiré, le
  // runtime qui s'arrête —, il ne laisse rien derrière lui que sa branche.
  const renommer = async (pause: PauseAccordee, echeance: number, signal: AbortSignal): Promise<void> => {
    const { request } = pause;
    const run = `${PREFIXE}${randomUUID().slice(0, 8)}`;
    let worktree: string;
    let branche: string;
    try {
      ({ worktree, branche } = await depot.preparer(run));
    } catch (erreur) {
      return echouer(request, "delivery", `its branch could not be prepared on the latest \`${options.base}\`: ${message(erreur)}`);
    }
    const retirer = () => {
      try {
        depot.retirer(worktree, branche);
      } catch (erreur) {
        avertir(`brigade : worktree du renommage ${run} non retiré — ${message(erreur)}`);
      }
    };
    const abandonne = () => arrete || signal.aborted;
    if (abandonne()) return retirer();
    // La tête dont la branche vient de partir : celle que le rapatriement de
    // `preparer` a vue, la dernière de la base.
    const tete = depot.vue();
    // La pause a pu être levée pendant la préparation : rien ne part alors.
    const ecrit = base.transaction(() => {
      if (pauseAccordee(base)?.request !== request) return false;
      noter({ type: "rename.started", payload: { request, run, branch: branche, base: tete, deadline: new Date(echeance).toISOString() } });
      return true;
    });
    if (!ecrit) return retirer();

    // Le setup, puis l'outil, sous ce qui reste du délai.
    const reste = () => Math.max(1000, echeance - maintenant().getTime());
    const demande = { worktree, ticket: pause.ticket ?? 0, env, cloison: options.cloison, signal };
    const setup = await jouerSetup({ ...demande, delaiMs: reste() });
    if (abandonne()) return retirer();
    if (!setup.pret) {
      retirer();
      const fin = setup.sortie.trim().split("\n").at(-1) ?? "";
      return echouer(request, "setup", `the worktree's setup failed (\`${SCRIPT_SETUP}\`, ${setup.depasse ? "stopped at its time limit" : `exit code ${setup.code ?? "?"}`})${fin === "" ? "" : `: ${enLigne(fin)}`}`);
    }
    const joue = await jouerOutil(outil.commande, outil.args, { ...demande, env: setup.env, delaiMs: reste() }, LIGNE_DE_DEPLACEMENT);
    if (abandonne()) return retirer();
    if (joue.depasse) {
      retirer();
      return echouer(request, "timeout", `the rename tool ran past the pause's limit of ${minutes} min from the chef's « yes »: stopped`);
    }
    if (joue.code !== 0) {
      retirer();
      const fin = joue.fin.split("\n").at(-1) ?? "";
      return echouer(request, "tool", `the rename tool failed (\`${[outil.commande, ...outil.args].join(" ")}\`, ${joue.code === null ? "stopped" : `exit code ${joue.code}`})${fin === "" ? "" : `: ${enLigne(fin)}`} — the tree was left as it was`);
    }
    let commit: string | null;
    try {
      commit = depot.recolter(worktree, branche, SUJET);
    } catch (erreur) {
      retirer();
      return echouer(request, "tool", `the renamed tree could not be committed: ${message(erreur)}`);
    }
    if (commit === null) {
      retirer();
      return echouer(request, "tool", "the rename tool renamed nothing");
    }
    const sha = commit;
    // Ce que l'outil a déplacé : ce par quoi les livraisons retenues seront
    // portées sur le nouvel arbre, une fois le renommage mergé.
    const moves = deplacementsDeLOutil(joue.retenues);

    // Sa branche, jamais celle d'intégration ; et une PR, que rien ici ne merge.
    const ranger = () => depot.ranger(worktree, branche).catch((erreur) => avertir(`brigade : worktree du renommage ${run} non rangé — ${message(erreur)}`));
    let pr: string;
    let numero: number;
    try {
      depot.pousser(branche);
      pr = await github.ouvrirPR({ branche, base: options.base, titre: TITRE, corps: corpsDeLaPR({ run, base: options.base, tete, echeance: new Date(echeance).toISOString(), outil }) });
      const ouverte = await github.prDeBranche(branche);
      if (ouverte === null) throw new Error(`GitHub ne rend pas la PR qu'il vient d'ouvrir (${pr})`);
      numero = ouverte.number;
    } catch (erreur) {
      await ranger();
      return echouer(request, "delivery", `the renamed branch did not leave: ${message(erreur)}`);
    }
    // Remise à la pass du même geste que son écriture — si la pause tient
    // encore : levée entre-temps, la PR reste ouverte, et personne ne la suit.
    const remise = base.transaction(() => {
      if (arrete || pauseAccordee(base)?.request !== request) return false;
      noter({ type: "rename.delivered", payload: { request, run, pr, number: numero, sha, moves } });
      runtime.prendreHorsRail({ run, branche, pr, numero });
      return true;
    });
    if (!remise) avertir(`brigade : le renommage ${run} a ouvert ${pr} après la fin de sa pause — elle n'est pas remise à la pass : à fermer`);
    await ranger();
  };

  const lancer = (pause: PauseAccordee, echeance: number) => {
    // Sans grant, la pass ne mergerait pas le renommage : rien ne part.
    if (!etatDuGrant(base, "merge", maintenant())?.active) {
      return echouer(
        pause.request,
        "grant",
        `the \`merge\` grant is not active: the pass could not merge the rename, so nothing was played — enable it (\`${geste("grant enable merge")}\`), then ask for the pause again`,
      );
    }
    const abandon = new AbortController();
    const enVol = { request: pause.request, abandon, fin: Promise.resolve() };
    vol = enVol;
    enVol.fin = renommer(pause, echeance, abandon.signal)
      .catch((erreur) => {
        if (arrete) return;
        try {
          echouer(pause.request, "tool", `the rename stumbled: ${message(erreur)}`);
        } catch (ecriture) {
          avertir(`brigade : le renommage du code a buté, et son échec ne s'écrit pas — ${message(erreur)} ; ${message(ecriture)}`);
        }
      })
      .finally(() => {
        if (vol === enVol) vol = null;
      });
  };

  // Un passage : lit la pause et ce qu'il en est, et décide.
  const passer = () => {
    if (arrete) return;
    const pause = pauseEnCours(base);
    // Le « oui » retiré, ou la pause levée : le renommage en cours est abandonné.
    if (vol !== null && (pause === null || pause.request !== vol.request)) vol.abandon.abort();
    if (pause === null || pause.agreedAt === null) return;
    const { request } = pause;
    const echeance = Date.parse(pause.agreedAt) + limiteMs;
    // Remis à la pass : son sort est le sien.
    if (pause.pr !== null) {
      const pr = journal.duTicket(pause.pr).find((e) => e.type === "pass.entered");
      const adresse = pr?.type === "pass.entered" ? pr.payload.pr : `#${pause.pr}`;
      const fin = finDeLaPass(pause.pr, adresse);
      if (fin?.outcome === "merged") return reussir(request, adresse);
      if (fin?.outcome === "failed") return echouer(request, fin.cause, fin.pourquoi);
    }
    if (maintenant().getTime() >= echeance) {
      return echouer(request, "timeout", `the rename ran past the pause's limit of ${minutes} min from the chef's « yes »: abandoned`);
    }
    if (vol !== null) return;
    if (!parti(request)) return lancer({ ...pause, agreedAt: pause.agreedAt }, echeance);
    // Parti dans une autre vie du runtime, sans rien avoir remis à la pass :
    // rien ne le reprend.
    if (pause.pr === null) echouer(request, "interrupted", "the runtime stopped while the rename ran, before handing it to the pass: nothing was delivered");
  };

  return {
    passer,
    arreter() {
      arrete = true;
      vol?.abandon.abort();
    },
    enCours: () => vol?.fin ?? null,
  };
}

// Le corps de la PR du renommage : ce qu'elle est, d'où elle part, ce qui la
// juge, et ce qui l'arrête.
function corpsDeLaPR({ run, base, tete, echeance, outil }: { run: string; base: string; tete: string; echeance: string; outil: { commande: string; args: string[] } }): string {
  return [
    `**Renommage du code — \`${run}\`.** Joué par le runtime dans la pause de la cuisine que le chef a acceptée : aucun autre merge ne se fait avant sa fin.`,
    "",
    `- Parti de \`${base}\` à \`${tete}\`, sa tête rapatriée à l'instant.`,
    `- L'outil : \`${[outil.commande, ...outil.args].join(" ")}\` — il renomme l'arbre en place et le prouve ; ce commit porte tout ce qu'il a écrit.`,
    "- La pass la juge comme toute livraison — la fusion avec la base, les gates, le reviewer, la CI — et, verte, la merge sous grant dans la même pause.",
    `- Abandonnée à ${echeance} si elle n'est pas mergée : la pause est alors levée, rien n'est mergé, et la pass ne la mergera plus.`,
  ].join("\n");
}

// Rend le runtime, augmenté du renommage dans la pause. À brancher après la
// pass : c'est à elle que la PR est remise.
export function brancherRenommage<R extends Runtime & Pick<Pass, "prendreHorsRail">>(runtime: R, options: OptionsRenommage): R {
  const renommage = renommeur(runtime, options);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const passer = () => {
    try {
      renommage.passer();
    } catch (erreur) {
      avertir(`brigade : le renommage du code a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    }
  };
  const desabonner = runtime.surReveil(passer);
  passer();
  return {
    ...runtime,
    arreter(signal) {
      renommage.arreter();
      desabonner();
      runtime.arreter(signal);
    },
  };
}
