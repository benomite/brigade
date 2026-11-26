// La veille de la station de cet ordinateur, suivie par le process principal de l'app (ticket 3642) : relue toutes les cinq
// secondes sur ce que la station écrit (runtime/src/veille-machine/contrat.ts, `lireVeille`), et dite à la vue quand elle
// change — la carte de la station dans l'onglet Stations (standby-machine.js). Une lecture qui échoue la laisse inconnue :
// la vue n'en dit rien, et l'échec se dit une fois au journal de l'app.
import type { Veille } from "../../../../runtime/src/veille-machine/contrat.ts";

const INTERVALLE_MS = 5000;

export function suivreLaStandby({ lire, dire: tell, avertir, intervalleMs = INTERVALLE_MS }: { lire: () => Promise<Veille>; dire: (standby: Veille | undefined) => void; avertir: (line: string) => void; intervalleMs?: number }) {
  let derniere: Veille | undefined;
  let dite: string | undefined;
  let failure = "";
  const relire = async (): Promise<Veille | undefined> => {
    try {
      derniere = await lire();
      failure = "";
    } catch (error) {
      const raison = error instanceof Error ? error.message : String(error);
      if (raison !== failure) avertir(`brigade: this computer's station keep-awake state could not be read — ${raison}`);
      failure = raison;
      derniere = undefined;
    }
    const pose = JSON.stringify(derniere ?? null);
    if (pose !== dite) {
      dite = pose;
      tell(derniere);
    }
    return derniere;
  };
  const minuterie = setInterval(() => void relire(), intervalleMs);
  minuterie.unref?.();
  void relire();
  return { relire, arreter: () => clearInterval(minuterie) };
}
