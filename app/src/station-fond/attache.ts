// L'app et la station de fond (#3630) : à son ouverture, l'app inscrit la station à l'ouverture de session
// (inscription.ts), puis la rejoint si elle tourne, ou la lance (fond.ts). Ensuite elle la regarde : tourne-t-elle,
// redémarre-t-elle sur une release, attend-elle d'être appairée — le code qu'elle affiche est tapé par le geste de la
// home, comme quand l'app la tenait. En quittant, l'app ne fait que cesser de regarder : la station continue, et ses
// cooks avec elle.
import type { EtatStationLocale } from "../poste/station.ts";
import { tenantDeLaStation } from "../poste/station.ts";
import type { Appairage } from "../stations/stations.ts";
import type { Inscription } from "./inscription.ts";
import { lireEtatDuFond, rejoindreOuLancer, repondreAuxAppairages, type Rattachement } from "./fond.ts";

type OptionsStationDeFond = {
  racine: string;
  // Inscrit la station à l'ouverture de session ; `launchd` : elle y est lancée, l'app n'a rien à lancer.
  inscrire: () => Promise<Inscription>;
  // Lance l'hôte, quand rien ne tourne et que l'ouverture de session ne l'a pas lancé.
  lancer: () => void | Promise<void>;
  appairer: (code: string) => Promise<Appairage>;
  dire: (ligne: string) => void;
  // La station tourne, ou ne tourne plus.
  surChangement?: () => void;
  pasMs?: number;
  attenteMs?: number;
};

export type StationDeFond = {
  // `demarree` : lancée par cette app ; `tenue-ailleurs` : elle tournait déjà, l'app l'a rejointe.
  etat(): EtatStationLocale;
  tourne(): boolean;
  // Le pid du process qui la tient, tant qu'il vit.
  pid(): number | undefined;
  // La release vers laquelle elle redémarre, nulle sinon.
  redemarrage(): string | null;
  // Que l'app a fini de la trouver : rejointe, lancée, ou refusée.
  pret: Promise<Rattachement>;
  // Cesse de la regarder. La station continue.
  fermer(): void;
};

export function tenirLaStationDeFond(options: OptionsStationDeFond): StationDeFond {
  const { racine, dire } = options;
  let rattachement: Rattachement | undefined;
  let pid: number | undefined;
  let ferme = false;
  let dit = false;
  let appairage: Promise<void> = Promise.resolve();

  const regarder = () => {
    pid = tenantDeLaStation(racine);
    const tourne = pid !== undefined;
    if (tourne !== dit) {
      if (dit) dire(`brigade: this computer's station stopped — it starts again at the next login, or when the app opens`);
      dit = tourne;
      options.surChangement?.();
    }
    // Un seul appairage à la fois : le geste de la home peut prendre plusieurs secondes.
    if (tourne) appairage = appairage.then(() => repondreAuxAppairages(racine, options.appairer)).catch((erreur: unknown) => dire(`brigade: this computer's station could not be paired — ${erreur instanceof Error ? erreur.message : String(erreur)}`));
  };

  const pret = (async (): Promise<Rattachement> => {
    const inscription = await options.inscrire().catch((erreur: unknown): Inscription => ({ refus: erreur instanceof Error ? erreur.message : String(erreur) }));
    if ("refus" in inscription) dire(`brigade: this computer's station is not started at login — ${inscription.refus}`);
    const parLaSession = "par" in inscription && inscription.par === "launchd";
    const rendu = await rejoindreOuLancer({ racine, lancer: parLaSession ? () => {} : options.lancer, ...(options.attenteMs === undefined ? {} : { attenteMs: options.attenteMs }) });
    if ("rejointe" in rendu) dire(`brigade: this computer's station already runs in the background (pid ${rendu.rejointe}) — the app attaches to it`);
    else if ("lancee" in rendu) dire(`brigade: this computer's station started in the background (pid ${rendu.lancee}) — it keeps running when the app quits`);
    else dire(`brigade: this computer's station is not running — ${rendu.refus}`);
    rattachement = rendu;
    return rendu;
  })();

  const minuterie = setInterval(() => {
    if (!ferme && rattachement !== undefined) regarder();
  }, options.pasMs ?? 2_000);
  minuterie.unref();
  void pret.then(() => {
    if (!ferme) regarder();
  });

  return {
    etat() {
      if (rattachement === undefined) return "demarree";
      if (pid === undefined) return "refus" in rattachement ? "refusee" : "arretee";
      return "rejointe" in rattachement ? "tenue-ailleurs" : "demarree";
    },
    tourne: () => pid !== undefined,
    pid: () => pid,
    redemarrage() {
      const lu = lireEtatDuFond(racine);
      return lu !== null && lu.pid === pid ? lu.redemarrage : null;
    },
    pret,
    fermer() {
      ferme = true;
      clearInterval(minuterie);
    },
  };
}
