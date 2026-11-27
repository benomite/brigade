// Les préférences du chef dans l'app : le fichier de l'app (`~/.config/brigade/app.json`) reste ce que
// les écrans lisent et ce que les gestes écrivent, et son gist (settings-personal.ts) les fait suivre le
// chef d'un appareil à l'autre. Les deux s'accordent à chaque lecture : au lancement de l'app, à chaque
// retour à sa fenêtre, à intervalles réguliers, et dès que le fichier change.
//
// Un accord lit le gist, y reporte ce que le chef a changé sur cet appareil depuis le précédent
// (merge.ts, `rejouer`) et l'y écrit, puis pose dans le fichier ce que le gist porte (`poser`) : une
// couleur choisie ailleurs, un ordre rangé ailleurs, une préférence d'affichage changée ailleurs arrivent
// à l'écran par la relecture du fichier, comme un geste fait ici. Le dossier d'un projet et son hôte ne
// partent jamais : ce sont des clés de l'appareil (share.ts), et le fichier les garde.
//
// Quand le gist ne se lit pas — GitHub injoignable, un `gh` d'un autre compte qui n'a pas de gist des
// préférences, ou pas de `gh` du tout —, le fichier n'est pas touché : l'app montre ce qu'il porte, et le
// prochain accord rattrape. Un fichier que l'app ne comprend pas n'est pas accordé : un éditeur qui
// l'écrit à moitié ne dit pas que le chef a tout effacé.
import { same, replay } from "./merge.ts";
import type { Preferences } from "./share.ts";
import type { SettingsPersonal } from "./settings-personal.ts";

// Le fichier de l'app, tel que tracking.ts le tient.
export type FileOfPreferences = {
  preferences(): { preferences: Preferences } | { refus: string };
  // Rend la raison, si elles n'ont pas été posées.
  poserPreferences(preferences: Preferences): string | undefined;
};

export const INTERVAL_MS = 60_000;

export function holdPreferences(options: {
  perso: SettingsPersonal;
  fichier: FileOfPreferences;
  // Ce qui empêche l'accord, dit une fois tant que c'est la même raison.
  surPanne?(reason: string): void;
  intervalleMs?: number;
}) {
  const { perso: personal, fichier: file } = options;
  // Les préférences du fichier au dernier accord : ce que le chef a changé ici se lit par rapport à elles.
  // Aucune avant le premier : le gist l'emporte alors, et le fichier ne lui donne que ce qui lui manque.
  let granted: Preferences | undefined;
  let inProgress: Promise<void> | undefined;
  // Un accord demandé pendant un autre : il le suit.
  let still = false;
  // Le fichier est en train de recevoir ce que le gist porte : ce changement-là n'est pas un geste du chef.
  let pose = false;
  let outage: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tell = (reason: string): void => {
    if (reason !== outage) options.surPanne?.(reason);
    outage = reason;
  };

  async function grant(): Promise<void> {
    if ("refus" in file.preferences()) return;
    const readEntries = await personal.lire();
    if (readEntries.source === "locales") return tell(readEntries.panne ?? "the gist of your preferences could not be read");
    const before = file.preferences();
    if ("refus" in before) return;
    const wanted = replay(readEntries.preferences, granted, before.preferences);
    if (!same(wanted, readEntries.preferences)) {
      const refusal = await personal.ecrire(wanted);
      if (refusal !== undefined) return tell(refusal);
    }
    // Un geste fait pendant l'écriture : le poser par-dessus le perdrait, l'accord suivant le reporte.
    const now = file.preferences();
    if ("refus" in now || !same(now.preferences, before.preferences)) {
      still = true;
      return;
    }
    pose = true;
    let refusal: string | undefined;
    try {
      refusal = file.poserPreferences(wanted);
    } finally {
      pose = false;
    }
    if (refusal !== undefined) return tell(refusal);
    const setEntries = file.preferences();
    if ("refus" in setEntries) return;
    granted = setEntries.preferences;
    outage = undefined;
  }

  // Lit le gist et l'accorde au fichier : rendu quand c'est fait, ou que ça n'a pas pu l'être.
  function pull(): Promise<void> {
    if (inProgress !== undefined) {
      still = true;
      return inProgress;
    }
    inProgress = (async () => {
      do {
        still = false;
        try {
          await grant();
        } catch (error) {
          tell((error as Error).message);
        }
      } while (still);
      inProgress = undefined;
    })();
    return inProgress;
  }

  return {
    tirer: pull,
    // Le fichier a changé : un accord, si ses préférences ne sont plus celles du dernier — un projet
    // rangé, une couleur choisie, une préférence écrite à la main. Rien pour une clé de l'appareil.
    signaler(): void {
      if (pose) return;
      const readOne = file.preferences();
      if ("refus" in readOne || (granted !== undefined && same(readOne.preferences, granted))) return;
      void pull();
    },
    // Le premier accord, puis un toutes les `intervalleMs`.
    demarrer(): void {
      void pull();
      timer ??= setInterval(() => void pull(), options.intervalleMs ?? INTERVAL_MS);
    },
    // Rendu quand aucun accord n'est en route.
    calme: (): Promise<void> => inProgress ?? Promise.resolve(),
    fermer(): void {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
