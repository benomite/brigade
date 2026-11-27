// Ce que les tests du second sous Windows partagent : les commandes que le second y publie, et ce qui se voit sous le
// terminal. Un second sous Windows tourne dans un terminal ConPTY, dont Entrée est `\r` — jamais `\r\n`, qui serait deux
// Entrées —, et ses commandes passent par le `bash` de Git ou PowerShell : guillemets, espaces doublés, `!` et la ligne
// du geste de la station y doivent arriver à l'octet près.
import assert from "node:assert/strict";
import type { Proposition } from "../../src/second/proposals.ts";
import { Fake, type Played, repos } from "../helpers/false-vue.ts";

export const A = "2026-10-23T10:00:00.000Z";
export type Action = Extract<Proposition, { kind: "gesture" }>;
export type Choice = Extract<Proposition, { kind: "choices" }>;
export const action = (id: string, command: string): Action => ({ kind: "gesture", command, id, at: A });
export const choice = (id: string, choices: { value: string; label: string }[]): Choice => ({ kind: "choices", choices, id, at: A });

// Ce que le chef doit pouvoir lancer depuis Windows : des guillemets doubles et simples, des espaces doublés, `!` (le
// `!` du second, et l'expansion d'historique de bash), `&&`, `%VAR%` (cmd), `$HOME`, un `\` de chemin Windows.
export const WITH_QUOTES = `! gh pr comment 1480 --body "it's  green!  see 'C:\\Users\\chef\\parade' and %USERPROFILE% — \$HOME stays" && echo done!`;
// Une ligne du geste de la station, telle que le second la publie : un sous-shell, des apostrophes, un commentaire à espaces doublés.
export const LINE_STATION = `(cd '/runtime' && BRIGADE_STATION_DIR='/station' node src/station/geste.ts parade pass 1480 --merge --comment 'ok!  merged')`;
export const STATION_UNDER_BANG = `! ${LINE_STATION}`;
export const MERGER = action("g-1", "! gh pr merge 1480 --merge");
export const CHOICE = choice("c-1", [
  { value: "A", label: "Merge it now" },
  { value: "B", label: "Wait" },
]);

export const under = (vue: Played) => vue.element("choix-du-second");
export const writtenOnes = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
export const answers = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "repondreAuSecond").map(({ args }) => args);
export const publish = async (vue: Played, project: string, proposal: Proposition | null) => {
  vue.dire("surProposition", project, proposal);
  await repos();
};
export const click = async (pose: Fake) => {
  pose.click();
  await repos();
};
export const button = (or: Fake, classe: string, ok: (pose: Fake) => boolean = () => true) => or.dessous("button").find((pose) => pose.className === classe && ok(pose)) ?? assert.fail(`pas de bouton « ${classe} »`);
export const confirmation = (or: Fake) => or.dessous("section").find((pose) => pose.className === "confirmation");
export const answer = (or: Fake, wording: string) => (confirmation(or) ?? assert.fail("pas de confirmation")).dessous("button").find((pose) => pose.textContent === wording) ?? assert.fail(`pas de « ${wording} »`);
// Les commandes que le geste porte : celle du bouton, qui n'est qu'à son survol, puis celle que la confirmation redit
// dans son aide repliée — jamais une ligne de commande à l'écran tant que rien n'est ouvert.
export const commands = (or: Fake) => [
  ...or.dessous("button").filter((pose) => pose.className === "geste").map((pose) => pose.ariaLabel),
  ...[...or.descendants()].filter((pose) => pose.className === "commande mono").map((pose) => pose.textContent),
];
