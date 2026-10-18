// La base rouge telle que le chef la lit, dans `run status`, `run pass` et
// `run base` : ce qui la tient rouge, et le geste qui fait rejouer ses gates.
import type { ControleRetenu, EtatDeLaBase } from "./projections/pass.ts";
import { geste } from "./geste.ts";

// Le geste par lequel le chef fait rejouer les gates d'une base rouge.
export const REJOUER_LA_BASE = geste("base replay");

const court = (sha: string) => sha.slice(0, 7);

// L'essai qui ne s'est pas fait, et ce que git en a dit. Rien, si le contrôle
// n'a pas été joué faute de gates.
export const direPanne = (motif: string | null | undefined) => (motif ? `, l'essai ne s'est pas fait (${motif})` : "");

// Le contrôle que la pass ne peut pas faire partir : la base ne se rapatrie
// pas. Hors de tout rejeu demandé — des merges à vérifier, une base rouge à
// rejouer dès qu'elle bouge.
export const direControleRetenu = (retenu: ControleRetenu, depuis: (instant: string) => string) =>
  `contrôle retenu depuis ${depuis(retenu.at)} : la base ne se rapatrie pas (${retenu.reason}) — la pass y revient seule, à chaque tick`;

// Les mêmes, en anglais : ce que dit la ligne `base` de `status`.
export const direPanneEn = (motif: string | null | undefined) => (motif ? `, the attempt did not run (${motif})` : "");

export const direControleRetenuEn = (retenu: ControleRetenu, depuis: (instant: string) => string) =>
  `check held for ${depuis(retenu.at)}: the base cannot be fetched (${retenu.reason}) — the pass comes back to it on its own, at every tick`;

// Où en est le rejeu que le chef a demandé. Une base qui ne se rapatrie pas
// le retient avant la machine : c'est elle qui se dit.
export function direRejeu(rejeu: NonNullable<EtatDeLaBase["recheck"]>, depuis: (instant: string) => string, retenu: ControleRetenu | null): string {
  if (retenu !== null) return `la base ne se rapatrie pas depuis ${depuis(retenu.at)} (${retenu.reason}), la pass y revient seule`;
  return rejeu.heldAt === null ? "la pass le joue à son prochain passage" : `la machine saturée le retient depuis ${depuis(rejeu.heldAt)}, la pass y revient seule`;
}

// Ce qui suit l'annonce d'une base rouge : le contrôle qui n'a pas pu la
// vérifier depuis, puis le rejeu demandé — par le chef, ou par la pass, qui
// rejoue seule tout rouge une fois — ou, sans demande, ce qui retient son
// contrôle, et le geste.
export function suiteDeBaseRouge({ unplayed, reason, recheck }: EtatDeLaBase, depuis: (instant: string) => string, retenu: ControleRetenu | null): string[] {
  return [
    ...(unplayed === null ? [] : [`gates non jouées sur ${court(unplayed.sha)} depuis ${depuis(unplayed.at)}${direPanne(reason)} : un contrôle non joué ne lève pas un rouge constaté`]),
    ...(recheck === null
      ? [...(retenu === null ? [] : [direControleRetenu(retenu, depuis)]), `rejouer ses gates sans attendre un commit : ${REJOUER_LA_BASE}`]
      : [`${recheck.by === "chef" ? "rejeu demandé par le chef" : "rejeu automatique, avant d'ouvrir un ticket de réparation si le rouge tient,"} depuis ${depuis(recheck.at)} : ${direRejeu(recheck, depuis, retenu)}`]),
  ];
}

export function direRejeuEn(rejeu: NonNullable<EtatDeLaBase["recheck"]>, depuis: (instant: string) => string, retenu: ControleRetenu | null): string {
  if (retenu !== null) return `the base cannot be fetched for ${depuis(retenu.at)} (${retenu.reason}), the pass comes back to it on its own`;
  return rejeu.heldAt === null ? "the pass plays it on its next round" : `the saturated machine has held it for ${depuis(rejeu.heldAt)}, the pass comes back to it on its own`;
}

export function suiteDeBaseRougeEn({ unplayed, reason, recheck }: EtatDeLaBase, depuis: (instant: string) => string, retenu: ControleRetenu | null): string[] {
  return [
    ...(unplayed === null ? [] : [`gates not played on ${court(unplayed.sha)} for ${depuis(unplayed.at)}${direPanneEn(reason)}: a check that was not played does not lift a red that was found`]),
    ...(recheck === null
      ? [...(retenu === null ? [] : [direControleRetenuEn(retenu, depuis)]), `replay its gates without waiting for a commit: ${REJOUER_LA_BASE}`]
      : [`${recheck.by === "chef" ? "replay asked by the chef" : "automatic replay, before opening a repair ticket if the red holds,"} for ${depuis(recheck.at)}: ${direRejeuEn(recheck, depuis, retenu)}`]),
  ];
}

// La base rouge, horodatée : pour les commandes qui montrent des instants.
export function direBaseRouge(controle: EtatDeLaBase, retenu: ControleRetenu | null): string[] {
  const merges = controle.tickets.length === 0 ? "" : ` — après le merge de ${controle.tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    `BASE ROUGE depuis ${controle.redSince ?? controle.at} (${court(controle.sha)})${merges} : rien n'est jugé ni mergé, les livraisons attendent`,
    ...["la station ne prend plus de ticket tant qu'elle l'est", ...suiteDeBaseRouge(controle, (instant) => instant, retenu)].map((ligne) => `  ${ligne}`),
  ];
}

// La même, en anglais : la base rouge que `pass` montre, horodatée.
export function direBaseRougeEn(controle: EtatDeLaBase, retenu: ControleRetenu | null): string[] {
  const merges = controle.tickets.length === 0 ? "" : ` — after the merge of ${controle.tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    `BASE RED since ${controle.redSince ?? controle.at} (${court(controle.sha)})${merges}: nothing is judged or merged, deliveries wait`,
    ...["the station takes no more tickets while it is", ...suiteDeBaseRougeEn(controle, (instant) => instant, retenu)].map((ligne) => `  ${ligne}`),
  ];
}
