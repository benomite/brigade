// La base rouge telle que le chef la lit, dans `run status`, `run pass` et
// `run base` : ce qui la tient rouge, et le geste qui fait rejouer ses gates.
import type { EtatDeLaBase } from "./projections/pass.ts";

// Le geste par lequel le chef fait rejouer les gates d'une base rouge.
export const REJOUER_LA_BASE = "npm --prefix runtime run base -- rejouer";

const court = (sha: string) => sha.slice(0, 7);

// Où en est le rejeu que le chef a demandé.
export function direRejeu(rejeu: NonNullable<EtatDeLaBase["recheck"]>, depuis: (instant: string) => string): string {
  return rejeu.heldAt === null ? "la pass le joue à son prochain passage" : `la machine saturée le retient depuis ${depuis(rejeu.heldAt)}, la pass y revient seule`;
}

// Ce qui suit l'annonce d'une base rouge : le contrôle qui n'a pas pu la
// vérifier depuis, puis le rejeu demandé — ou, sans demande, le geste.
export function suiteDeBaseRouge({ unplayed, recheck }: EtatDeLaBase, depuis: (instant: string) => string): string[] {
  return [
    ...(unplayed === null ? [] : [`gates non jouées sur ${court(unplayed.sha)} depuis ${depuis(unplayed.at)} : un contrôle non joué ne lève pas un rouge constaté`]),
    recheck === null ? `rejouer ses gates sans attendre un commit : ${REJOUER_LA_BASE}` : `rejeu demandé par le chef depuis ${depuis(recheck.at)} : ${direRejeu(recheck, depuis)}`,
  ];
}

// La base rouge, horodatée : pour les commandes qui montrent des instants.
export function direBaseRouge(controle: EtatDeLaBase): string[] {
  const merges = controle.tickets.length === 0 ? "" : ` — après le merge de ${controle.tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    `BASE ROUGE depuis ${controle.redSince ?? controle.at} (${court(controle.sha)})${merges} : les merges sous grant sont suspendus, les livraisons vertes attendent`,
    ...["la station ne prend plus de ticket tant qu'elle l'est", ...suiteDeBaseRouge(controle, (instant) => instant)].map((ligne) => `  ${ligne}`),
  ];
}
