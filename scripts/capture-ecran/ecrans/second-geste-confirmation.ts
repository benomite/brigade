// Le même espace, le bouton du geste cliqué (#1521) : la confirmation redit la commande entière, « run it » la lance
// dans le terminal du second au nom du chef, « cancel » ne lance rien.
import type { Ecran } from "./commun.ts";
import { geste } from "./second-geste.ts";

export const ecran: Ecran = {
  dit: "Le même espace, le bouton du geste cliqué (#1521) : la confirmation, la commande entière dans une aide repliée, « run it » et « cancel »",
  ...geste([{ cliquer: "#choix-du-second button.geste" }]),
};
