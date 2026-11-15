// La veille de la station de cet ordinateur, suivie par le process principal de l'app (ticket 3642) : relue toutes les cinq
// secondes sur ce que la station écrit (runtime/src/veille-machine/contrat.ts, `lireVeille`), et dite à la vue quand elle
// change — la carte de la station dans l'onglet Stations (veille-machine.js). Une lecture qui échoue la laisse inconnue :
// la vue n'en dit rien, et l'échec se dit une fois au journal de l'app.
import type { Veille } from "../../../../runtime/src/veille-machine/contrat.ts";

const INTERVALLE_MS = 5000;

export function suivreLaVeille({ lire, dire, avertir, intervalleMs = INTERVALLE_MS }: { lire: () => Promise<Veille>; dire: (veille: Veille | undefined) => void; avertir: (ligne: string) => void; intervalleMs?: number }) {
  let derniere: Veille | undefined;
  let dite: string | undefined;
  let echec = "";
  const relire = async (): Promise<Veille | undefined> => {
    try {
      derniere = await lire();
      echec = "";
    } catch (erreur) {
      const raison = erreur instanceof Error ? erreur.message : String(erreur);
      if (raison !== echec) avertir(`brigade: this computer's station keep-awake state could not be read — ${raison}`);
      echec = raison;
      derniere = undefined;
    }
    const pose = JSON.stringify(derniere ?? null);
    if (pose !== dite) {
      dite = pose;
      dire(derniere);
    }
    return derniere;
  };
  const minuterie = setInterval(() => void relire(), intervalleMs);
  minuterie.unref?.();
  void relire();
  return { relire, arreter: () => clearInterval(minuterie) };
}
