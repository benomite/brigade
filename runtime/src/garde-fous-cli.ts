// Les garde-fous vus et commandés par le chef, depuis son propre process :
//   npm --prefix runtime run guardrails              l'état : plafonds, cooks, disjoncteur, derniers arrêts
//   npm --prefix runtime run guardrails -- stop      arrête tous les cooks ; plus aucun n'est lancé
//   npm --prefix runtime run guardrails -- resume    rouvre la cuisine et referme le disjoncteur
// Les anciens mots (`garde-fous`, `reprendre`) répondent encore, en disant le
// nouveau (`commandes.ts`).
// Une commande s'écrit dans le journal ; le runtime qui tourne la voit dans la
// seconde.
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import type { Plafonds } from "./evenements/garde-fous.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { arretsRecents, cooksEnCours, etatDesGardeFous, type Arret } from "./projections/garde-fous.ts";
import { alerteDeSession } from "./projections/renouvellement.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { stationsDeconnectees } from "./projections/stations.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run guardrails -- [stop | resume]";
const AUTEUR = "chef";
const ARRETS_MONTRES = 10;

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  const args = enAnglais("guardrails", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const nombre = (valeur: number) => valeur.toLocaleString("en-US");
  const arrondi = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);
  const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien > 1 ? "s" : ""}`;
  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  function decrirePlafonds(plafonds: Plafonds): string {
    return [
      `${nombre(plafonds.turns)} turns`,
      duree(plafonds.durationMs),
      `${nombre(plafonds.tokens)} tokens`,
      `idle ${duree(plafonds.idleMs)}`,
    ].join(" · ");
  }

  function decrireArret(arret: Arret): string {
    const { limit, observed } = arret;
    const mesure = (unite: (valeur: number) => string) =>
      `${observed === null ? "?" : unite(observed)} for ${limit === null ? "?" : unite(limit)}`;
    switch (arret.reason) {
      case "turns":
        return `turns cap exceeded: ${mesure(nombre)}`;
      case "tokens":
        return `tokens cap exceeded: ${mesure(nombre)}`;
      case "duration":
        return `duration cap exceeded: ${mesure(duree)}`;
      case "idle":
        return `idle: nothing produced for ${observed === null ? "?" : duree(observed)} (threshold ${limit === null ? "?" : duree(limit)})`;
      case "lease":
        return `lease expired: no progress in the worktree for ${observed === null ? "?" : duree(observed)} (lease ${limit === null ? "?" : duree(limit)})`;
      case "removals":
        return `removals cap exceeded: ${mesure((lignes) => `${nombre(lignes)} lines`)}`;
      case "stop":
        return "the chef's “stop”";
    }
  }

  function montrer(journal: Journal): void {
    const { base } = journal;
    const etat = etatDesGardeFous(base);
    ligne("caps per ticket", etat.limits ? decrirePlafonds(etat.limits) : "unknown — the runtime has not started with its guardrails yet");
    ligne("kitchen", etat.stoppedAt === null ? "open" : `STOPPED by the chef on ${etat.stoppedAt} — “resume” to restart`);
    ligne(
      "breaker",
      etat.breakerOpenedAt === null
        ? `closed — ${pluriel(etat.failures, "failure")} in a row, opens at ${etat.breakerThreshold ?? "?"}`
        : `OPEN since ${etat.breakerOpenedAt} after ${pluriel(etat.failures, "failure")} in a row — no cook is launched any more; “resume” to close it`,
    );
    const cooks = cooksEnCours(base);
    ligne("cooks running", cooks.length === 0 ? "none" : String(cooks.length));
    // Sans ticket : un jugement du manager.
    for (const cook of cooks) dire(`  ${cook.ticket === null ? "manager" : `#${cook.ticket}`}  ${cook.run}  launched ${cook.launchedAt}`);
    const arrets = arretsRecents(base, ARRETS_MONTRES);
    ligne("latest guardrail stops", arrets.length === 0 ? "  none" : "");
    for (const arret of arrets) dire(`  ${arret.at}  ${arret.ticket === null ? "manager" : `#${arret.ticket}`}  ${arret.run}  ${decrireArret(arret)}`);
  }

  // Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
  // est. Vérifier et écrire tiennent dans une seule transaction.
  function commander(journal: Journal, commande: "stop" | "resume"): string {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const etat = etatDesGardeFous(base);
      const noter = (type: "kitchen.stopped" | "kitchen.resumed" | "session.reconnected") =>
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type, payload: {} });
      const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will take effect at its next start)";

      if (commande === "stop") {
        if (etat.stoppedAt !== null) return `kitchen already stopped since ${etat.stoppedAt}`;
        noter("kitchen.stopped");
        return `kitchen stopped: the running cooks are stopped within the second, none is launched before “resume”${absent}`;
      }
      // « resume » vaut aussi pour une station dont la connexion Max avait
      // expiré : le chef dit qu'il l'a refaite.
      const deconnectees = stationsDeconnectees(base);
      // Et pour une session Max annoncée près de son échéance, ou en échec de
      // renouvellement : le chef dit s'être reconnecté avant qu'elle tombe.
      const annoncee = alerteDeSession(base, new Date()) !== null;
      if (annoncee) noter("session.reconnected");
      if (etat.stoppedAt === null && etat.breakerOpenedAt === null && deconnectees.length === 0) {
        return annoncee ? "Max session taken as renewed: its deadline counts from now" : "nothing to resume: the kitchen is open and the breaker closed";
      }
      noter("kitchen.resumed");
      const effets = [
        annoncee ? "Max session taken as renewed" : null,
        etat.stoppedAt === null ? null : "kitchen reopened",
        etat.breakerOpenedAt === null ? null : "breaker closed again",
        deconnectees.length === 0 ? null : `Max connection taken as restored (${deconnectees.join(", ")})`,
      ];
      return `${effets.filter(Boolean).join(", ")}: cooks can be launched again${absent}`;
    });
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [commande] = args;
  if (args.length > 1 || (commande !== undefined && commande !== "stop" && commande !== "resume")) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: commande === undefined });
  try {
    if (commande === undefined) montrer(journal);
    else dire(`brigade : ${commander(journal, commande)}`);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant les garde-fous.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not hold the guardrails' state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
