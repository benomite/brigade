// Quand la station peut se relancer sur une version publiée (#2585). Chaque
// merge qui touche le runtime publie un paquet, et chaque installation relance
// la station : dix-sept relances en dix heures, le 6 nov. 2026. Les versions
// s'installent donc par lots : au plus une relance par intervalle (une heure
// par défaut) après la dernière. Ce qui est publié pendant l'intervalle attend
// sa fin, et c'est la plus récente qui s'installe alors — une seule relance
// pour toutes. Une version marquée urgente — une réparation de la station
// elle-même — n'attend pas : elle s'installe tout de suite.
//
// Une décision pure : ni horloge, ni disque. Le passage de la mise à jour
// (`../mettre-a-jour.ts`) lui donne ce qu'il sait et fait ce qu'elle dit.

export const INTERVALLE_MS = 60 * 60_000;

export type Attente = {
  // L'instant de la dernière relance sur une version, nul s'il n'y en a eu aucune.
  derniereRelance: Date | null;
  // Une version en attente est-elle marquée urgente ?
  urgente: boolean;
  maintenant: Date;
  // Le temps minimal entre deux relances ; `INTERVALLE_MS` par défaut.
  intervalleMs?: number;
};

export type Decision = { quoi: "relancer"; pourquoi: "premiere" | "fenetre-passee" | "urgente" } | { quoi: "attendre"; jusqua: Date };

export function deciderLaRelance({ derniereRelance, urgente, maintenant, intervalleMs = INTERVALLE_MS }: Attente): Decision {
  if (urgente) return { quoi: "relancer", pourquoi: "urgente" };
  if (derniereRelance === null || !Number.isFinite(derniereRelance.getTime())) return { quoi: "relancer", pourquoi: "premiere" };
  const fin = derniereRelance.getTime() + intervalleMs;
  if (maintenant.getTime() >= fin) return { quoi: "relancer", pourquoi: "fenetre-passee" };
  return { quoi: "attendre", jusqua: new Date(fin) };
}
