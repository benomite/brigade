// Le compte qui met un ticket de côté « par ses échecs » (`set-aside:failures`) : seuls y comptent
// les runs de cook qui ont échoué. Un cook dont le run s'est fini `ok` sans livrer — rien commité,
// rien ajouté — est relancé, il n'est pas un échec (#3652). Ces arrêts-là portent `run=ok` dans
// leur commentaire `brigade:echec`.

export const RUN_OK = "run=ok";

export type EssaiSansLivraison = { motif: string; runOk: boolean };

// Le commentaire d'un arrêt sans livraison dit-il que son run s'est fini `ok` ?
export const runFiniOk = (corps: string): boolean => /^<!-- brigade:echec[^\n]* run=ok\b/.test(corps);

// Les runs qui ont échoué, du plus ancien au plus récent : ce que le seuil compte, et ce que la
// raison de la mise de côté nomme.
export const runsEchoues = (essais: readonly EssaiSansLivraison[]): string[] => essais.filter((essai) => !essai.runOk).map((essai) => essai.motif);

// La phrase de la mise de côté, avec les runs échoués qui l'ont déclenchée.
export function direLaMiseDeCote(motifs: readonly string[]): string {
  return `after ${motifs.length} failed cook run${motifs.length === 1 ? "" : "s"}: ${motifs.map((motif, i) => `(${i + 1}) ${motif}`).join("; ")}`;
}
