// L'onglet du second sur un poste Windows (#1522, épique #1518) : la vue entière devant le faux pont, le poste dit
// « this PC » et n'est pas un Mac. Les flux de #1520 et #1521 — un clic sur un choix, un geste confirmé puis lancé, une
// réponse tapée, une proposition périmée — y font ce qu'ils font ailleurs, et ce qui part vers le terminal est ce que
// ConPTY attend : la commande à l'octet près, puis `\r` seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { ANNULER, LANCER } from "../../src/vue/second/geste.js";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";
import { AVEC_GUILLEMETS, bouton, CHOIX, choix, cliquer, commandes, confirmation, ecrits, geste, LIGNE_STATION, MERGER, publier, reponse, reponses, STATION_SOUS_BANG, sous } from "./aides.ts";

const PARADE: Projet = { nom: "parade", dossier: "C:\\Users\\chef\\parade" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "new session", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "PowerShell 1", note: "", arrete: false };
const ENTREE = "\r";

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "C:\\Users\\chef\\AppData\\Roaming\\brigade\\app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      // Le poste Windows : son nom à l'écran, et ce n'est pas un Mac.
      poste: { nom: "this PC", mac: false },
    }),
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this PC" }],
    shell: () => SHELL,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée du projet")).click();
  await repos();
  return vue;
}
const terminal = (vue: Jouee) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("sous Windows : les choix du second", () => {
  test("un clic sur un choix envoie sa valeur puis `\\r` seul — pas `\\r\\n`, qui serait deux Entrées —, et les boutons partent", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", CHOIX);
    assert.equal(sous(vue).hidden, false);
    const focalise = terminal(vue).focalise;
    await cliquer(bouton(sous(vue), "choix", (pose) => pose.dataset.valeur === "B"));
    assert.deepEqual(ecrits(vue), [[1, "B"], [1, ENTREE]]);
    assert.equal(ecrits(vue).flat().some((octets) => typeof octets === "string" && octets.includes("\n")), false);
    assert.deepEqual(reponses(vue), [["parade", { id: "c-1", by: "click", value: "B" }]]);
    assert.equal(sous(vue).hidden, true);
    assert.equal(terminal(vue).focalise, focalise + 1);
  });

  test("une réponse tapée (`\\r` de ConPTY) fait partir les choix ; une frappe sans Entrée, ou un collage, les laisse", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", CHOIX);
    terminal(vue).taper("quelque chose");
    // Un collage de plusieurs lignes, avec les marques de xterm : `claude` le garde dans son champ.
    terminal(vue).taper("\x1b[200~line one\r\nline two\x1b[201~");
    await repos();
    assert.equal(sous(vue).hidden, false);
    assert.deepEqual(reponses(vue), []);
    terminal(vue).taper(ENTREE);
    await repos();
    assert.deepEqual(reponses(vue), [["parade", { id: "c-1", by: "text" }]]);
    assert.equal(sous(vue).hidden, true);
    // Rien n'est écrit par la vue : le terminal n'a reçu que ce que le chef a tapé.
    assert.deepEqual(ecrits(vue), [[1, "quelque chose"], [1, "\x1b[200~line one\r\nline two\x1b[201~"], [1, ENTREE]]);
  });

  test("une proposition nouvelle remplace les boutons, et le second arrêté ou effacé les retire", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", CHOIX);
    await publier(vue, "parade", choix("c-2", [{ value: "1", label: "Split" }, { value: "2", label: "Keep" }]));
    assert.deepEqual(sous(vue).dessous("button").filter((b) => b.className === "choix").map((b) => b.dataset.valeur), ["1", "2"]);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 1) — a keypress restarts it" });
    await repos();
    assert.equal(sous(vue).hidden, true);
    vue.dire("surEtat", SECOND);
    await repos();
    assert.equal(sous(vue).hidden, false);
    await publier(vue, "parade", null);
    assert.equal(sous(vue).hidden, true);
    assert.deepEqual(ecrits(vue), []);
  });

  // DÉFAUT trouvé dans app/src/vue/vue.js (`choisirAuSecond`, #1520), fichier d'un ticket précédent : non corrigé ici.
  // Contrairement à « run it » (`lancerLeGeste` vérifie l'id), un clic sur un choix n'est lié qu'au projet : un clic arrivé
  // d'un bouton que la proposition suivante a remplacé tape sa valeur dans le second, et répond à la nouvelle question.
  test("un clic sur le bouton d'une proposition remplacée n'écrit rien", { todo: "defect of #1520: choisirAuSecond does not check the proposal id, unlike lancerLeGeste" }, async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", CHOIX);
    const ancien = bouton(sous(vue), "choix", (pose) => pose.dataset.valeur === "A");
    await publier(vue, "parade", choix("c-2", [{ value: "1", label: "Split" }, { value: "2", label: "Keep" }]));
    await cliquer(ancien);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(reponses(vue), []);
  });
});

describe("sous Windows : le geste que le second nomme", () => {
  test("le bouton, sa confirmation, puis « run it » : une commande à guillemets, espaces doublés et `!` part à l'octet près, puis `\\r` seul", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", geste("g-q", AVEC_GUILLEMETS));
    assert.deepEqual(commandes(sous(vue)), [AVEC_GUILLEMETS]);
    assert.deepEqual(ecrits(vue), []);
    await cliquer(bouton(sous(vue), "geste"));
    assert.deepEqual(commandes(sous(vue)), [AVEC_GUILLEMETS, AVEC_GUILLEMETS]);
    assert.deepEqual(ecrits(vue), []);
    await cliquer(reponse(sous(vue), LANCER));
    assert.deepEqual(ecrits(vue), [[1, AVEC_GUILLEMETS], [1, ENTREE]]);
    assert.deepEqual(reponses(vue), [["parade", { id: "g-q", by: "click" }]]);
    assert.equal(sous(vue).hidden, true);
  });

  test("une ligne du geste de la station — nue ou sous le `!` du second — part telle que publiée, ses guillemets intacts", async () => {
    for (const [rang, ligne] of [LIGNE_STATION, STATION_SOUS_BANG].entries()) {
      const vue = await ouvrir();
      await publier(vue, "parade", geste(`g-s${rang}`, ligne));
      assert.deepEqual(commandes(sous(vue)), [ligne]);
      await cliquer(bouton(sous(vue), "geste"));
      await cliquer(reponse(sous(vue), LANCER));
      assert.deepEqual(ecrits(vue), [[1, ligne], [1, ENTREE]]);
    }
  });

  test("« cancel » ne lance rien et ne touche pas au terminal ; rien ne part sans le « run it » du chef", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", geste("g-q", AVEC_GUILLEMETS));
    const sortie = [...terminal(vue).ecrits];
    await cliquer(bouton(sous(vue), "geste"));
    await cliquer(reponse(sous(vue), ANNULER));
    assert.equal(confirmation(sous(vue)), undefined);
    assert.deepEqual(commandes(sous(vue)), [AVEC_GUILLEMETS]);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(reponses(vue), []);
    assert.deepEqual(terminal(vue).ecrits, sortie);
  });

  test("une réponse tapée fait partir le geste, sans que la vue y écrive rien", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    terminal(vue).taper("! gh pr merge 1480 --merge");
    await repos();
    assert.equal(sous(vue).hidden, false);
    terminal(vue).taper(ENTREE);
    await repos();
    assert.equal(sous(vue).hidden, true);
    assert.deepEqual(reponses(vue), [["parade", { id: "g-1", by: "text" }]]);
    assert.deepEqual(ecrits(vue), [[1, "! gh pr merge 1480 --merge"], [1, ENTREE]]);
  });

  test("le second passe à autre chose : le bouton, sa confirmation ouverte et son « run it » partent, et rien n'est écrit", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    await cliquer(bouton(sous(vue), "geste"));
    const ancien = reponse(sous(vue), LANCER);
    await publier(vue, "parade", geste("g-2", STATION_SOUS_BANG));
    assert.equal(confirmation(sous(vue)), undefined);
    assert.deepEqual(commandes(sous(vue)), [STATION_SOUS_BANG]);
    await cliquer(ancien);
    assert.deepEqual(ecrits(vue), []);
    // Des choix à la place, puis rien : plus de geste.
    await cliquer(bouton(sous(vue), "geste"));
    const deuxieme = reponse(sous(vue), LANCER);
    await publier(vue, "parade", CHOIX);
    assert.deepEqual(commandes(sous(vue)), []);
    await cliquer(deuxieme);
    await publier(vue, "parade", null);
    assert.equal(sous(vue).hidden, true);
    assert.deepEqual(ecrits(vue), []);
    assert.deepEqual(reponses(vue), []);
  });

  test("un shell PowerShell ouvert à côté, ou le second arrêté, ne montre pas le geste : rien ne se lance ailleurs que dans le second", async () => {
    const vue = await ouvrir();
    await publier(vue, "parade", MERGER);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.deepEqual(commandes(sous(vue)), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(commandes(sous(vue)), ["! gh pr merge 1480 --merge"]);
  });
});
