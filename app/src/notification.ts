// La notification de l'urgence : quand toute la cuisine d'un projet attend le chef, le runtime
// l'annonce (runtime/src/alerte-urgence.ts) — une fois, puis un rappel espacé —, et l'app le dit au
// système, une notification par annonce, que la fenêtre soit devant, derrière ou réduite. Son clic
// ramène l'app au premier plan sur le projet, sa ligne d'urgence en tête de la bande et son geste prêt
// (alertes.ts, « L'urgence »).
//
// Une annonce se reconnaît à l'instant où le runtime l'a écrite au journal (`derniereLe`) : relire
// `faits` sans que le runtime ait rien redit ne la redit pas ; son rappel, si. Ce qui a été
// notifié n'est tenu que le temps de l'app : fermée puis rouverte, l'annonce en cours est notifiée une
// fois de plus — sauf si le chef l'a déjà cliquée. Le clic, lui, est retenu d'une ouverture à
// l'autre, dans un fichier à côté de celui des projets. Une urgence levée efface ce qui en était
// retenu. Un runtime qui ne donne pas l'alerte — d'avant elle, ou qui ne l'a pas encore émise — ne
// fait rien notifier : la bande dit l'urgence quand même. Ce module ne montre rien lui-même.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Faits } from "./faits.ts";

// Une notification à montrer : `titre` et `corps`, ses deux lignes — le corps est le libellé que le
// runtime a écrit, tel quel ; `emission`, l'annonce qu'elle porte.
export type AMontrer = { projet: string; titre: string; corps: string; emission: string };

// Les annonces cliquées, projet par projet : l'instant de celle que le chef a cliquée en dernier.
export type Acquittees = Record<string, string>;
export type Memoire = { lire(): Acquittees; ecrire(acquittees: Acquittees): void };

type Reglages = {
  // Montre la notification ; `auClic` est à appeler quand le chef la clique.
  montrer(notification: AMontrer, auClic: () => void): void;
  // Ramène l'app au premier plan sur l'urgence du projet.
  ouvrir(projet: string): void;
  memoire: Memoire;
};

export function tenirNotifications({ montrer, ouvrir, memoire }: Reglages) {
  // Ce qui a été notifié depuis l'ouverture de l'app : la dernière annonce, par projet.
  const notifiees = new Map<string, string>();
  const acquittees = memoire.lire();
  const retenir = () => memoire.ecrire({ ...acquittees });
  return {
    // Les derniers faits lus d'un projet. Rend ce qui a été montré, s'il y en a.
    recevoir(projet: string, faits: Faits): AMontrer | undefined {
      const urgence = faits.urgence;
      if (urgence === null) {
        notifiees.delete(projet);
        if (projet in acquittees) {
          delete acquittees[projet];
          retenir();
        }
        return undefined;
      }
      const alerte = urgence?.alerte;
      if (alerte == null) return undefined;
      const emission = alerte.derniereLe;
      if (notifiees.get(projet) === emission || acquittees[projet] === emission) return undefined;
      notifiees.set(projet, emission);
      const notification = { projet, titre: alerte.rappels === 0 ? `${projet} — urgent` : `${projet} — urgent, reminder`, corps: alerte.libelle, emission };
      montrer(notification, () => {
        acquittees[projet] = emission;
        retenir();
        ouvrir(projet);
      });
      return notification;
    },
  };
}

// La mémoire des clics, dans un fichier : `{ "acquittees": { "<projet>": "<instant>" } }`. Un fichier
// absent ou illisible ne retient rien — au pire, une annonce déjà cliquée est notifiée une fois de
// plus. Une écriture ratée se dit, et ne retient rien.
export function memoireDansFichier(chemin: string, dire: (ligne: string) => void = (ligne) => console.error(ligne)): Memoire {
  return {
    lire() {
      try {
        const lu: unknown = JSON.parse(readFileSync(chemin, "utf8"));
        const brut = typeof lu === "object" && lu !== null ? (lu as { acquittees?: unknown }).acquittees : undefined;
        if (typeof brut !== "object" || brut === null) return {};
        return Object.fromEntries(Object.entries(brut).filter((entree): entree is [string, string] => typeof entree[1] === "string"));
      } catch {
        return {};
      }
    },
    ecrire(acquittees) {
      try {
        mkdirSync(dirname(chemin), { recursive: true });
        // Écrit à côté, puis mis à sa place : un fichier lu n'est jamais à moitié écrit.
        writeFileSync(`${chemin}.neuf`, `${JSON.stringify({ acquittees }, null, 2)}\n`);
        renameSync(`${chemin}.neuf`, chemin);
      } catch (erreur) {
        dire(`brigade: the clicked urgent notifications could not be remembered — ${(erreur as Error).message}`);
      }
    },
  };
}
