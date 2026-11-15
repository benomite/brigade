// La station garde le Mac éveillé tant qu'au moins un cook y cuit (#3642, épique #3641) : sur le MacBook Air du chef, la
// mise en veille sur batterie a figé un cook dix minutes. Sur un Mac, tant que le réglage est allumé (`contrat.ts`) et
// qu'un cook cuit, elle lance `caffeinate -i -w <son pid>` — l'assertion PreventUserIdleSystemSleep, que
// `pmset -g assertions` liste — et l'arrête quand le dernier cook finit, quand le réglage s'éteint, ou quand elle s'arrête.
// `-w` la lie à la vie de la station : tuée, même par SIGKILL, la station n'en laisse aucune derrière elle.
//
// Chaque seconde, elle recompte ses cooks et relit le réglage : un cook qui finit, ou le réglage éteint depuis le menu,
// relâche l'assertion dans la seconde. Hors d'un Mac, rien ne se lance et rien ne s'écrit.
import { spawn, type ChildProcess } from "../sans-invite.ts";
import { ecrireEtat, lireReglage } from "./contrat.ts";

const INTERVALLE_MS = 1000;

type OptionsDeLaVeille = {
  // Le répertoire de la station : son réglage et son état.
  racine: string;
  plateforme: NodeJS.Platform;
  // Combien de cooks cuisent sur la station, à l'instant.
  cooks: () => number;
  dire: (ligne: string) => void;
  // Le process que `caffeinate` suit : la station.
  pid?: number;
  // Ce qui se lance, avant `-i -w <pid>` : `caffeinate` ; un faux, pour les tests.
  commande?: readonly string[];
  intervalleMs?: number;
};

export type VeilleDeLaStation = {
  // Recompte et relit, prend ou relâche : ce que fait chaque seconde.
  regarder(): void;
  // L'assertion est-elle tenue, à l'instant.
  tenue(): boolean;
  // Plus de regard ; l'assertion tenue est relâchée.
  arreter(): void;
};

export function tenirLaVeille(options: OptionsDeLaVeille): VeilleDeLaStation {
  const { racine, dire } = options;
  const pid = options.pid ?? process.pid;
  const [programme = "caffeinate", ...avant] = options.commande ?? ["caffeinate"];
  const mac = options.plateforme === "darwin";
  let enfant: ChildProcess | undefined;
  let arrete = false;
  // Le dernier réglage lu : un fichier devenu illisible garde la dernière décision du chef, et se dit une fois.
  let garder = true;
  let ditDuReglage = "";
  let ditDuLancement = "";

  const ecrire = (etat: Parameters<typeof ecrireEtat>[1]) => {
    try {
      ecrireEtat(racine, etat);
    } catch (erreur) {
      dire(`brigade : station — l'état de la veille ne s'écrit pas — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  const relacher = (pourquoi: string) => {
    const tenu = enfant;
    if (tenu === undefined) return;
    enfant = undefined;
    tenu.kill();
    ecrire({ tenue: false });
    dire(`brigade : station — elle laisse cet ordinateur se mettre en veille : ${pourquoi}`);
  };

  const prendre = () => {
    const lance = spawn(programme, [...avant, "-i", "-w", String(pid)], { stdio: "ignore" });
    lance.once("error", (erreur) => {
      if (erreur.message !== ditDuLancement) dire(`brigade : station — caffeinate ne part pas, cet ordinateur peut se mettre en veille pendant un cook — ${erreur.message}`);
      ditDuLancement = erreur.message;
      if (enfant !== lance) return;
      enfant = undefined;
      ecrire({ tenue: false });
    });
    lance.once("exit", (code, signal) => {
      if (enfant !== lance) return;
      // Arrêté par autre chose que la station : repris au regard suivant, s'il le faut encore.
      enfant = undefined;
      ecrire({ tenue: false });
      dire(`brigade : station — caffeinate s'est arrêté (${signal ?? `code ${code}`}) : repris au regard suivant si un cook cuit encore`);
    });
    if (lance.pid === undefined) return;
    enfant = lance;
    ditDuLancement = "";
    ecrire({ tenue: true, caffeinate: lance.pid, station: pid });
    dire(`brigade : station — elle garde cet ordinateur éveillé tant qu'un cook cuit (caffeinate, pid ${lance.pid})`);
  };

  const regarder = () => {
    if (!mac || arrete) return;
    const reglage = lireReglage(racine);
    if ("illisible" in reglage) {
      if (reglage.illisible !== ditDuReglage) dire(`brigade : station — le réglage de la veille est illisible, elle garde le dernier lu (${garder ? "allumé" : "éteint"}) — ${reglage.illisible}`);
      ditDuReglage = reglage.illisible;
    } else {
      garder = reglage.garderEveille;
      ditDuReglage = "";
    }
    const cooks = options.cooks();
    if (!garder) return relacher("le réglage est éteint");
    if (cooks === 0) return relacher("plus aucun cook ne cuit");
    if (enfant === undefined) prendre();
  };

  const minuterie = mac ? setInterval(regarder, options.intervalleMs ?? INTERVALLE_MS) : undefined;
  minuterie?.unref();
  // Une sortie de la station, même sur une erreur : l'assertion part avec elle, sans attendre que `caffeinate` le voie.
  const aLaSortie = () => enfant?.kill();
  if (mac) process.once("exit", aLaSortie);
  if (mac) ecrire({ tenue: false });
  regarder();

  return {
    regarder,
    tenue: () => enfant !== undefined,
    arreter: () => {
      arrete = true;
      clearInterval(minuterie);
      process.removeListener("exit", aLaSortie);
      relacher("la station s'arrête");
    },
  };
}
