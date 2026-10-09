// La base rouge telle que le chef la lit, dans `run status`, `run pass` et
// `run base` : ce qui la tient rouge, et le geste qui fait rejouer ses gates.
import type { ControleRetenu, EtatDeLaBase } from "./projections/pass.ts";

// Le geste par lequel le chef fait rejouer les gates d'une base rouge.
export const REJOUER_LA_BASE = "npm --prefix runtime run base -- rejouer";

const court = (sha: string) => sha.slice(0, 7);

// L'essai qui ne s'est pas fait, et ce que git en a dit. Rien, si le contrôle
// n'a pas été joué faute de gates.
export const direPanne = (motif: string | null | undefined) => (motif ? `, l'essai ne s'est pas fait (${motif})` : "");

// Le contrôle que la pass ne peut pas faire partir : la base ne se rapatrie
// pas. Hors de tout rejeu demandé — des merges à vérifier, une base rouge à
// rejouer dès qu'elle bouge.
export const direControleRetenu = (retenu: ControleRetenu, depuis: (instant: string) => string) =>
  `contrôle retenu depuis ${depuis(retenu.at)} : la base ne se rapatrie pas (${retenu.reason}) — la pass y revient seule, à chaque tick`;

// Où en est le rejeu que le chef a demandé. Une base qui ne se rapatrie pas
// le retient avant la machine : c'est elle qui se dit.
export function direRejeu(rejeu: NonNullable<EtatDeLaBase["recheck"]>, depuis: (instant: string) => string, retenu: ControleRetenu | null): string {
  if (retenu !== null) return `la base ne se rapatrie pas depuis ${depuis(retenu.at)} (${retenu.reason}), la pass y revient seule`;
  return rejeu.heldAt === null ? "la pass le joue à son prochain passage" : `la machine saturée le retient depuis ${depuis(rejeu.heldAt)}, la pass y revient seule`;
}

// Ce qui suit l'annonce d'une base rouge : le contrôle qui n'a pas pu la
// vérifier depuis, puis le rejeu demandé — ou, sans demande, ce qui retient
// son contrôle, et le geste.
export function suiteDeBaseRouge({ unplayed, reason, recheck }: EtatDeLaBase, depuis: (instant: string) => string, retenu: ControleRetenu | null): string[] {
  return [
    ...(unplayed === null ? [] : [`gates non jouées sur ${court(unplayed.sha)} depuis ${depuis(unplayed.at)}${direPanne(reason)} : un contrôle non joué ne lève pas un rouge constaté`]),
    ...(recheck === null
      ? [...(retenu === null ? [] : [direControleRetenu(retenu, depuis)]), `rejouer ses gates sans attendre un commit : ${REJOUER_LA_BASE}`]
      : [`rejeu demandé par le chef depuis ${depuis(recheck.at)} : ${direRejeu(recheck, depuis, retenu)}`]),
  ];
}

// La base rouge, horodatée : pour les commandes qui montrent des instants.
export function direBaseRouge(controle: EtatDeLaBase, retenu: ControleRetenu | null): string[] {
  const merges = controle.tickets.length === 0 ? "" : ` — après le merge de ${controle.tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    `BASE ROUGE depuis ${controle.redSince ?? controle.at} (${court(controle.sha)})${merges} : les merges sous grant sont suspendus, les livraisons vertes attendent`,
    ...["la station ne prend plus de ticket tant qu'elle l'est", ...suiteDeBaseRouge(controle, (instant) => instant, retenu)].map((ligne) => `  ${ligne}`),
  ];
}
