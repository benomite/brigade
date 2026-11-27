// Les préférences du chef dans l'app : le fichier de l'app (`~/.config/brigade/app.json`) reste ce que
// les écrans lisent et ce que les gestes écrivent, et son gist (reglages-perso.ts) les fait suivre le
// chef d'un appareil à l'autre. Les deux s'accordent à chaque lecture : au lancement de l'app, à chaque
// retour à sa fenêtre, à intervalles réguliers, et dès que le fichier change.
//
// Un accord lit le gist, y reporte ce que le chef a changé sur cet appareil depuis le précédent
// (fusion.ts, `rejouer`) et l'y écrit, puis pose dans le fichier ce que le gist porte (`poser`) : une
// couleur choisie ailleurs, un ordre rangé ailleurs, une préférence d'affichage changée ailleurs arrivent
// à l'écran par la relecture du fichier, comme un geste fait ici. Le dossier d'un projet et son hôte ne
// partent jamais : ce sont des clés de l'appareil (partage.ts), et le fichier les garde.
//
// Quand le gist ne se lit pas — GitHub injoignable, un `gh` d'un autre compte qui n'a pas de gist des
// préférences, ou pas de `gh` du tout —, le fichier n'est pas touché : l'app montre ce qu'il porte, et le
// prochain accord rattrape. Un fichier que l'app ne comprend pas n'est pas accordé : un éditeur qui
// l'écrit à moitié ne dit pas que le chef a tout effacé.
import { memes, rejouer } from "./fusion.ts";
import type { Preferences } from "./partage.ts";
import type { ReglagesPerso } from "./reglages-perso.ts";

// Le fichier de l'app, tel que suivi.ts le tient.
export type FichierDesPreferences = {
  preferences(): { preferences: Preferences } | { refus: string };
  // Rend la raison, si elles n'ont pas été posées.
  poserPreferences(preferences: Preferences): string | undefined;
};

export const INTERVALLE_MS = 60_000;

export function tenirPreferences(options: {
  perso: ReglagesPerso;
  fichier: FichierDesPreferences;
  // Ce qui empêche l'accord, dit une fois tant que c'est la même raison.
  surPanne?(raison: string): void;
  intervalleMs?: number;
}) {
  const { perso, fichier } = options;
  // Les préférences du fichier au dernier accord : ce que le chef a changé ici se lit par rapport à elles.
  // Aucune avant le premier : le gist l'emporte alors, et le fichier ne lui donne que ce qui lui manque.
  let accordees: Preferences | undefined;
  let enCours: Promise<void> | undefined;
  // Un accord demandé pendant un autre : il le suit.
  let encore = false;
  // Le fichier est en train de recevoir ce que le gist porte : ce changement-là n'est pas un geste du chef.
  let pose = false;
  let panne: string | undefined;
  let minuterie: ReturnType<typeof setInterval> | undefined;

  const dire = (raison: string): void => {
    if (raison !== panne) options.surPanne?.(raison);
    panne = raison;
  };

  async function accorder(): Promise<void> {
    if ("refus" in fichier.preferences()) return;
    const lues = await perso.lire();
    if (lues.source === "locales") return dire(lues.panne ?? "the gist of your preferences could not be read");
    const avant = fichier.preferences();
    if ("refus" in avant) return;
    const voulues = rejouer(lues.preferences, accordees, avant.preferences);
    if (!memes(voulues, lues.preferences)) {
      const refus = await perso.ecrire(voulues);
      if (refus !== undefined) return dire(refus);
    }
    // Un geste fait pendant l'écriture : le poser par-dessus le perdrait, l'accord suivant le reporte.
    const maintenant = fichier.preferences();
    if ("refus" in maintenant || !memes(maintenant.preferences, avant.preferences)) {
      encore = true;
      return;
    }
    pose = true;
    let refus: string | undefined;
    try {
      refus = fichier.poserPreferences(voulues);
    } finally {
      pose = false;
    }
    if (refus !== undefined) return dire(refus);
    const posees = fichier.preferences();
    if ("refus" in posees) return;
    accordees = posees.preferences;
    panne = undefined;
  }

  // Lit le gist et l'accorde au fichier : rendu quand c'est fait, ou que ça n'a pas pu l'être.
  function tirer(): Promise<void> {
    if (enCours !== undefined) {
      encore = true;
      return enCours;
    }
    enCours = (async () => {
      do {
        encore = false;
        try {
          await accorder();
        } catch (erreur) {
          dire((erreur as Error).message);
        }
      } while (encore);
      enCours = undefined;
    })();
    return enCours;
  }

  return {
    tirer,
    // Le fichier a changé : un accord, si ses préférences ne sont plus celles du dernier — un projet
    // rangé, une couleur choisie, une préférence écrite à la main. Rien pour une clé de l'appareil.
    signaler(): void {
      if (pose) return;
      const lu = fichier.preferences();
      if ("refus" in lu || (accordees !== undefined && memes(lu.preferences, accordees))) return;
      void tirer();
    },
    // Le premier accord, puis un toutes les `intervalleMs`.
    demarrer(): void {
      void tirer();
      minuterie ??= setInterval(() => void tirer(), options.intervalleMs ?? INTERVALLE_MS);
    },
    // Rendu quand aucun accord n'est en route.
    calme: (): Promise<void> => enCours ?? Promise.resolve(),
    fermer(): void {
      clearInterval(minuterie);
      minuterie = undefined;
    },
  };
}
