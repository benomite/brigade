// Le bloc de la station de cet ordinateur, sur l'accueil (#2640) : pas installée, en cours d'installation, installée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTALLER, LES_AUTRES, SA_PAGE, holdBlocDeLaStation } from "../../src/vue/home/station/BlocDeLaStation.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const boutons = (bloc: Faux) => bloc.dessous("button").map(({ textContent }) => textContent);
const button = (bloc: Faux, texte: string) => bloc.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

function leBloc(installer: () => Promise<{ refus: string; detail?: string } | void> = async () => undefined) {
  const ouvertes: string[] = [];
  const reglees: string[] = [];
  const bloc = holdBlocDeLaStation(doc, {
    installer,
    etapes: [
      { nom: "GitHub", dit: "connect it", geste: { libelle: "Connect to GitHub", faire: async () => void reglees.push("github") } },
      { nom: "Projects", dit: "choose projects" },
    ],
    ouvrir: (id) => void ouvertes.push(id),
  });
  return { bloc, racine: bloc.racine as unknown as Faux, ouvertes, reglees };
}

test("sans station sur cet ordinateur, le bloc n'offre qu'un bouton d'installation, et aucun autre réglage", () => {
  const { bloc, racine } = leBloc();
  bloc.lire({ station: null });
  assert.deepEqual(boutons(racine), [INSTALLER]);
  assert.equal(button(racine, INSTALLER).parentElement?.children.length, 1, "pas de survol de prix : l'installation ne dit pas le sien");
  assert.doesNotMatch(racine.textContent, /Step|Next/);
});

test("l'installation en cours se dit, sans bouton ; puis les premiers réglages se déroulent un à un jusqu'à la station prête", async () => {
  let finir: () => void = () => {};
  const { bloc, racine, reglees } = leBloc(() => new Promise<void>((fini) => (finir = fini)));
  bloc.lire({ station: null });
  button(racine, INSTALLER).click();
  assert.match(racine.textContent, /installing the station/);
  assert.deepEqual(boutons(racine), []);
  finir();
  await repos();
  assert.match(racine.textContent, /Step 1 of 2 — GitHub/);
  assert.deepEqual(boutons(racine), ["Connect to GitHub", "Next"]);
  button(racine, "Connect to GitHub").click();
  await repos();
  assert.deepEqual(reglees, ["github"]);
  button(racine, "Next").click();
  assert.match(racine.textContent, /Step 2 of 2 — Projects/);
  assert.deepEqual(boutons(racine), ["Done"]);
  button(racine, "Done").click();
  assert.match(racine.textContent, /the station is ready/);
  assert.deepEqual(boutons(racine), [], "plus de bouton d'installation une fois prête");
  bloc.lire({ station: { id: "g1", nom: "Mac", phrase: "online" }, autres: [] });
  assert.deepEqual(boutons(racine), [SA_PAGE]);
});

test("une installation refusée se dit en une ligne et le bouton revient", async () => {
  const { bloc, racine } = leBloc(async () => ({ refus: "sudo refused", detail: "exit code 1" }));
  bloc.lire({ station: null });
  button(racine, INSTALLER).click();
  await repos();
  assert.ok(boutons(racine).includes(INSTALLER));
  assert.match(racine.textContent, /could not be installed/);
});

test("installée, le bloc dit le nom de la station et lie sa page, sans bouton d'installation ; les autres stations du chef ont chacune la leur", () => {
  const { bloc, racine, ouvertes } = leBloc();
  bloc.lire({
    station: { id: "g1", nom: "Mac", phrase: "online · version 1.4.0" },
    autres: [
      { id: "g2", nom: "box", phrase: "online · 2 cooks" },
      { id: "g3", nom: "nas", phrase: "offline" },
    ],
  });
  assert.match(racine.textContent, /Mac/);
  assert.ok(!boutons(racine).includes(INSTALLER));
  assert.match(racine.textContent, new RegExp(LES_AUTRES));
  button(racine, SA_PAGE).click();
  const lines = racine.dessous("button").filter(({ className }) => className === "ligne");
  assert.deepEqual(lines.map(({ children }) => children[0]?.textContent), ["box", "nas"]);
  for (const line of lines) line.click();
  assert.deepEqual(ouvertes, ["g1", "g2", "g3"]);
});
