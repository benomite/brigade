// La mise en service côté runtime. Le chef la demande (`run mise-en-service`,
// qui n'écrit qu'au journal) ; le runtime en marche tient la demande et lance
// le geste de box — `sudo -n /usr/local/bin/brigade-mise-en-service <projet>`,
// et rien d'autre : ni shell, ni autre commande sous `sudo`. C'est le seul
// process privilégié que le runtime lance.
//
// Le geste est un vrai redémarrage : les cooks en vol meurent avec le runtime.
// Il ne part donc que le rail calme — plus aucun cook en vol —, ou sur la
// demande explicite du chef de ne pas attendre. Tant qu'une demande vit, aucun
// cook ne part (`miseEnServiceRetient`, lu par les garde-fous) : la cuisine se
// vide au lieu d'enchaîner, et rien ne se lance sous un redémarrage décidé.
//
// Il part une fois par demande : son lancement s'écrit au journal dans la
// transaction qui constate que la demande attend. Rien n'est gardé en mémoire
// que le process lui-même.
//
// Deux choses ne se règlent pas ici, mais sur la box (`runtime/deploy`) :
// `sudo` ne laisse passer le geste que si sa règle nomme le compte du service,
// et le geste doit survivre à l'arrêt de l'unité qui l'a lancé — il est son
// enfant, dans son cgroup, que `systemctl stop` vide. Tant que la première
// manque, `sudo` refuse, et c'est ce que la file dit.
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argumentsDuGeste } from "./dire-mise-en-service.ts";
import type { FaitMiseEnService } from "./evenements/mise-en-service.ts";
import { cooksEnVol } from "./projections/garde-fous.ts";
import { demandeDeMiseEnService } from "./projections/mise-en-service.ts";
import { versionComparee } from "./projections/version.ts";
import { NOM_DE_PROJET, type Runtime } from "./runtime.ts";

const AUTEUR = "runtime";
// Où le geste écrit, dans le répertoire d'état : un fichier, pas un tube — un
// tube mourrait avec ce runtime, et le geste avec lui à sa première ligne.
export const JOURNAL_DU_GESTE = "mise-en-service.log";
// Ce que le journal garde de ce que le geste a écrit : ses dernières lignes.
const LIGNES_GARDEES = 5;
const FIN_MAX = 600;

export type OptionsMiseEnService = {
  repertoireEtat: string;
  // Par défaut, l'environnement du runtime. Seul son `PATH` sert : c'est là
  // que `sudo` se trouve, et rien d'autre ne passe au geste.
  env?: NodeJS.ProcessEnv;
};

// La fin de ce que le geste a écrit, sans ce qu'une adresse porterait pour
// s'authentifier.
function finDuJournal(chemin: string): string {
  try {
    const lignes = readFileSync(chemin, "utf8").split("\n").map((ligne) => ligne.trimEnd()).filter((ligne) => ligne.trim() !== "");
    return lignes.slice(-LIGNES_GARDEES).join("\n").replace(/\/\/[^/@\s]+@/g, "//").slice(-FIN_MAX);
  } catch {
    return "";
  }
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

  const regarder = () => {
    if (arrete) return;
    try {
      const lance = base.transaction(() => {
        const demande = demandeDeMiseEnService(base);
        if (demande?.etat !== "waiting") return false;
        // Demandée quand une version attendait : si la comparaison la dit à
        // jour depuis, il n'y a plus rien à mettre en service, et rien ne
        // redémarre.
        if (versionComparee(base)?.comparaison.outcome === "current") {
          noter({ type: "deploy.cancelled", payload: { reason: "current" } });
          return false;
        }
        const enVol = cooksEnVol(base);
        // Sans demande de coupure, aucun cook n'est interrompu : le geste
        // attend, aussi longtemps qu'il en reste un.
        if (enVol.length > 0 && !demande.coupe) return false;
        noter({ type: "deploy.launched", payload: { command: ["sudo", ...args], flying: enVol.map(({ run, ticket, tokens }) => ({ run, ticket, tokens })), log: JOURNAL_DU_GESTE } });
        return true;
      });
      if (lance) partir();
    } catch (erreur) {
      // Une demande qui ne se lit pas n'arrête pas la cuisine : le réveil suivant la reprend.
      console.error(`brigade : mise en service non regardée — ${message(erreur)}`);
    }
  };

  // La demande du chef s'écrit d'un autre process : ce runtime la voit à son
  // réveil, une seconde au plus. Le rail calme, lui, se constate au tick.
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
