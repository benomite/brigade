// Les faits de l'installation d'un projet : où en est chacune de ses étapes
// (`etapes.ts`). `step` : l'identifiant de l'étape. `previous` : l'état que le
// journal lui donnait avant — `todo` pour une étape jamais notée.
export type EtatDEtape = "todo" | "done" | "waiting";

export type FaitInstallation =
  // Une étape change d'état : faite, en attente du chef, ou de nouveau à faire.
  { type: "installation.step"; payload: { step: string; state: EtatDEtape; previous: EtatDEtape } };
