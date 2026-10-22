// Le changement des réglages du projet, demandé au runtime qui le sert (#1308) :
// le point d'entrée de `proposer.ts`. Le runtime principal du projet a ce
// qu'il faut pour le proposer — le dépôt de sa station, son GitHub, et sa
// pass, qui retient la PR pour le chef. Celui qui le demande n'a que l'état du
// projet : il y écrit sa demande, et y lit la réponse.
//
//   - `proposerAuRuntime` : l'appel — la demande passée au crible, écrite au
//     journal, puis la réponse attendue : l'adresse de la PR, ou le refus dit.
//     Une valeur que l'écriture refuse ne s'écrit même pas au journal ;
//   - `brancherReglages` : le runtime, branché sur ces demandes — chacune
//     proposée à son tour, sa réponse écrite une fois (`main.ts`).
//
// Les phrases rendues sont en anglais : c'est l'app qui les montre.
import { randomUUID } from "node:crypto";
import type { Journal } from "../journal.ts";
import { ouvrirJournal } from "../journal.ts";
import type { Pass } from "../pass.ts";
import type { Runtime } from "../runtime.ts";
import type { FaitReglage } from "./evenements.ts";
import { proposerUnReglage, refusDuChangement, type OptionsDeProposition, type Proposition } from "./proposer.ts";

const TOUS = Number.MAX_SAFE_INTEGER;
// Une branche que l'écriture accepte, le temps du crible : la demande ne sait
// pas encore quelle base le runtime porte, et le changement se juge sans elle.
const BASE_DU_CRIBLE = "main";
const DELAI_MS = 120_000;
const SONDE_MS = 200;

export type Reponse = Proposition | { ok: false; motif: "sans-reponse"; cle: null; message: string };

// La réponse du runtime à la demande `request`, si elle est écrite.
export function reponseA(journal: Journal, request: string): Proposition | null {
  const proposee = journal.duType("setting.proposed", TOUS).find((e) => e.payload.request === request);
  if (proposee !== undefined) return { ok: true, pr: proposee.payload.pr, numero: proposee.payload.number, branche: proposee.payload.branch, reglages: proposee.payload.settings };
  const refusee = journal.duType("setting.refused", TOUS).find((e) => e.payload.request === request);
  return refusee === undefined ? null : { ok: false, motif: refusee.payload.reason, cle: refusee.payload.key, message: refusee.payload.message };
}

// Écrit la demande au journal, si l'écriture ne la refuse pas d'emblée.
export function demanderUnReglage(journal: Journal, projet: string, changement: unknown, auteur = "chef"): { request: string } | Extract<Proposition, { ok: false }> {
  const refus = refusDuChangement(changement, BASE_DU_CRIBLE);
  if (refus !== null) return refus;
  const request = randomUUID().slice(0, 8);
  journal.ajouter({ project: projet, ticket: null, author: auteur, type: "setting.requested", payload: { request, change: changement as Record<string, unknown> } });
  return { request };
}

export type OptionsDeLAppel = {
  // L'état du projet servi (`BRIGADE_STATE_DIR` de son runtime principal).
  repertoireEtat: string;
  projet: string;
  // Combien de temps attendre la réponse. Par défaut, deux minutes.
  delaiMs?: number;
  auteur?: string;
};

// L'appel : propose le changement au runtime du projet, et rend l'adresse de
// la PR qu'il a ouverte, ou pourquoi il n'y en a pas. Sans réponse dans le
// délai, la demande reste au journal : le runtime la proposera quand il la
// lira, et c'est dit.
export async function proposerAuRuntime(changement: unknown, options: OptionsDeLAppel): Promise<Reponse> {
  const journal = ouvrirJournal(options.repertoireEtat);
  try {
    const demande = demanderUnReglage(journal, options.projet, changement, options.auteur);
    if (!("request" in demande)) return demande;
    const limite = Date.now() + (options.delaiMs ?? DELAI_MS);
    for (;;) {
      const reponse = reponseA(journal, demande.request);
      if (reponse !== null) return reponse;
      if (Date.now() >= limite) {
        return { ok: false, motif: "sans-reponse", cle: null, message: "The project's runtime did not answer in time. The request stays in its log: it opens the pull request when it reads it." };
      }
      await new Promise((fini) => setTimeout(fini, SONDE_MS));
    }
  } finally {
    journal.fermer();
  }
}

// Le runtime, branché sur les demandes : chacune, dans l'ordre où elle a été
// écrite, est proposée (`proposerUnReglage`) et sa PR remise à la pass. Une
// demande à la fois, et une réponse par demande, même si deux réveils se
// suivent.
export function brancherReglages<R extends Runtime & Pass>(runtime: R, options: Omit<OptionsDeProposition, "remettre">): R {
  const { journal, projet } = runtime;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  let arrete = false;
  const repondre = (request: string, reponse: Proposition) => {
    const fait: FaitReglage = reponse.ok
      ? { type: "setting.proposed", payload: { request, pr: reponse.pr, number: reponse.numero, branch: reponse.branche, settings: reponse.reglages } }
      : { type: "setting.refused", payload: { request, reason: reponse.motif, key: reponse.cle, message: reponse.message } };
    journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait, dedupKey: `setting.answer:${request}` });
  };
  const enAttente = () => journal.duType("setting.requested", TOUS).filter((e) => reponseA(journal, e.payload.request) === null);

  let enCours: Promise<void> | null = null;
  const passer = () => {
    if (arrete) return;
    enCours ??= (async () => {
      for (const demande of enAttente()) {
        if (arrete) return;
        const { request, change } = demande.payload;
        let reponse: Proposition;
        try {
          reponse = await proposerUnReglage(change, { ...options, remettre: (livraison) => runtime.prendreHorsRail(livraison) });
        } catch (erreur) {
          reponse = { ok: false, motif: "echec", cle: null, message: `The change could not be proposed: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
        }
        repondre(request, reponse);
      }
    })()
      .catch((erreur) => avertir(`brigade : demande de réglage non traitée — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`))
      .finally(() => {
        enCours = null;
      });
  };
  const desabonner = runtime.surReveil(passer);
  passer();
  return {
    ...runtime,
    arreter(signal) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}
