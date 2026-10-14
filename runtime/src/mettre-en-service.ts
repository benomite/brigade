// La mise en service côté runtime. Le runtime en marche lance le geste de box —
// `sudo -n /usr/local/bin/brigade-mise-en-service <projet>`, et rien d'autre :
// ni shell, ni autre commande sous `sudo`. C'est le seul process privilégié
// que le runtime lance.
//
// Il le lance seul, sans que personne le demande : quand la comparaison dit
// que la branche de son origine porte une version qu'il ne sert pas, il
// l'essaie. Le geste met le clone à jour et bascule : la version est gardée
// si elle démarre, la précédente revient sinon. Pendant l'essai, la cuisine
// continue de prendre ses tickets : rien n'est retenu. Un cook de station
// survit au runtime, et le suivant le reprend (`relais.ts`) — pourvu que
// l'arrêt de l'unité ne vide pas tout son groupe de contrôle (`KillMode`,
// `deploy/brigade@.service`). Une version ratée n'est pas réessayée : la
// suivante que la branche porte l'est.
//
// Projet par projet : chaque runtime n'essaie que pour son projet, sur ce que
// son journal dit, et rien de ce qu'un autre projet fait — ses cooks en vol,
// son essai, son échec — ne retient le sien. Une seule chose est commune à
// toute la box : le clone de brigade, que le geste de chaque projet met à jour
// avant de basculer. Deux gestes qui s'y croisent, l'un des deux rend la main
// sans avoir rien basculé (`CLONE_PAS_A_JOUR`) : sa version n'a pas raté, elle
// est réessayée — après une attente qui double à chaque fois, pour qu'un clone
// durablement en défaut ne fasse pas tourner le geste en boucle.
//
// L'essai seul ne part que d'une version posée par la bascule : ailleurs, rien
// ne dit ce qui est en service, et il n'y a pas de box à mettre à jour.
//
// Le chef peut encore la demander (`run mise-en-service`, qui n'écrit qu'au
// journal) — pour réessayer une version ratée, par exemple. Une demande part
// au réveil suivant, sans attendre : aucun cook n'est retenu, avant ni
// pendant. Un cook de station survit au redémarrage, et le suivant le reprend.
//
// Il part une fois par demande, une fois par version essayée seule : son
// lancement s'écrit au journal dans la transaction qui constate qu'il doit
// partir. Rien n'est gardé en mémoire que le process lui-même.
//
// Ce qu'il donne s'écrit de deux endroits. S'il rend la main sans avoir rien
// arrêté — une version qui change une unité posée, un `sudo` qui refuse —, le
// runtime qui l'a lancé est là pour le dire (`deploy.exited`). S'il a redémarré
// le runtime, celui qui l'a lancé est mort avec ce qu'il savait : c'est celui
// qui repart qui conclut (`deploy.concluded`), à son démarrage, de ce qui se
// constate — la version qu'il sert, celle d'avant, et le refus que la bascule a
// noté à côté des versions. Il ne lit dans la sortie du geste que ses dernières
// lignes, pour les montrer.
//
// Deux choses ne se règlent pas ici, mais sur la box (`runtime/deploy`) :
// `sudo` ne laisse passer le geste que si sa règle nomme le compte du service,
// et le geste doit survivre à l'arrêt de l'unité qui l'a lancé — il est son
// enfant, dans son cgroup, que `systemctl stop` vide. Tant que la première
// manque, `sudo` refuse, et c'est ce que la file dit.
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { argumentsDuGeste } from "./dire-mise-en-service.ts";
import type { FaitMiseEnService } from "./evenements/mise-en-service.ts";
import { cooksEnVol } from "./projections/garde-fous.ts";
import { dejaRatee, demandeDeMiseEnService, dernierGeste, empecheParLeClone, reessaiDuClone } from "./projections/mise-en-service.ts";
import { versionComparee } from "./projections/version.ts";
import { NOM_DE_PROJET, type Runtime } from "./runtime.ts";
import { COMPTE_RENDU, lireCompteRendu, versionPosee } from "./version.ts";

const AUTEUR = "runtime";
// Où le geste écrit, dans le répertoire d'état : un fichier, pas un tube — un
// tube mourrait avec ce runtime, et le geste avec lui à sa première ligne.
export const JOURNAL_DU_GESTE = "mise-en-service.log";
// Ce que le journal garde de ce que le geste a écrit : ses dernières lignes,
// chacune entière ou coupée à sa fin.
const LIGNES_GARDEES = 5;
const LIGNE_MAX = 400;
const MOTIF_MAX = 300;
// Ce qu'un runtime qui démarre laisse passer avant d'essayer seul une
// version : la bascule qui l'a lancé est peut-être encore à le confirmer, et
// un second geste ne doit pas la croiser. Plus que sa garde
// (`BRIGADE_BASCULE_GARDE`, 120 s) : passé ce délai, elle a rendu la main.
export const ATTENTE_AU_DEMARRAGE_MS = 3 * 60_000;

export type OptionsMiseEnService = {
  repertoireEtat: string;
  // Par défaut, l'environnement du runtime. Seul son `PATH` sert : c'est là
  // que `sudo` se trouve, et rien d'autre ne passe au geste.
  env?: NodeJS.ProcessEnv;
  // Par défaut, les sources de ce process : la version qu'il sert s'y lit.
  sources?: string;
  // Faux : le runtime n'essaie aucune version de lui-même, il attend la
  // demande du chef. Vrai par défaut.
  seul?: boolean;
  // Par défaut, `ATTENTE_AU_DEMARRAGE_MS`.
  attenteAuDemarrageMs?: number;
  // Par défaut, `REESSAI_DU_CLONE_MS` (`projections/mise-en-service.ts`).
  reessaiDuCloneMs?: number;
  // L'horloge du journal, à laquelle se lit l'heure d'un empêchement. Par
  // défaut, celle de la machine.
  maintenant?: () => Date;
};

// Ce qu'une adresse porterait pour s'authentifier n'est pas gardé, ni rien qui
// commande un terminal : ces lignes sont montrées telles quelles.
const propre = (dit: string) => dit.replace(/\/\/[^/@\s]+@/g, "//").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
const coupe = (dit: string, max: number) => (dit.length > max ? `${dit.slice(0, max - 1)}…` : dit);

// La fin de ce que le geste a écrit : ses dernières lignes.
function finDuJournal(chemin: string): string {
  try {
    const lignes = readFileSync(chemin, "utf8").split("\n").map((ligne) => propre(ligne).trimEnd()).filter((ligne) => ligne.trim() !== "");
    return lignes.slice(-LIGNES_GARDEES).map((ligne) => coupe(ligne, LIGNE_MAX)).join("\n");
  } catch {
    return "";
  }
}

// Le refus que la bascule a noté à côté des versions depuis que le geste est
// parti : la version qu'elle a refusée, et pourquoi. Nul : son compte rendu
// n'en porte pas, ou date d'avant — c'est celui d'une autre bascule.
function refusDepuis(versions: string, lanceLe: string): { refusee: string; motif: string | null } | null {
  try {
    if (statSync(join(versions, COMPTE_RENDU)).mtimeMs < Date.parse(lanceLe)) return null;
  } catch {
    return null;
  }
  const { refusee, motif } = lireCompteRendu(versions);
  return refusee ? { refusee, motif: motif ? coupe(propre(motif), MOTIF_MAX) : null } : null;
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Rend le runtime, qui tient désormais les demandes de mise en service. Son
// `arreter` ne touche pas au geste parti : c'est lui qui arrête ce runtime.
export function brancherMiseEnService<R extends Runtime>(runtime: R, options: OptionsMiseEnService): R {
  const { journal, projet } = runtime;
  const { base } = journal;
  // Le nom du projet est le seul argument du geste : il a déjà la forme que le
  // runtime exige à son démarrage, et rien d'autre ne part.
  if (!NOM_DE_PROJET.test(projet)) throw new Error(`nom de projet invalide : « ${projet} » — le geste de box ne serait pas lancé pour lui`);
  const args = argumentsDuGeste(projet);
  const noter = (fait: FaitMiseEnService) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  // La version que ces sources servent, posée par la bascule — nulle ailleurs.
  const posee = versionPosee(options.sources);
  const seul = (options.seul ?? true) && posee !== null;
  const demarreLe = Date.now();
  const attenteAuDemarrageMs = options.attenteAuDemarrageMs ?? ATTENTE_AU_DEMARRAGE_MS;
  const maintenant = options.maintenant ?? (() => new Date());
  let arrete = false;
  // Le geste de ce runtime tourne : ce qu'il rend — une erreur, puis sa fin —
  // ne s'écrit qu'une fois.
  let parti = false;

  const rendre = (fin: { code: number | null; signal: string | null; error?: string }) => {
    if (!parti) return;
    parti = false;
    // Arrêté, ce runtime n'écrit plus : c'est le redémarrage que le geste
    // provoque, et le démarrage suivant efface la demande.
    if (arrete) return;
    try {
      noter({ type: "deploy.exited", payload: { ...fin, tail: finDuJournal(join(options.repertoireEtat, JOURNAL_DU_GESTE)) } });
    } catch (erreur) {
      console.error(`brigade : retour du geste de mise en service non journalisé — ${message(erreur)}`);
    }
  };

  const partir = () => {
    parti = true;
    let sortie: number | null = null;
    try {
      sortie = openSync(join(options.repertoireEtat, JOURNAL_DU_GESTE), "w", 0o600);
      // Sans shell : chaque argument arrive tel quel. Détaché : il ne reçoit
      // pas les signaux de ce runtime, qu'il va faire arrêter.
      const geste = spawn("sudo", args, {
        cwd: "/",
        detached: true,
        env: { PATH: (options.env ?? process.env).PATH ?? "", LC_ALL: "C" },
        stdio: ["ignore", sortie, sortie],
      });
      geste.on("error", (erreur) => rendre({ code: null, signal: null, error: erreur.message }));
      geste.on("exit", (code, signal) => rendre({ code, signal }));
      geste.unref();
    } catch (erreur) {
      rendre({ code: null, signal: null, error: message(erreur) });
    } finally {
      if (sortie !== null) closeSync(sortie);
    }
  };

  // Ce runtime démarre : si le dernier geste parti n'a rien rendu à celui qui
  // l'avait lancé, c'est qu'il l'a redémarré — ou qu'il n'a pas fini. Ce qui
  // s'en constate ici s'écrit ; rien n'est déduit hors d'une version posée, où
  // rien ne dit ce qui est en service.
  const conclure = () => {
    if (posee === null) return;
    base.transaction(() => {
      const geste = dernierGeste(base);
      // Rien à conclure d'un geste qui a rendu la main, ni d'un retour déjà dit.
      if (geste === null || (geste.issue !== null && geste.issue.quoi !== "served")) return;
      const revenue = (refus: { refusee: string; motif: string | null } | null) =>
        noter({
          type: "deploy.concluded",
          payload: { outcome: "returned", served: posee.commit, refused: refus?.refusee ?? null, reason: refus?.motif ?? null, tail: finDuJournal(join(options.repertoireEtat, JOURNAL_DU_GESTE)) },
        });
      const refus = refusDepuis(posee.versions, geste.lanceLe);
      if (geste.issue !== null) {
        // Un runtime précédent s'est dit en service sur une autre version : si
        // la bascule l'a refusée depuis et que celle d'avant est revenue, il
        // n'a pas tenu.
        if (refus !== null && refus.refusee === geste.issue.servie && posee.commit === geste.avant) revenue(refus);
        return;
      }
      if (geste.avant === null) return;
      if (posee.commit !== geste.avant) noter({ type: "deploy.concluded", payload: { outcome: "served", served: posee.commit } });
      // Un refus noté pour la version que ce runtime sert n'est pas le sien.
      else revenue(refus !== null && refus.refusee !== posee.commit ? refus : null);
    });
  };

  const lancer = (auto: boolean) => {
    const comparaison = versionComparee(base)?.comparaison;
    noter({
      type: "deploy.launched",
      payload: {
        command: ["sudo", ...args],
        flying: cooksEnVol(base).map(({ run, ticket, tokens }) => ({ run, ticket, tokens })),
        log: JOURNAL_DU_GESTE,
        served: comparaison?.served ?? null,
        target: comparaison?.outcome === "waiting" ? comparaison.head : null,
        ...(auto ? { auto: true } : {}),
      },
    });
  };

  // Vrai tant qu'une version que le clone a empêchée attend son réessai.
  const cloneAttendu = (version: string): boolean => {
    const geste = dernierGeste(base);
    if (!empecheParLeClone(geste) || geste?.cible !== version) return false;
    const reessai = reessaiDuClone(geste, options.reessaiDuCloneMs);
    return reessai !== null && maintenant().getTime() < reessai;
  };

  // L'essai que le runtime lance seul : une version attend — la comparaison
  // vient de ce runtime, son démarrage efface celle d'avant —, aucun geste ne
  // tourne, et elle n'a pas déjà raté. Rien ne regarde les cooks en vol, ni
  // ce que font les autres projets de la box.
  const essayerSeul = (): boolean => {
    if (!seul || parti || Date.now() - demarreLe < attenteAuDemarrageMs) return false;
    const comparaison = versionComparee(base)?.comparaison;
    if (comparaison?.outcome !== "waiting" || comparaison.served !== posee?.commit) return false;
    if (demandeDeMiseEnService(base)?.etat === "launched" || dejaRatee(base, comparaison.head) || cloneAttendu(comparaison.head)) return false;
    lancer(true);
    return true;
  };

  const regarder = () => {
    if (arrete) return;
    try {
      const lance = base.transaction(() => {
        const demande = demandeDeMiseEnService(base);
        if (demande?.etat !== "waiting") return essayerSeul();
        // Demandée quand une version attendait : si la comparaison la dit à
        // jour depuis, il n'y a plus rien à mettre en service, et rien ne
        // redémarre.
        if (versionComparee(base)?.comparaison.outcome === "current") {
          noter({ type: "deploy.cancelled", payload: { reason: "current" } });
          return false;
        }
        // Une version qui n'a pas encore raté s'essaie seule : la demande
        // s'éteint avec l'essai.
        if (essayerSeul()) return true;
        lancer(false);
        return true;
      });
      if (lance) partir();
    } catch (erreur) {
      // Une demande qui ne se lit pas n'arrête pas la cuisine : le réveil suivant la reprend.
      console.error(`brigade : mise en service non regardée — ${message(erreur)}`);
    }
  };

  try {
    conclure();
  } catch (erreur) {
    // Une conclusion qui ne s'écrit pas n'empêche pas de démarrer.
    console.error(`brigade : mise en service précédente non conclue — ${message(erreur)}`);
  }

  // La demande du chef s'écrit d'un autre process : ce runtime la voit à son
  // réveil, une seconde au plus. La version qui attend se constate à la
  // comparaison qui la dit.
  const desabonner = runtime.surReveil(regarder);

  return {
    ...runtime,
    arreter(signal) {
      if (!arrete) {
        arrete = true;
        desabonner();
      }
      runtime.arreter(signal);
    },
  };
}
