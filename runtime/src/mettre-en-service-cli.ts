// La mise en service demandée par le chef, depuis son propre process :
//   npm --prefix runtime run mise-en-service                 dit ce qui est en vol et ce que ça a coûté, puis demande : le rail calme, le geste de box part ; sinon il attend le rail calme, sans interrompre aucun cook
//   npm --prefix runtime run mise-en-service -- --couper     … sans attendre : les cooks en vol sont interrompus par le redémarrage
//   npm --prefix runtime run mise-en-service -- annuler      renonce à une demande qui attend
//   npm --prefix runtime run mise-en-service -- voir         ce qui est en vol, où en est la demande et ce que le dernier geste a donné, sans rien demander
// La commande ne lance rien et ne redémarre rien : elle écrit la demande au
// journal. C'est le runtime qui tourne qui lance le geste de box
// (`mettre-en-service.ts`), une fois, au moment où il le peut.
//
// Codes de sortie : 0, la demande est écrite — ou il n'y avait rien à faire, et
// c'est dit ; 1, elle est refusée, rien n'est écrit ; 2, la commande est mal
// écrite.
import { existsSync } from "node:fs";
import { geste as commandeDeBox } from "./geste.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { ANNULER, COUPER, decrireEnVol, DEMANDER, direDemande, direFin, direGeste, direIssue, resumerEnVol } from "./dire-mise-en-service.ts";
import { duree } from "./etat.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { droitDeLancerLeGeste, GESTE_DE_MISE_EN_SERVICE, miseANiveauDuGeste } from "./installation.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { cooksEnVol } from "./projections/garde-fous.ts";
import { demandeDeMiseEnService, dernierGeste } from "./projections/mise-en-service.ts";
import { lireRail } from "./projections/rail.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { versionComparee } from "./projections/version.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run mise-en-service -- [--couper | annuler | voir]";
const AUTEUR = "chef";
const GESTES = ["--couper", "annuler", "voir"];

const court = (commit: string) => commit.slice(0, 12);

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(11)}${valeur}`);

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [geste] = args;
  if (args.length > 1 || (geste !== undefined && !GESTES.includes(geste))) echouer(2, USAGE);
  // Une demande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

  const maintenant = new Date();
  const depuis = (instant: string) => duree(maintenant.getTime() - Date.parse(instant));

  // Ce que le chef lit avant toute demande : la version, ce qui est en vol et
  // ce que ça a déjà coûté. Rend la version qui attend, ou nulle.
  function montrer(journal: Journal) {
    const { base } = journal;
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? "?";
    const comparee = versionComparee(base);
    const comparaison = comparee?.comparaison ?? null;
    ligne(
      "version",
      comparaison === null
        ? "non comparée — le runtime en marche n'a encore rien comparé à son origine, ou ne tourne pas sur une version posée par la bascule"
        : comparaison.outcome === "current"
          ? `à jour — en service : ${court(comparaison.served)}, celle de ${comparaison.branch}`
          : comparaison.outcome === "waiting"
            ? `${comparaison.branch} (${court(comparaison.head)}) attend — en service : ${court(comparaison.served)}, ${comparaison.deliveries} livraison${comparaison.deliveries > 1 ? "s" : ""} non en service depuis le ${comparaison.since}`
            : `non comparée à ${comparaison.branch ?? "son origine"} — ${comparaison.reason}`,
    );
    const enVol = cooksEnVol(base);
    const titres = new Map(lireRail(base).map((ticket) => [ticket.ticket, ticket.title]));
    for (const dite of decrireEnVol(enVol, projet, titres, depuis)) dire(dite);
    return { projet, comparaison, enVol };
  }

  function demander(journal: Journal, couper: boolean): void {
    const { base } = journal;
    // Avant tout : montrer, attendre le rail calme, retenir un cook. Un compte
    // que sudo n'autorise pas à lancer le geste le verrait échouer à la fin,
    // après avoir bloqué le travail pour rien. `BRIGADE_MISE_EN_SERVICE_LIEN`
    // et `BRIGADE_SUDO_BIN` servent aux tests, qui n'ont pas de root.
    const droit = droitDeLancerLeGeste(env.BRIGADE_MISE_EN_SERVICE_LIEN || GESTE_DE_MISE_EN_SERVICE.lien, env.BRIGADE_SUDO_BIN || "sudo");
    if (!droit.accorde) {
      echouer(1, `sudo n'accorde pas, sans mot de passe, le geste de mise en service au compte du service (${droit.dit}) : il échouerait à la fin, après avoir retenu les cooks — rien n'est demandé, aucun cook n'est retenu, rien n'est redémarré, la version en service reste inchangée. La règle se met à niveau, une fois : ${miseANiveauDuGeste()} — docs/installer.md, « Le geste de mise en service »`);
    }
    const { projet, comparaison, enVol } = montrer(journal);
    const dit = base.transaction((): { code: number; lignes: string[] } => {
      const demande = demandeDeMiseEnService(base);
      if (demande?.etat === "launched") return { code: 0, lignes: [`déjà lancée — ${direDemande(demande, enVol, projet)}`] };
      if (demande && (demande.coupe || !couper)) return { code: 0, lignes: [`déjà demandée — ${direDemande(demande, enVol, projet)}`] };
      if (!sessionEnCours(base)) {
        return { code: 1, lignes: [`le runtime de « ${projet} » n'est pas en marche : personne ne lancerait le geste de box — rien n'est demandé. À la main : \`sudo brigade-mise-en-service ${projet}\``] };
      }
      if (comparaison === null) return { code: 1, lignes: [`rien ne dit qu'une version attend : le runtime en marche n'a rien comparé à son origine — rien n'est demandé, rien n'est redémarré (\`${commandeDeBox("status")}\` dira la version dès qu'elle est comparée)`] };
      if (comparaison.outcome === "current") {
        return { code: 0, lignes: [`rien à mettre en service : la version en service (${court(comparaison.served)}) est celle de ${comparaison.branch} — rien n'est demandé, rien n'est redémarré`] };
      }
      if (comparaison.outcome === "unreadable") {
        return { code: 1, lignes: [`rien ne dit qu'une version attend : la version en service (${court(comparaison.served)}) n'a pas pu être comparée à ${comparaison.branch ?? "son origine"} (${comparaison.reason}) — rien n'est demandé, rien n'est redémarré`] };
      }
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "deploy.requested", payload: { cut: couper } });
      const lancera = `le runtime lance le geste de box (${direGeste(projet)})`;
      if (enVol.length === 0) return { code: 0, lignes: [`mise en service demandée — le rail est calme : ${lancera} à son prochain réveil, dans la seconde, et il sera redémarré sur ${court(comparaison.head)}`] };
      if (couper) {
        return {
          code: 0,
          lignes: [
            `mise en service demandée, sans attendre le rail calme (\`--couper\`) : ${lancera} à son prochain réveil, dans la seconde`,
            `${resumerEnVol(enVol)} : interrompu${enVol.length > 1 ? "s" : ""} par le redémarrage, leurs tickets repris par des cooks neufs`,
          ],
        };
      }
      return {
        code: 0,
        lignes: [
          `mise en service demandée — elle attend le rail calme : aucun cook n'est interrompu, aucun autre ne part, et ${lancera} seul, une fois, dès que plus aucun n'est en vol`,
          `pour ne plus attendre : \`${COUPER}\` — les cooks en vol sont interrompus ; pour y renoncer : \`${ANNULER}\``,
        ],
      };
    });
    const [premiere = "", ...suite] = dit.lignes;
    const ecrire = dit.code === 0 ? dire : redire;
    ecrire(`brigade : ${premiere}`);
    for (const suivante of suite) ecrire(`          ${suivante}`);
    if (dit.code !== 0) throw new Sortie(dit.code);
  }

  function annuler(journal: Journal): void {
    const { base } = journal;
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? "?";
    const dit = base.transaction((): { code: number; ligne: string } => {
      const demande = demandeDeMiseEnService(base);
      if (demande === null) return { code: 0, ligne: "aucune mise en service n'est demandée : rien à annuler" };
      if (demande.etat === "launched") return { code: 1, ligne: `le geste de box est parti le ${demande.lanceeLe ?? demande.depuis} : il ne se rappelle pas` };
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "deploy.cancelled", payload: { reason: "chef" } });
      return { code: 0, ligne: `demande de mise en service du ${demande.depuis} retirée : rien n'a été lancé, aucun cook n'a été interrompu, et la cuisine reprend ses tickets` };
    });
    if (dit.code !== 0) echouer(dit.code, dit.ligne);
    dire(`brigade : ${dit.ligne}`);
  }

  function voir(journal: Journal): void {
    const { projet, enVol } = montrer(journal);
    const demande = demandeDeMiseEnService(journal.base);
    if (demande !== null) return ligne("demande", direDemande(demande, enVol, projet));
    ligne("demande", `aucune — \`${DEMANDER}\` la pose`);
    // Ce que le dernier geste de box a donné : il se lit encore après le
    // redémarrage qu'il a provoqué.
    const geste = dernierGeste(journal.base);
    if (geste === null || geste.issue === null) return;
    if (geste.issue.quoi === "served") return ligne("dernière", `mise en service lancée le ${geste.lanceLe} : réussie — ${court(geste.issue.servie)} est en service, le runtime est reparti sur elle le ${geste.issue.le}`);
    const rendu = { ...geste, issue: geste.issue };
    ligne("dernière", direIssue(rendu, projet));
    for (const dite of direFin(rendu)) dire(`${" ".repeat(11)}${dite}`);
  }

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: geste === "voir" });
  try {
    if (geste === "voir") voir(journal);
    else if (geste === "annuler") annuler(journal);
    else demander(journal, geste === "--couper");
  } catch (erreur) {
    if (journalPasRejoue(erreur)) {
      // Rien ne donne leur forme du jour aux tables d'un journal écrit par un
      // runtime d'avant la mise en service demandée.
      redire("brigade : ce journal n'a pas encore l'état de la mise en service : redémarrer le runtime, qui le recalcule");
      throw new Sortie(1);
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
