// Ce qui retient la cuisine d'un projet, sur sa page (#1119, épique 1115) : l'accès au dépôt refusé
// (#1117) dit sa raison et le geste du chef en une phrase, un worktree impossible à préparer (#1118) dit
// sa raison et l'heure du prochain essai, et ni l'un ni l'autre ne laisse dire « prepares it within a
// minute ». Sans eux, la phrase rassurante reste. Quand le runtime les efface, la page relue revient à
// son message sans que l'app soit rechargée. Les suivis sont écrits dans la forme du runtime
// (`SuiviDuProjet`) et relus par `lireSuivi`, comme l'app relit le gist d'une station.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EchecDuWorktree as DuRuntime } from "../../../runtime/src/echec-du-worktree.ts";
import type { AccesBloque as AccesDuRuntime } from "../../../runtime/src/projets/acces.ts";
import { refus as refusDuRuntime } from "../../../runtime/src/projets/refus.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { lireSuivi } from "../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { COPIEE, COPIER, DETAILS, OUVRIR_SUR_GITHUB, poserDepotRetenu } from "../../src/vue/onboarding/depot-retenu.js";
import { Faux as Fabrique, type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// Ce que le runtime écrit (runtime/src/projets/acces.ts, echec-du-worktree.ts), mot pour mot.
const ACCES: AccesDuRuntime = {
  bloque: "fetch",
  raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username and no credential helper answers (git: fatal: could not read Username for 'https://github.com').",
  geste: "Run `gh auth setup-git` on parade-box, under the account that runs it.",
};
const ECHEC: DuRuntime = { ticket: 433, raison: "git fetch : fatal: No space left on device", prochainEssai: "2026-10-19T12:10:00.000Z" };

const suivi = (en: object) => JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...en }] });

// Ce que le process principal rend à la vue d'un suivi : la lecture de `projets.ts`, pour la seule principale.
const vue = (en: object | null): VuDesProjets => {
  const [lu] = lireSuivi(suivi(en ?? {}));
  const projet: ProjetVu = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: [{ id: "g1", nom: "parade-box", principale: true, etat: lu?.etat ?? "servi", dit: "", autoriser: [] }],
    servi: null,
    acces: lu?.acces ?? null,
    refus: lu?.refus ?? null,
    worktree: lu?.worktree ?? null,
  };
  return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
};

const demarrage = (projetsDesStations: VuDesProjets) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations,
});

// Ce qui se voit sous `ou` : ni l'élément, ni aucun de ses parents jusqu'à `ou` n'est caché.
const visible = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const dit = (ou: Faux) => ou.dessous("p").filter((p) => visible(ou, p)).map((p) => p.textContent);

// Le projet « parade » est confié d'ici à sa box ; la page est ouverte, et la box n'a rien dit encore.
async function laPage(initial: VuDesProjets) {
  const jouee = await jouerLaVue({
    demarrage: () => demarrage(initial),
    confierAUneStation: () => ({ ajoute: "parade" }),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  return { jouee, bloc: jouee.element("stations-du-projet") };
}

test("l'accès au dépôt refusé : une phrase donne la raison et le geste, sans « within a minute » ; le détail de git est au survol", async () => {
  const { jouee, bloc } = await laPage(vue({ etat: "refuse", dit: "refused", acces: ACCES }));
  const [phrase, ...autres] = dit(bloc).filter((texte) => /cannot fetch/.test(texte));
  assert.deepEqual(autres, [], "une seule phrase");
  assert.match(phrase ?? "", /^parade-box cannot fetch from benomite\/parade: github\.com asks for a username and no credential helper answers\. Run gh auth setup-git on parade-box, under the account that runs it\.$/);
  const code = bloc.dessous("code").find((candidat) => candidat.textContent === "gh auth setup-git") ?? assert.fail("la commande n'est pas posée en code");
  assert.equal(code.className, "mono");
  assert.equal(bloc.dessous("p").find((p) => /cannot fetch/.test(p.textContent))?.title, "git: fatal: could not read Username for 'https://github.com'");
  assert.doesNotMatch(bloc.textContent, /within a minute/);
  assert.equal(jouee.appels.some(({ geste }) => geste === "confierAUneStation"), false);
  // Le geste se fait sur la machine de la station : l'écran offre un bouton, recommandé, qui en copie la commande.
  const boutons = bloc.dessous("button").filter((b) => b.textContent === COPIER);
  assert.equal(boutons.length, 1, "un bouton « copy the command »");
  assert.equal(boutons[0]?.className, "recommande");
});

test("« copy the command » copie la commande du geste seule, et le dit", () => {
  const copiees: string[] = [];
  const doc = { createElement: (balise: string) => new Fabrique(balise) };
  const pose = poserDepotRetenu(doc, { acces: ACCES, maintenant: 0, copier: (commande) => copiees.push(commande) }) as unknown as Faux;
  const bouton = pose.dessous("button")[0] ?? assert.fail("pas de bouton");
  assert.equal(bouton.textContent, COPIER);
  bouton.click();
  assert.deepEqual(copiees, ["gh auth setup-git"]);
  assert.equal(bouton.textContent, COPIEE);
  // Un échec sans accès refusé n'a pas de commande à copier : pas de bouton.
  const sans = poserDepotRetenu(doc, { worktree: { ...ECHEC, acces: null }, maintenant: 0, copier: () => assert.fail() }) as unknown as Faux;
  assert.equal(sans.dessous("button").length, 0);
});

// Ce que le runtime écrit d'un clone en échec (runtime/src/projets/echec-du-clone.ts), mot pour mot.
const CLONE = {
  cause: "token-excludes-repository",
  raison: "The token used by parade-box does not include BOBL-tech/mirrorscreen, so GitHub answers that it does not exist and parade-box cannot clone it.",
  geste: "Add BOBL-tech/mirrorscreen to the repositories of the token used by parade-box (its resource owner must be BOBL-tech): edit the token, and select BOBL-tech/mirrorscreen under “Repository access”.",
  ou: "On GitHub, in the fine-grained tokens of the account.",
  liens: ["https://github.com/settings/personal-access-tokens"],
  compte: "parade-box",
  detail: "remote: Repository not found.\nfatal: repository 'https://github.com/BOBL-tech/mirrorscreen.git/' not found\nfailed to run git: exit status 128",
  reessaieToutesLes: 30,
};

test("un clone en échec : la cause et le compte de la station en clair, le geste et sa page GitHub, le prochain essai ; la sortie de git derrière « details » seulement", () => {
  const [lu] = lireSuivi(suivi({ etat: "refuse", dit: `${CLONE.raison} ${CLONE.geste}`, clone: CLONE, refus: refusDuRuntime("clone-failed") }));
  assert.deepEqual(lu?.clone, CLONE);
  const ouvertes: string[] = [];
  const doc = { createElement: (balise: string) => new Fabrique(balise) };
  const pose = poserDepotRetenu(doc, { clone: lu?.clone ?? null, refus: lu?.refus ?? null, maintenant: 0, copier: () => assert.fail(), ouvrir: (url) => ouvertes.push(url) }) as unknown as Faux;
  const [raison, geste, essai] = pose.dessous("p").filter((p) => p.parentElement?.balise !== "details").map((p) => p.textContent);
  assert.equal(raison, CLONE.raison);
  assert.equal(geste, `${CLONE.geste} ${CLONE.ou}`);
  assert.equal(essai, "Next retry within 30 s: this turns green by itself once it is fixed.");
  // Le refus qui l'accompagne ne dit rien de plus : il ne s'affiche pas.
  assert.doesNotMatch(pose.textContent, /could not fetch a copy/);
  // Rien de brut hors du détail.
  const horsDetail = (pose.children[0]?.children ?? []).filter((enfant) => enfant.balise !== "details").map((enfant) => enfant.textContent).join(" ");
  assert.match(horsDetail, /parade-box/);
  assert.doesNotMatch(horsDetail, /exit status|fatal:|clone de|en échec/);
  const details = pose.dessous("details")[0] ?? assert.fail("pas de « details »");
  assert.equal(details.dessous("summary")[0]?.textContent, DETAILS);
  assert.equal(details.dessous("pre")[0]?.textContent, CLONE.detail);
  // La page du geste s'ouvre d'un bouton.
  const bouton = pose.dessous("button").find((candidat) => candidat.textContent === OUVRIR_SUR_GITHUB) ?? assert.fail("pas de bouton vers GitHub");
  bouton.click();
  assert.deepEqual(ouvertes, ["https://github.com/settings/personal-access-tokens"]);
  // Le geste fait, la station n'en dit plus rien : le bloc s'en va.
  assert.equal(poserDepotRetenu(doc, { clone: null, refus: null, maintenant: 0, copier: () => {} }), null);
});

test("un worktree impossible à préparer : la raison de l'échec et l'heure du prochain essai", async () => {
  const { bloc } = await laPage(vue({ worktree: ECHEC }));
  const lignes = dit(bloc);
  assert.ok(lignes.includes("The worktree of #433 could not be prepared: git fetch : fatal: No space left on device"), lignes.join(" | "));
  assert.ok(lignes.some((ligne) => /^Next retry at \d{1,2}:\d{2} [AP]M, in \d+ min\.$/.test(ligne) || ligne === "Its retry is due now."), lignes.join(" | "));
  assert.doesNotMatch(bloc.textContent, /within a minute/);
});

test("un worktree impossible à préparer parce que l'accès est refusé : le geste, et l'heure du prochain essai", async () => {
  const { bloc } = await laPage(vue({ worktree: { ...ECHEC, raison: ACCES.raison, acces: ACCES } }));
  const lignes = dit(bloc);
  assert.ok(lignes.some((ligne) => /Run gh auth setup-git on parade-box/.test(ligne)), lignes.join(" | "));
  assert.ok(lignes.some((ligne) => /^Next retry at /.test(ligne) || ligne === "Its retry is due now."), lignes.join(" | "));
});

test("ni accès refusé ni worktree en échec : la phrase « prepares it within a minute » reste", async () => {
  const { jouee, bloc } = await laPage(vue(null));
  assert.equal(bloc.dessous("div").some((d) => d.className === "depot-retenu"), false);
  // La page n'a pas encore de station qui cuit ? Elle en a une, servie : le message vient du geste de confier.
  const sans: VuDesProjets = { ...vue(null), projets: [] };
  jouee.dire("surProjetsDesStations", sans);
  await repos();
  assert.equal(bloc.dessous("div").some((d) => d.className === "depot-retenu" && visible(bloc, d)), false);
});

test("le runtime efface l'état après le geste : la page relue revient au message, sans recharger l'app", async () => {
  const { jouee, bloc } = await laPage(vue({ etat: "refuse", dit: "refused", acces: ACCES }));
  assert.match(bloc.textContent, /gh auth setup-git/);
  jouee.dire("surProjetsDesStations", vue({ worktree: ECHEC }));
  await repos();
  assert.match(dit(bloc).join(" | "), /The worktree of #433 could not be prepared/);
  assert.doesNotMatch(dit(bloc).join(" | "), /gh auth setup-git/);
  jouee.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.doesNotMatch(dit(bloc).join(" | "), /gh auth setup-git|could not be prepared/);
  assert.equal(bloc.dessous("div").some((d) => d.className === "depot-retenu" && visible(bloc, d)), false);
});

test("lireSuivi ne croit que ce qui a la forme : un accès sans geste, un échec sans raison ne disent rien", () => {
  const [lu] = lireSuivi(suivi({ acces: { bloque: "fetch", raison: "x", geste: "" }, worktree: { ticket: 433, raison: "" } }));
  assert.equal(lu?.acces, null);
  assert.equal(lu?.worktree, null);
  const [bon] = lireSuivi(suivi({ acces: ACCES, worktree: { ...ECHEC, acces: ACCES } }));
  assert.deepEqual(bon?.acces, ACCES);
  assert.deepEqual(bon?.worktree, { ...ECHEC, acces: ACCES });
});

// Ce que le runtime publie (runtime/src/projets/refus.ts), tel quel : le refus et le remède qui le lève.
const REFUS = refusDuRuntime("proxy-port-set");
const REMEDE = "remedy" in REFUS ? REFUS.remedy : assert.fail("le refus du port n'a plus de remède");

test("un projet refusé par la station : la page dit pourquoi et ce que le chef fait, sans le texte brut ni chemin", async () => {
  const brut = "BRIGADE_PROXY_PORT is set in /etc/brigade/en-service: refused";
  const { bloc } = await laPage(vue({ etat: "refuse", dit: brut, refus: REFUS }));
  const lignes = dit(bloc);
  assert.ok(lignes.includes(REFUS.message), lignes.join(" | "));
  assert.ok(lignes.includes(REFUS.action), lignes.join(" | "));
  assert.doesNotMatch(bloc.textContent, /en-service|\/etc\//);
  assert.doesNotMatch(bloc.textContent, /within a minute/);
  // Le geste attendu est un bouton : celui du remède que la station publie, sa phrase pour libellé (ticket 1205).
  const boutons = bloc.dessous("button").filter((b) => b.textContent === REMEDE.description);
  assert.equal(boutons.length, 1, "le bouton du remède");
  assert.equal(boutons[0]?.className, "recommande");
});

test("sans refus, la page est inchangée ; un refus sans phrase ou sans action ne dit rien", async () => {
  const { bloc } = await laPage(vue(null));
  assert.equal(bloc.dessous("div").some((d) => d.className === "depot-retenu"), false);
  const [lu] = lireSuivi(suivi({ refus: { ...REFUS, action: "" } }));
  assert.equal(lu?.refus, null);
  const [bon] = lireSuivi(suivi({ refus: REFUS }));
  assert.equal(bon?.refus?.message, REFUS.message);
});
