// Ce que les tests du second sous Windows partagent : les commandes que le second y publie, et ce qui se voit sous le
// terminal. Un second sous Windows tourne dans un terminal ConPTY, dont Entrée est `\r` — jamais `\r\n`, qui serait deux
// Entrées —, et ses commandes passent par le `bash` de Git ou PowerShell : guillemets, espaces doublés, `!` et la ligne
// du geste de la station y doivent arriver à l'octet près.
import assert from "node:assert/strict";
import type { Proposition } from "../../src/second/propositions.ts";
import { Faux, type Jouee, repos } from "../aides/fausse-vue.ts";

export const A = "2026-10-23T10:00:00.000Z";
export type Geste = Extract<Proposition, { kind: "gesture" }>;
export type Choix = Extract<Proposition, { kind: "choices" }>;
export const geste = (id: string, command: string): Geste => ({ kind: "gesture", command, id, at: A });
export const choix = (id: string, choices: { value: string; label: string }[]): Choix => ({ kind: "choices", choices, id, at: A });

// Ce que le chef doit pouvoir lancer depuis Windows : des guillemets doubles et simples, des espaces doublés, `!` (le
// `!` du second, et l'expansion d'historique de bash), `&&`, `%VAR%` (cmd), `$HOME`, un `\` de chemin Windows.
export const AVEC_GUILLEMETS = `! gh pr comment 1480 --body "it's  green!  see 'C:\\Users\\chef\\parade' and %USERPROFILE% — \$HOME stays" && echo done!`;
// Une ligne du geste de la station, telle que le second la publie : un sous-shell, des apostrophes, un commentaire à espaces doublés.
export const LIGNE_STATION = `(cd '/runtime' && BRIGADE_STATION_DIR='/station' node src/station/geste.ts parade pass 1480 --merge --comment 'ok!  merged')`;
export const STATION_SOUS_BANG = `! ${LIGNE_STATION}`;
export const MERGER = geste("g-1", "! gh pr merge 1480 --merge");
export const CHOIX = choix("c-1", [
  { value: "A", label: "Merge it now" },
  { value: "B", label: "Wait" },
]);

export const sous = (vue: Jouee) => vue.element("choix-du-second");
export const ecrits = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args);
export const reponses = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "repondreAuSecond").map(({ args }) => args);
export const publier = async (vue: Jouee, projet: string, proposition: Proposition | null) => {
  vue.dire("surProposition", projet, proposition);
  await repos();
};
export const cliquer = async (pose: Faux) => {
  pose.click();
  await repos();
};
export const bouton = (ou: Faux, classe: string, ok: (pose: Faux) => boolean = () => true) => ou.dessous("button").find((pose) => pose.className === classe && ok(pose)) ?? assert.fail(`pas de bouton « ${classe} »`);
export const confirmation = (ou: Faux) => ou.dessous("section").find((pose) => pose.className === "confirmation");
export const reponse = (ou: Faux, libelle: string) => (confirmation(ou) ?? assert.fail("pas de confirmation")).dessous("button").find((pose) => pose.textContent === libelle) ?? assert.fail(`pas de « ${libelle} »`);
// Les commandes que le geste porte : celle du bouton, qui n'est qu'à son survol, puis celle que la confirmation redit
// dans son aide repliée — jamais une ligne de commande à l'écran tant que rien n'est ouvert.
export const commandes = (ou: Faux) => [
  ...ou.dessous("button").filter((pose) => pose.className === "geste").map((pose) => pose.ariaLabel),
  ...[...ou.descendants()].filter((pose) => pose.className === "commande mono").map((pose) => pose.textContent),
];
