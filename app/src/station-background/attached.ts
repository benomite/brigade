// L'app et la station de fond (#3630) : à son ouverture, l'app inscrit la station à l'ouverture de session
// (registration.ts), puis la rejoint si elle tourne, ou la lance (background.ts). Ensuite elle la regarde : tourne-t-elle,
// redémarre-t-elle sur une release, attend-elle d'être appairée — le code qu'elle affiche est tapé par le geste de la
// home, comme quand l'app la tenait. En quittant, l'app ne fait que cesser de regarder : la station continue, et ses
// cooks avec elle.
import type { StateStationLocale } from "../workstation/station.ts";
import { holdingOfTheStation } from "../workstation/station.ts";
import type { Pairing } from "../stations/stations.ts";
import type { Registration } from "./registration.ts";
import { readStateOfBackground, joinOrLaunch, answerAtPairings, type Attachment } from "./background.ts";

type OptionsStationOfBackground = {
  racine: string;
  // Inscrit la station à l'ouverture de session ; `launchd` : elle y est lancée, l'app n'a rien à lancer.
  inscrire: () => Promise<Registration>;
  // Lance l'hôte, quand rien ne tourne et que l'ouverture de session ne l'a pas lancé.
  lancer: () => void | Promise<void>;
  appairer: (code: string) => Promise<Pairing>;
  dire: (line: string) => void;
  // La station tourne, ou ne tourne plus.
  surChangement?: () => void;
  pasMs?: number;
  attenteMs?: number;
};

export type StationOfBackground = {
  // `demarree` : lancée par cette app ; `tenue-ailleurs` : elle tournait déjà, l'app l'a rejointe.
  etat(): StateStationLocale;
  tourne(): boolean;
  // Le pid du process qui la tient, tant qu'il vit.
  pid(): number | undefined;
  // La release vers laquelle elle redémarre, nulle sinon.
  redemarrage(): string | null;
  // Que l'app a fini de la trouver : rejointe, lancée, ou refusée.
  pret: Promise<Attachment>;
  // Cesse de la regarder. La station continue.
  fermer(): void;
};

export function holdTheStationOfBackground(options: OptionsStationOfBackground): StationOfBackground {
  const { racine: root, dire: tell } = options;
  let attachment: Attachment | undefined;
  let pid: number | undefined;
  let closes = false;
  let said = false;
  let pairing: Promise<void> = Promise.resolve();

  const look = () => {
    pid = holdingOfTheStation(root);
    const runs = pid !== undefined;
    if (runs !== said) {
      if (said) tell(`brigade: this computer's station stopped — it starts again at the next login, or when the app opens`);
      said = runs;
      options.surChangement?.();
    }
    // Un seul appairage à la fois : le geste de la home peut prendre plusieurs secondes.
    if (runs) pairing = pairing.then(() => answerAtPairings(root, options.appairer)).catch((error: unknown) => tell(`brigade: this computer's station could not be paired — ${error instanceof Error ? error.message : String(error)}`));
  };

  const ready = (async (): Promise<Attachment> => {
    const registration = await options.inscrire().catch((error: unknown): Registration => ({ refus: error instanceof Error ? error.message : String(error) }));
    if ("refus" in registration) tell(`brigade: this computer's station is not started at login — ${registration.refus}`);
    const parTheSession = "par" in registration && registration.par === "launchd";
    const rendered = await joinOrLaunch({ racine: root, lancer: parTheSession ? () => {} : options.lancer, ...(options.attenteMs === undefined ? {} : { attenteMs: options.attenteMs }) });
    if ("rejointe" in rendered) tell(`brigade: this computer's station already runs in the background (pid ${rendered.rejointe}) — the app attaches to it`);
    else if ("lancee" in rendered) tell(`brigade: this computer's station started in the background (pid ${rendered.lancee}) — it keeps running when the app quits`);
    else tell(`brigade: this computer's station is not running — ${rendered.refus}`);
    attachment = rendered;
    return rendered;
  })();

  const timer = setInterval(() => {
    if (!closes && attachment !== undefined) look();
  }, options.pasMs ?? 2_000);
  timer.unref();
  void ready.then(() => {
    if (!closes) look();
  });

  return {
    etat() {
      if (attachment === undefined) return "demarree";
      if (pid === undefined) return "refus" in attachment ? "refusee" : "arretee";
      return "rejointe" in attachment ? "tenue-ailleurs" : "demarree";
    },
    tourne: () => pid !== undefined,
    pid: () => pid,
    redemarrage() {
      const readOne = readStateOfBackground(root);
      return readOne !== null && readOne.pid === pid ? readOne.redemarrage : null;
    },
    pret: ready,
    fermer() {
      closes = true;
      clearInterval(timer);
    },
  };
}
