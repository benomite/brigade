// La page d'un projet dit où il cuit, et déménage sa cuisine d'un geste (#1095), la vue jouée. « Cooks
// on this Mac » pour un projet qui cuit sur cet ordinateur — avec ce que ça implique : sa cuisine
// s'arrête quand on ferme l'app —, « Cooks on parade-box » pour un projet qui cuit sur sa box. Un seul
// bouton, « move the kitchen », l'emmène sur ce Mac, le ramène sur sa box ou sur une autre station,
// sans retrait ni rajout. Refusé, la raison se lit en une phrase sous la ligne, et la ligne ne
// change pas : il cuit toujours là où il cuisait.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type Demenagement, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-20T10:00:00.000Z";
const BOX = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// parade, confié à ses deux stations : sa principale, et où il cuit, tel que leurs suivis le disent.
const station = (id: string, nom: string, principale: boolean, etat: "servi" | "secondaire" | "refuse" | "attendu" | "a-autoriser" = principale ? "servi" : "secondaire", dit = "") => ({ id, nom, principale, etat, dit, autoriser: [] });
const SUR_LA_BOX: ProjetVu = { nom: "parade", depot: "benomite/parade", base: "main", stations: [station("gbox", "parade-box", true), station("gmac", "macbook", false)], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const SUR_LE_MAC: ProjetVu = { ...SUR_LA_BOX, stations: [station("gmac", "macbook", true), station("gbox", "parade-box", false)], cuitSur: { id: "gmac", nom: "macbook", ici: true } };
const vuDes = (...projets: ProjetVu[]): VuDesProjets => ({ a: A, projets, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) });

const demarrage = (projets: Projet[], projetsDesStations: VuDesProjets) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations,
});

// Ce qui se voit sous `ou` : ni lui, ni aucun de ses parents jusqu'à `ou` n'est caché.
const montre = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const boutons = (ou: Faux) => ou.dessous("button").filter((bouton) => montre(ou, bouton));
const bouton = (ou: Faux, texte: string) => boutons(ou).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » visible sous ${ou.id}`);
const ligne = (bloc: Faux) => bloc.children[0] ?? assert.fail("pas de ligne");
const choix = (bloc: Faux) => bloc.dessous("section").find((section) => section.className === "demenagement") ?? assert.fail("pas de choix du déménagement");
const dit = (bloc: Faux) => bloc.dessous("p").find((p) => p.className.split(" ").includes("demenagement-dit")) ?? assert.fail("pas de ligne de déménagement");

// L'espace de « parade », ouvert par sa case de la barre.
async function laPage(vu: VuDesProjets, demenager: (nom: string, vers: string) => Demenagement = () => ({ demenage: { projet: "parade", de: "parade-box", vers: "macbook" } }), projet: Projet = PARADE) {
  const jouee = await jouerLaVue({ demarrage: () => demarrage([projet], vu), demenagerLaCuisine: demenager, espace: () => [] });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("espace").textContent, "parade");
  return { jouee, bloc: jouee.element("stations-du-projet") };
}

test("un projet qui cuit sur sa box : « Cooks on parade-box », sans rien dire de l'app qu'on ferme", async () => {
  const { bloc } = await laPage(vuDes(SUR_LA_BOX));
  assert.equal(ligne(bloc).textContent, "Cooks on parade-box · macbook (second station)");
  assert.doesNotMatch(bloc.textContent, /stops when you close the app/);
  const sienne = ligne(bloc).dessous("button")[0] ?? assert.fail();
  assert.equal(sienne.ariaLabel, "parade-box — main — served");
});

test("la station ajoutée en plus de la principale : pastille verte quand la principale la dit atteinte, grise sinon, pourquoi au survol (#1757)", async () => {
  const avec = (atteinte?: { oui: boolean; dit: string }) => vuDes({ ...SUR_LA_BOX, stations: [SUR_LA_BOX.stations[0]!, { ...SUR_LA_BOX.stations[1]!, ...(atteinte === undefined ? {} : { atteinte }) }] });
  const leMac = async (vu: VuDesProjets) => {
    const { bloc } = await laPage(vu);
    assert.equal(ligne(bloc).textContent, "Cooks on parade-box · macbook (second station)");
    const sienne = ligne(bloc).dessous("button").find(({ ariaLabel }) => ariaLabel.startsWith("macbook")) ?? assert.fail("pas de macbook");
    return { ton: sienne.children[0]?.dataset.ton, aria: sienne.ariaLabel, survol: sienne.title };
  };
  assert.deepEqual(await leMac(avec({ oui: true, dit: "reached: it is online on GitHub" })), { ton: "vert", aria: "macbook — secondary — reached: it cooks with the main station", survol: "reached: it cooks with the main station\nit is online on GitHub" });
  assert.deepEqual(await leMac(avec({ oui: false, dit: "not reached: it stopped at 2026-10-20T09:50:00.000Z" })), { ton: "gris", aria: "macbook — secondary — not reached", survol: "not reached\nit stopped at 2026-10-20T09:50:00.000Z" });
  // La principale n'en dit rien encore : grise, comme avant.
  assert.equal((await leMac(avec())).ton, "gris");
});

test("la station ajoutée depuis l'app qui ne sert rien n'est pas une « second station » : la ligne dit où elle en est, avec de quoi relire (#1774)", async () => {
  const bloquee = (etat: "attendu" | "a-autoriser" | "refuse", dit = "") => vuDes({ ...SUR_LA_BOX, stations: [SUR_LA_BOX.stations[0]!, station("gmac", "macbook", false, etat, dit)] });
  const attendue = (await laPage(bloquee("attendu"))).bloc;
  assert.equal(ligne(attendue).textContent, "Cooks on parade-box · macbooknot received by the stationcheck again");
  assert.doesNotMatch(attendue.textContent, /second station/);
  const sienne = ligne(attendue).dessous("button").find(({ ariaLabel }) => ariaLabel.startsWith("macbook")) ?? assert.fail("pas de macbook");
  assert.equal(sienne.children[0]?.dataset.ton, "gris");
  assert.match(ligne(attendue).dessous("span").find(({ className }) => className === "pourquoi")?.title ?? "", /open Brigade on macbook's computer/);
  bouton(attendue, "check again");
  const refusee = (await laPage(bloquee("refuse", "refused: no sandbox"))).bloc;
  assert.match(ligne(refusee).textContent, /macbookrefusedcheck again/);
  assert.doesNotMatch(refusee.textContent, /second station/);
  const autorisation = (await laPage(bloquee("a-autoriser"))).bloc;
  assert.match(ligne(autorisation).textContent, /macbookwaiting for your authorization on GitHub/);
});

test("un projet qui cuit sur ce Mac : « Cooks on this Mac », et sa cuisine s'arrête quand on ferme l'app", async () => {
  const { bloc } = await laPage(vuDes(SUR_LE_MAC));
  assert.equal(ligne(bloc).textContent, "Cooks on this Mac · its kitchen stops when you close the app · parade-box (second station)");
  const sienne = ligne(bloc).dessous("button")[0] ?? assert.fail();
  assert.match(sienne.title, /^macbook, this computer's station/);
});

test("un projet que la station de ce Mac sert sans l'app (#1122) se dit de même, sans geste pour le déménager", async () => {
  // `ici`, posé comme main.ts le pose : la configuration de la station de ce Mac a sa ligne.
  const ici = await jouerLaVue({ demarrage: () => ({ ...demarrage([], vuDes()), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, undefined, () => true) }), espace: () => [] });
  (ici.element("projets").children.at(1) ?? assert.fail()).click();
  await repos();
  const sienne = ici.element("stations-du-projet");
  assert.equal(ligne(sienne).textContent, "Cooks on this Mac · its kitchen stops when you close the app");
  assert.equal(boutons(sienne).some(({ textContent }) => textContent === "move the kitchen"), false, "rien ne part d'une station que l'app ne connaît pas");
});

test("un seul geste l'emmène sur ce Mac : le choix dit d'où, vers où, et son prix en une ligne", async () => {
  const { jouee, bloc } = await laPage(vuDes(SUR_LA_BOX));
  bouton(bloc, "move the kitchen").click();
  await repos();
  const ouvert = choix(bloc);
  assert.equal(ouvert.hidden, false);
  assert.equal(ouvert.dessous("p")[0]?.textContent, "Move parade's kitchen from parade-box to:");
  assert.deepEqual(boutons(ouvert).map(({ textContent }) => textContent), ["this Mac", "cancel"]);
  assert.equal(bouton(ouvert, "this Mac").title, "stops when you close the app on this computer");
  assert.equal(ouvert.dessous("p").filter(({ className }) => className === "prix").map(({ textContent }) => textContent).join(), "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.");
  assert.equal(boutons(bloc).some(({ textContent }) => textContent === "move the kitchen"), false, "le geste ouvert ne se rouvre pas");

  bouton(ouvert, "this Mac").click();
  await repos();
  assert.deepEqual(jouee.dernier("demenagerLaCuisine"), ["parade", "gmac"]);
  assert.equal(ouvert.hidden, true);
  assert.equal(dit(bloc).textContent, "parade's kitchen moves to this Mac: parade-box hands it over as soon as this Mac is ready — until then it cooks on parade-box");
  assert.equal(dit(bloc).classList.contains("refus"), false);
  // La ligne dit où il cuit, tel que les stations le publient : toujours la box, tant qu'elle n'a pas remis.
  assert.equal(ligne(bloc).textContent, "Cooks on parade-box · macbook (second station)");
});

test("le même geste le ramène sur sa box — recommandée, toujours allumée — ou sur une autre station", async () => {
  const { jouee, bloc } = await laPage(vuDes(SUR_LE_MAC));
  bouton(bloc, "move the kitchen").click();
  await repos();
  const ouvert = choix(bloc);
  assert.equal(ouvert.dessous("p")[0]?.textContent, "Move parade's kitchen from this Mac to:");
  const box = bouton(ouvert, "parade-box");
  assert.equal(box.className, "recommande");
  assert.equal(box.title, "always on: it keeps cooking while your computer sleeps");
  box.click();
  await repos();
  assert.deepEqual(jouee.dernier("demenagerLaCuisine"), ["parade", "gbox"]);
  // Aucun retrait, aucun rajout : seul le déménagement est parti.
  assert.equal(jouee.appels.some(({ geste }) => ["retirerDUneStation", "confierAUneStation", "ajouterAUneStation", "desinstaller"].includes(geste)), false);
});

test("refusé — pas de bac à sable sur ce Mac —, la raison se lit en une phrase, et la ligne ne change pas", async () => {
  const said = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const { bloc } = await laPage(vuDes(SUR_LA_BOX), () => ({ refus: said }));
  bouton(bloc, "move the kitchen").click();
  await repos();
  bouton(choix(bloc), "this Mac").click();
  await repos();
  assert.equal(dit(bloc).hidden, false);
  assert.equal(dit(bloc).textContent, `parade stays on parade-box: ${said}`);
  assert.ok(dit(bloc).classList.contains("refus"));
  assert.equal(ligne(bloc).textContent, "Cooks on parade-box · macbook (second station)");
  assert.equal(choix(bloc).hidden, true);
  // Le geste reste offert : on peut réessayer une fois le bac à sable posé.
  bouton(bloc, "move the kitchen");
});

test("un refus sans phrase du runtime — GitHub injoignable — se dit en une ligne, son détail au survol", async () => {
  const { bloc } = await laPage(vuDes(SUR_LA_BOX), () => ({ refus: "GitHub could not be read or written: nothing was changed", detail: "brigade : … HTTP 502" }));
  bouton(bloc, "move the kitchen").click();
  await repos();
  bouton(choix(bloc), "this Mac").click();
  await repos();
  assert.equal(dit(bloc).textContent.startsWith("parade stays on parade-box: GitHub could not be read or written: nothing was changed"), true);
  assert.doesNotMatch(dit(bloc).textContent, /HTTP 502/);
  assert.equal(dit(bloc).dessous("button").find(({ className }) => className === "aide")?.ariaLabel, "brigade : … HTTP 502");
});

test("refusé par ce Mac après coup, la page dit pourquoi, la ligne reste sur la box, et le déménagement se reprend", async () => {
  const raison = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const refuse: ProjetVu = {
    ...SUR_LA_BOX,
    stations: [station("gmac", "macbook", true, "refuse", raison), station("gbox", "parade-box", false)],
    demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "refusee", dit: raison },
  };
  const { jouee, bloc } = await laPage(vuDes(refuse));
  assert.match(ligne(bloc).textContent, /^Cooks on parade-box/);
  assert.equal(dit(bloc).textContent, `parade stays on parade-box: this Mac refused to take it over — ${raison}`);
  bouton(bloc, "move the kitchen").click();
  await repos();
  bouton(choix(bloc), "keep it on parade-box").click();
  await repos();
  assert.deepEqual(jouee.dernier("demenagerLaCuisine"), ["parade", "gbox"]);
  assert.equal(dit(bloc).textContent, "parade keeps cooking on parade-box: the move is called off");
});

test("accepté, le déménagement va à son terme : la ligne dit qu'il part, et aucun autre ne se demande", async () => {
  const enRoute: ProjetVu = { ...SUR_LA_BOX, demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "acceptee", dit: "ready to take it over from parade-box" } };
  const { bloc } = await laPage(vuDes(enRoute));
  assert.match(ligne(bloc).textContent, /^Cooks on parade-box · moving to this Mac…/);
  assert.equal(boutons(bloc).some(({ textContent }) => textContent === "move the kitchen"), false);
});
