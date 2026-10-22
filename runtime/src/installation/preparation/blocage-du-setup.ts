// Le setup du projet échoue sur la station : le projet est bloqué, et le
// chef le lit sur sa page (`installation/blocages/`). Une phrase dit ce qui
// est bloqué, une phrase pourquoi ; la sortie du setup ne tient que dans le
// détail. Pur : rien n'est écrit ici.
import type { NouveauBlocage } from "../blocages/blocages.ts";

export const ID_DU_BLOCAGE_DU_SETUP = "setup";

// `phraseEn` : la phrase de `phraseDuSetup` (en anglais, sans point final).
// `preparation` : le ticket qui répare le setup est (encore) à servir.
export function blocageDuSetup({ station, phraseEn, sortie, preparation }: { station: string; phraseEn: string; sortie: string; preparation: boolean }): NouveauBlocage {
  const suite = preparation ? "the preparation ticket is on it" : "no ticket of this project starts until it passes";
  return {
    id: ID_DU_BLOCAGE_DU_SETUP,
    message: `The worktree setup of this project fails on ${station}: ${suite}.`,
    cause: `${phraseEn.charAt(0).toUpperCase()}${phraseEn.slice(1)}.`,
    detail: sortie,
  };
}
