// Ce qu'un projet a coûté n'est plus sur sa page (#1699) : il était sous Settings → Reliability, à côté de la
// fiabilité de ses cooks (#1022) — ses tokens perdus, ses tickets les plus chers. Quand la fiabilité est devenue une
// section de l'onglet Cooks, il n'y a pas suivi : la page des coûts de l'app porte les mêmes blocs, chaque projet
// nommé (cost/perdus.test.ts, cost/chers.test.ts), et un second chiffre de tokens perdus, compté autrement, aurait
// côtoyé celui de la fiabilité. Le projet n'a toujours pas d'onglet Cost. La vue est jouée telle qu'elle est
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { type Jouee, jouerLaVue, ouvrirLecture, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-17T10:00:00.000Z";
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } };

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts).
const cook = (ticket: number, fin: string, tokens: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${fin}  31 tours · ${n(tokens)} tokens · 9,2 min`;
// Une `station` : ses derniers cooks, puis les décisions du chef — le seuil du ticket le plus cher, posé ou non.
const station = (seuilTicket: string | null, ...cooks: string[]) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "derniers cooks        ",
    ...cooks,
    "consommé              en cours : rien",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        ${seuilTicket ?? "non posée — BRIGADE_DRIFT_TICKET_TOKENS ne se lit que du journal"}`,
    "  seuil-perdus        non posée — BRIGADE_DRIFT_LOST_TOKENS ne se lit que du journal",
    "",
  ].join("\n");
// Ce que la lecture de Cooks rend : `station`, puis `measures` sur sa fenêtre, puis `closing --json`.
const lu = (projet: string, texte: string, demande: number) => ({
  projet,
  demande,
  a: A,
  sorties: [
    { commande: "station", texte },
    { commande: "measures --last 10 --by 1", texte: "" },
    { commande: "closing --json", texte: "" },
  ],
});

async function ouvrirCooks(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
  await repos();
  await ouvrirLecture(vue, "Cooks");
  return vue;
}

describe("le coût d'un projet n'est plus sur sa page (#1699)", () => {
  test("le projet n'a plus d'onglet Cost : son seul onglet est Settings", async () => {
    const vue = await ouvrirCooks();
    assert.deepEqual(vue.element("onglets").children.map(({ textContent }) => textContent), ["Settings"]);
  });

  test("Cooks, lu, ne pose ni ses tokens perdus de `station` ni ses tickets les plus chers ; Settings non plus", async () => {
    const vue = await ouvrirCooks();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", lu("parade", station("100000", cook(7, "fini", "120 000"), cook(8, "échoué", "30 000")), demande), undefined, undefined);
    await repos();
    const poses = vue.poses();
    assert.deepEqual(poses.filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
    assert.doesNotMatch(vue.element("rail").textContent, /cost of this project|most expensive|120,000/);
    // Settings — une seule page, sans sous-pages (#1700) — ne les pose pas non plus.
    (vue.element("onglets").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.deepEqual(vue.poses().filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
  });
});
