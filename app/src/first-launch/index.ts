// L'écran du premier lancement avant l'avis de macOS (#4081, épique #4078) : sur un Mac neuf, inscrire la station de fond
// à l'ouverture de session (station-background/inscription.ts) fait venir l'avis du système « Background Items Added », que le
// nouvel arrivant n'attend pas. Au premier lancement, l'app lui montre d'abord un écran qui le lui dit
// (vue/first-launch/), et l'inscription attend qu'il appuie sur son bouton. Le bouton pressé, une marque est écrite
// à côté du fichier des projets : aux lancements suivants, l'écran ne revient pas, et l'inscription part sans attendre.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type OptionsDuFirstLaunch<T> = {
  // Le fichier qui dit que l'écran a été vu : présent, il ne revient pas.
  marque: string;
  // Montre l'écran ; la promesse se résout quand le bouton est pressé.
  afficher: () => Promise<void>;
  // L'action qui fait venir l'avis de macOS : l'inscription de la station à l'ouverture de session.
  declencher: () => Promise<T>;
  // Une marque qui ne s'écrit pas : l'action part quand même, et l'écran reviendra au lancement suivant.
  dire?: (line: string) => void;
  // L'avis de macOS viendra-t-il (`avisDeMacOS`) ? Faux, l'action part seule, et rien n'est noté. Vrai par défaut.
  avis?: boolean;
};

// Montre l'écran au premier lancement, attend le bouton, note qu'il a été vu, puis lance l'action ; ensuite, l'action seule.
// Un écran qui échoue (la fenêtre fermée avant le bouton) lève, et l'action ne part pas.
export async function passerLeFirstLaunch<T>({ marque, afficher, declencher, dire: tell, avis: opinion = true }: OptionsDuFirstLaunch<T>): Promise<T> {
  if (opinion && !existsSync(marque)) {
    await afficher();
    try {
      mkdirSync(dirname(marque), { recursive: true });
      writeFileSync(marque, `${new Date().toISOString()}\n`);
    } catch (error) {
      tell?.(`brigade: the first-launch screen could not be noted as seen, it shows again at the next launch — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return declencher();
}

// L'avis ne vient que sur un Mac où la station n'est pas encore inscrite : là seulement, l'écran passe avant l'action.
// Ailleurs — Windows, Linux, ou un Mac où l'installeur l'a déjà posée —, l'action part seule.
export const opinionDeMacOS = ({ mac, inscrite }: { mac: boolean; inscrite: boolean }): boolean => mac && !inscrite;

// L'écran tel que le process principal le tient : `afficher` le demande à la vue (`montrer`) et attend le bouton ;
// `attendu` dit à une vue qui s'ouvre s'il l'attend ; `continuer` est le bouton pressé.
export function holdLOpinionDeBackground(show: () => void): { afficher: () => Promise<void>; attendu: () => boolean; continuer: () => void } {
  let button: (() => void) | undefined;
  return {
    afficher: () =>
      new Promise<void>((resoudre) => {
        button = resoudre;
        show();
      }),
    attendu: () => button !== undefined,
    continuer: () => {
      const presse = button;
      button = undefined;
      presse?.();
    },
  };
}
