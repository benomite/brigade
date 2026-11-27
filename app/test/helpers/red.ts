// Les cartes qui attendent le chef, comptées sur le rail posé (#3523) : l'entrée « TODO (N) » n'est plus à l'écran, ce compte
// est celui que l'accueil dit. Une carte rouge est une carte d'attente dans une colonne, .
import type { Fake } from "./false-vue.ts";

export const red = (rail: Fake): string[] =>
  rail
    .dessous("section")
    .filter(({ className }) => className === "colonne")
    .flatMap((column) => column.dessous("li"))
    .filter((li) => li.dataset.carte === "attente")
    .map((li) => li.children[0]?.children[0]?.textContent ?? "");
