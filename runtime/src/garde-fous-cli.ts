// Les garde-fous vus et commandés par le chef, depuis son propre process :
//   npm --prefix runtime run garde-fous                 l'état : plafonds, cooks, disjoncteur, derniers arrêts
//   npm --prefix runtime run garde-fous -- stop         arrête tous les cooks ; plus aucun n'est lancé
//   npm --prefix runtime run garde-fous -- reprendre    rouvre la cuisine et referme le disjoncteur
// Une commande s'écrit dans le journal ; le runtime qui tourne la voit dans la
// seconde.
import { existsSync } from "node:fs";
import type { Plafonds } from "./evenements/garde-fous.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { arretsRecents, cooksEnCours, etatDesGardeFous, type Arret } from "./projections/garde-fous.ts";
import { sessionEnCours } from "./projections/sessions.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run garde-fous -- [stop | reprendre]";
const AUTEUR = "chef";
const ARRETS_MONTRES = 10;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const arrondi = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);
const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien > 1 ? "s" : ""}`;
const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

function decrirePlafonds(plafonds: Plafonds): string {
  return [
    `${nombre(plafonds.turns)} tours`,
    duree(plafonds.durationMs),
    `${nombre(plafonds.tokens)} tokens`,
    `inactivité ${duree(plafonds.idleMs)}`,
  ].join(" · ");
}

function decrireArret(arret: Arret): string {
  const { limit, observed } = arret;
  const mesure = (unite: (valeur: number) => string) =>
    `${observed === null ? "?" : unite(observed)} pour ${limit === null ? "?" : unite(limit)}`;
  switch (arret.reason) {
    case "turns":
      return `plafond de tours dépassé : ${mesure(nombre)}`;
    case "tokens":
      return `plafond de tokens dépassé : ${mesure(nombre)}`;
    case "duration":
      return `plafond de durée dépassé : ${mesure(duree)}`;
    case "idle":
      return `inactif : rien produit depuis ${observed === null ? "?" : duree(observed)} (seuil ${limit === null ? "?" : duree(limit)})`;
    case "stop":
      return "« stop » du chef";
  }
}

function montrer(journal: Journal): void {
  const { base } = journal;
  const etat = etatDesGardeFous(base);
  ligne("plafonds par ticket", etat.limits ? decrirePlafonds(etat.limits) : "inconnus — le runtime n'a pas encore démarré avec ses garde-fous");
  ligne("cuisine", etat.stoppedAt === null ? "ouverte" : `ARRÊTÉE par le chef le ${etat.stoppedAt} — « reprendre » pour relancer`);
  ligne(
    "disjoncteur",
    etat.breakerOpenedAt === null
      ? `fermé — ${pluriel(etat.failures, "échec")} d'affilée, ouverture à ${etat.breakerThreshold ?? "?"}`
      : `OUVERT depuis le ${etat.breakerOpenedAt} après ${pluriel(etat.failures, "échec")} d'affilée — plus aucun cook n'est lancé ; « reprendre » pour le refermer`,
  );
  const cooks = cooksEnCours(base);
  ligne("cooks en cours", cooks.length === 0 ? "aucun" : String(cooks.length));
  for (const cook of cooks) console.log(`  #${cook.ticket}  ${cook.run}  lancé le ${cook.launchedAt}`);
  const arrets = arretsRecents(base, ARRETS_MONTRES);
  ligne("derniers arrêts par garde-fou", arrets.length === 0 ? "  aucun" : "");
  for (const arret of arrets) console.log(`  ${arret.at}  #${arret.ticket}  ${arret.run}  ${decrireArret(arret)}`);
}

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction.
function commander(journal: Journal, commande: "stop" | "reprendre"): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    const etat = etatDesGardeFous(base);
    const noter = (type: "kitchen.stopped" | "kitchen.resumed") =>
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type, payload: {} });
    const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";

    if (commande === "stop") {
      if (etat.stoppedAt !== null) return `cuisine déjà arrêtée depuis le ${etat.stoppedAt}`;
      noter("kitchen.stopped");
      return `cuisine arrêtée : les cooks en cours sont arrêtés dans la seconde, plus aucun n'est lancé avant « reprendre »${absent}`;
    }
    if (etat.stoppedAt === null && etat.breakerOpenedAt === null) return "rien à reprendre : la cuisine est ouverte et le disjoncteur fermé";
    noter("kitchen.resumed");
    const effets = [etat.stoppedAt === null ? null : "cuisine rouverte", etat.breakerOpenedAt === null ? null : "disjoncteur refermé"];
    return `${effets.filter(Boolean).join(", ")} : les cooks peuvent être lancés à nouveau${absent}`;
  });
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [commande] = args;
if (args.length > 1 || (commande !== undefined && commande !== "stop" && commande !== "reprendre")) echouer(2, USAGE);
// Une commande ouvre le journal en écriture : sans ce contrôle, elle en
// créerait un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

const journal = ouvrirJournal(repertoireEtat, { lectureSeule: commande === undefined });
try {
  if (commande === undefined) montrer(journal);
  else console.log(`brigade : ${commander(journal, commande)}`);
} finally {
  journal.fermer();
}
