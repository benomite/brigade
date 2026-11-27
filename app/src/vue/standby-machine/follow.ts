// La veille de la station de cet ordinateur, suivie par le process principal de l'app (ticket 3642) : relue toutes les cinq
// secondes sur ce que la station écrit (runtime/src/veille-machine/contrat.ts, `lireVeille`), et dite à la vue quand elle
// change — la carte de la station dans l'onglet Stations (standby-machine.js). Une lecture qui échoue la laisse inconnue :
// la vue n'en dit rien, et l'échec se dit une fois au journal de l'app.
import type { Veille } from "../../../../runtime/src/veille-machine/contrat.ts";

const INTERVAL_MS = 5000;

export function followTheStandby({ lire: read, dire: tell, avertir, intervalleMs: intervalMs = INTERVAL_MS }: { lire: () => Promise<Veille>; dire: (standby: Veille | undefined) => void; avertir: (line: string) => void; intervalleMs?: number }) {
  let last: Veille | undefined;
  let saidOne: string | undefined;
  let failure = "";
  const reread = async (): Promise<Veille | undefined> => {
    try {
      last = await read();
      failure = "";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== failure) avertir(`brigade: this computer's station keep-awake state could not be read — ${reason}`);
      failure = reason;
      last = undefined;
    }
    const pose = JSON.stringify(last ?? null);
    if (pose !== saidOne) {
      saidOne = pose;
      tell(last);
    }
    return last;
  };
  const timer = setInterval(() => void reread(), intervalMs);
  timer.unref?.();
  void reread();
  return { relire: reread, arreter: () => clearInterval(timer) };
}
