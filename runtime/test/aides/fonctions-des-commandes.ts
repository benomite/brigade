// La fonction que joue le fichier d'une commande, quand il en a une (`principal`, appel.ts) : ce que son process
// fait de ses arguments et de son environnement (`enProcess`). Un test la joue dans son propre process, avec
// `appeler` : sans le Node qui démarre — une seconde par lancement sous la charge d'une suite.
import type { Commande } from "../../src/appel.ts";

export const FONCTIONS: Record<string, () => Promise<Commande>> = {
  status: async () => (await import("../../src/status.ts")).principal,
  facts: async () => (await import("../../src/faits.ts")).principal,
  rail: async () => (await import("../../src/montrer-rail.ts")).principal,
  log: async () => (await import("../../src/relire.ts")).principal,
  pass: async () => (await import("../../src/montrer-pass.ts")).principal,
  station: async () => (await import("../../src/montrer-station.ts")).principal,
  setting: async () => (await import("../../src/reglage-cli.ts")).principal,
  switch: async () => (await import("../../src/interrupteur-cli.ts")).principal,
  manager: async () => (await import("../../src/manager-cli.ts")).principal,
  grant: async () => (await import("../../src/grant-cli.ts")).principal,
  waiting: async () => (await import("../../src/attente-cli.ts")).principal,
  report: async () => (await import("../../src/rapport-cli.ts")).principal,
  guardrails: async () => (await import("../../src/garde-fous-cli.ts")).principal,
  base: async () => (await import("../../src/base-cli.ts")).principal,
  help: async () => (await import("../../src/aide.ts")).principal,
  closing: async () => (await import("../../src/closing/command.ts")).principal,
  phones: async () => {
    const [{ principal }, { LANCE }] = await Promise.all([import("../../src/telephone/appairage-cli.ts"), import("../../src/telephones.ts")]);
    return (appel) => principal(appel, { lance: LANCE });
  },
};
