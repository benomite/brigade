// Le quota GitHub tel que la station le publie dans son état (#3481) : la
// limite qui la règle, la pause qu'elle subit, ce qu'elle a dépensé sur ce qui
// lui est permis, quand la fenêtre se renouvelle, et qui a dépensé quoi sur
// l'heure écoulée. Tout est lu sur le compteur de la station
// (`limite-github.ts`) : ce que GitHub a dit, ce que la box a compté.
//
// - `limite` : `ecriture` tant qu'une pause posée par une limite secondaire
//   de GitHub (les écritures) tient ; sinon `core`, le quota horaire.
// - `pauseJusqua` : la fin de la pause en cours (ISO) quand GitHub l'a dite ;
//   null sans pause, ou quand GitHub n'a pas dit de fin et que la box l'a choisie.
// - `utilise`, `maximum`, `renouvellement` : pour `core`, ce que GitHub a dit
//   du quota du compte de la machine (`x-ratelimit-*`) — nuls tant qu'il ne
//   l'a pas dit ; pour `ecriture`, les écritures que la box a comptées sur
//   l'heure, le budget horaire qu'elle s'en donne (`ECRITURES_PAR_HEURE`), et
//   l'instant où la plus ancienne sort de l'heure — nul sans écriture.
// - `parStationEtProjet` : les appels de l'heure, par projet et par sorte
//   d'appel, le plus gros d'abord. Le compteur est celui de la station : la
//   station de chaque ligne est elle.
import { ECRITURES_PAR_HEURE, FENETRE_MS, type Limite } from "../limite-github.ts";

export type QuotaGithub = {
  limite: "core" | "ecriture";
  pauseJusqua: string | null;
  utilise: number | null;
  maximum: number | null;
  renouvellement: string | null;
  parStationEtProjet: Array<{ station: string; projet: string; type: string; nombre: number }>;
};

const iso = (instant: number) => new Date(instant).toISOString();

// Le quota de la station nommée `station`, lu sur son compteur.
export function quotaGithub(limite: Limite, station: string): QuotaGithub {
  const etat = limite.etatDuQuota();
  const { pause, quota, ecritures } = etat;
  const parStationEtProjet = etat.appels.map(({ projet, lecture, nombre }) => ({ station, projet, type: lecture, nombre }));
  const pauseJusqua = pause !== null && pause.finDite === true ? iso(pause.jusqua) : null;
  if (pause?.limite === "ecriture") {
    return {
      limite: "ecriture",
      pauseJusqua,
      utilise: ecritures.nombre,
      maximum: ECRITURES_PAR_HEURE,
      renouvellement: ecritures.plusAncienne === null ? null : iso(ecritures.plusAncienne + FENETRE_MS),
      parStationEtProjet,
    };
  }
  return {
    limite: "core",
    pauseJusqua,
    utilise: quota === null ? null : quota.plafond - quota.restant,
    maximum: quota?.plafond ?? null,
    renouvellement: quota === null ? null : iso(quota.reset),
    parStationEtProjet,
  };
}
