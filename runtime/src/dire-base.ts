// La base rouge telle que le chef la lit, dans `run status`, `run pass` et
// `run base` : ce qui la tient rouge, et le geste qui fait rejouer ses gates.
import type { ControleRetenu, EtatDeLaBase } from "./projections/pass.ts";
import { geste } from "./geste.ts";

// Le geste par lequel le chef fait rejouer les gates d'une base rouge.
export const REPLAY_THE_BASE = geste("base replay");

const court = (sha: string) => sha.slice(0, 7);

// L'essai qui ne s'est pas fait, et ce que git en a dit. Rien, si le contrôle
// n'a pas été joué faute de gates.
export const direPanneEn = (motif: string | null | undefined) => (motif ? `, the attempt did not run (${motif})` : "");

// `depuis` dit une durée (« 5 min ») dans `status`, un instant dans `pass` : `prep` donne la préposition qui va avec.
export const direControleRetenuEn = (retenu: ControleRetenu, depuis: (instant: string) => string, prep: "for" | "since" = "for") =>
  `check held ${prep} ${depuis(retenu.at)}: the base cannot be fetched (${retenu.reason}) — the pass comes back to it on its own, at every tick`;

// Où en est le rejeu que le chef a demandé. Une base qui ne se rapatrie pas
// le retient avant la machine : c'est elle qui se dit.
export function direRejeuEn(rejeu: NonNullable<EtatDeLaBase["recheck"]>, depuis: (instant: string) => string, retenu: ControleRetenu | null, prep: "for" | "since" = "for"): string {
  if (retenu !== null) return `the base cannot be fetched ${prep} ${depuis(retenu.at)} (${retenu.reason}), the pass comes back to it on its own`;
  return rejeu.heldAt === null ? "the pass plays it on its next round" : `the saturated machine has held it ${prep} ${depuis(rejeu.heldAt)}, the pass comes back to it on its own`;
}

// Ce qui suit l'annonce d'une base rouge : le contrôle qui n'a pas pu la
// vérifier depuis, puis le rejeu demandé — par le chef, ou par la pass, qui
// rejoue seule tout rouge une fois — ou, sans demande, ce qui retient son
// contrôle, et le geste.
export function suiteDeBaseRougeEn({ unplayed, reason, recheck }: EtatDeLaBase, depuis: (instant: string) => string, retenu: ControleRetenu | null, prep: "for" | "since" = "for"): string[] {
  return [
    ...(unplayed === null ? [] : [`gates not played on ${court(unplayed.sha)} ${prep} ${depuis(unplayed.at)}${direPanneEn(reason)}: a check that was not played does not lift a red that was found`]),
    ...(recheck === null
      ? [...(retenu === null ? [] : [direControleRetenuEn(retenu, depuis, prep)]), `replay its gates without waiting for a commit: ${REPLAY_THE_BASE}`]
      : [`${recheck.by === "chef" ? "replay asked by the chef" : "automatic replay, before opening a repair ticket if the red holds,"} ${prep} ${depuis(recheck.at)}: ${direRejeuEn(recheck, depuis, retenu, prep)}`]),
  ];
}

// La base rouge, horodatée : pour les commandes qui montrent des instants.
export function direBaseRougeEn(controle: EtatDeLaBase, retenu: ControleRetenu | null): string[] {
  const merges = controle.tickets.length === 0 ? "" : ` — after the merge of ${controle.tickets.map((ticket) => `#${ticket}`).join(", ")}`;
  return [
    `BASE RED since ${controle.redSince ?? controle.at} (${court(controle.sha)})${merges}: nothing is judged or merged, deliveries wait`,
    ...["the station takes no more tickets while it is red", ...suiteDeBaseRougeEn(controle, (instant) => instant, retenu, "since")].map((ligne) => `  ${ligne}`),
  ];
}
