// Les faits d'un changement des réglages du projet proposé au runtime
// (`au-runtime.ts`) : la demande, et sa réponse — la PR ouverte, ou pourquoi
// il n'y en a pas. `request` les relie.
import type { Motif, ReglagesProjet } from "./reglages.ts";

export type FaitReglage =
  // Le changement demandé, passé au crible de l'écriture avant de s'écrire :
  // ce que le journal en garde n'est ni un secret, ni un chemin, ni une
  // limite de la machine.
  | { type: "setting.requested"; payload: { request: string; change: Record<string, unknown> } }
  // L'un ou l'autre, une fois par demande : la PR remise à la pass, avec les
  // réglages qu'elle écrit, ou le refus dit.
  | { type: "setting.proposed"; payload: { request: string; pr: string; number: number; branch: string; settings: ReglagesProjet } }
  | { type: "setting.refused"; payload: { request: string; reason: Motif | "inchange" | "echec"; key: string | null; message: string } };
