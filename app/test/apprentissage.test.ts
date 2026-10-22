// Ce que les cooks ont appris au projet, sur l'onglet Cooks (#1058, épique 1034) : la lecture du champ
// `apprentissage` de `facts`, la section telle que la vue la pose — les leçons avec leur statut, leur date,
// leurs tickets et leurs cooks, le lien d'une promue vers sa ligne du carnet ; les profils avec leur
// domaine, leur carnet et leurs tickets ; une phrase, et aucune liste, quand il n'y a rien —, et la page
// entière, dans l'espace du projet, où le lien ouvre la ligne et ne crée ni branche ni PR. L'apprentissage
// est écrit dans la forme même du runtime (`Apprentissage`) : l'app lit ce que la box écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Apprentissage as ApprentissageDuRuntime } from "../../runtime/src/apprentissage/projet.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { apprentissageDe, apprentissageLu, type Apprentissage } from "../src/apprentissage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, tableau, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { AUCUN_PROFIL, DIT_PROMUE, PAS_ASSEZ, DIT_PROVISOIRE, LIEN, poserApprentissage, PROMUE, PROVISOIRE, resumeDeLApprentissage, RIEN_APPRIS, TITRE } from "../src/vue/apprentissage.js";
import { Faux, jouerLaVue, ouvrirLecture, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-19T10:00:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const LIGNE = "https://github.com/chef/parade/blob/main/.claude/brigade/carnet.md#L5";

// Une leçon provisoire, une promue avec l'adresse de sa ligne, une promue sans (la box ne connaît pas le
// dépôt), et deux profils — dans la forme que `facts` écrit (runtime/src/apprentissage/projet.ts). Le
// `progres` de chacun (#1057) : la part livrée du premier coup et les essais moyens, avant et après son entrée.
const PROGRES = { avant: { retenus: 10, premiers: 6, premierCoup: 0.6, essaisMoyens: 1.5 }, apres: { retenus: 4, premiers: 3, premierCoup: 0.75, essaisMoyens: 1.25 } };
const SANS_APRES = { avant: PROGRES.avant, apres: null };
const GARNI: ApprentissageDuRuntime = {
  lecons: [
    { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRES },
    { id: "L-001", texte: "read CLAUDE.md first", statut: "promue", date: "2026-10-01", tickets: [12, 15], origine: { kind: "pass-send-back", ticket: 12 }, cooks: 14, url: LIGNE, progres: PROGRES },
    { id: "L-002", texte: "a test waits for a fact", statut: "promue", date: "2026-10-08", tickets: [18], origine: { kind: "chef-correction", ticket: 18 }, cooks: 1, progres: PROGRES },
  ],
  profils: [
    {
      nom: "app-src-vue",
      domaine: "app/src/vue",
      skills: ["agents/cook-design.md"],
      perimetre: ["app/src/vue"],
      carnet: [
        { id: "L-001", texte: "keep the view thin", etat: "promoted", origine: { kind: "retro" } },
        { id: "L-002", texte: "every gesture is a button", etat: "retired", origine: { kind: "chef-correction", ticket: 29 } },
      ],
      tickets: [29, 36],
      progres: PROGRES,
    },
    { nom: "runtime-src-correctif", domaine: "runtime/src/correctif", skills: [], perimetre: ["runtime/src/correctif"], carnet: [], tickets: [], progres: { avant: null, apres: null } },
  ],
};
// Ce que l'app en lit : la même chose, moins l'origine des leçons d'un carnet de profil, qu'elle ne lit pas.
const sansOrigine = <T extends { origine: unknown }>({ origine: _origine, ...reste }: T) => reste;
const LU = { lecons: GARNI.lecons, profils: GARNI.profils.map((profil) => ({ ...profil, carnet: profil.carnet.map(sansOrigine) })) };

const FAITS = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
const lus = (apprentissage: unknown) => comprendre(JSON.stringify({ ...FAITS, apprentissage }));
const section = (apprentissage: ApprentissageDuRuntime): Apprentissage => apprentissageDe(apprentissageLu(JSON.parse(JSON.stringify(apprentissage))));

describe("le champ `apprentissage` de `facts`", () => {
  test("se lit tel que le runtime l'écrit", () => {
    const faits = lus(GARNI);
    assert.ok(!("informe" in faits), JSON.stringify(faits));
    assert.deepEqual(faits.apprentissage, LU);
  });

  test("absent — ni leçon ni profil, ou un runtime d'avant ce champ —, le tableau porte deux listes vides", () => {
    const faits = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in faits));
    assert.equal("apprentissage" in faits, false);
    assert.deepEqual(tableau(faits).apprentissage, { lecons: [], profils: [] });
  });

  test("une forme qui n'est pas la sienne refuse les faits, et dit quel champ", () => {
    const [provisoire] = GARNI.lecons;
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, statut: "retiree" }] }), { informe: "apprentissage.lecons[0].statut: expected provisoire or promue" });
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, date: "hier" }] }), { informe: "apprentissage.lecons[0].date: expected a date (YYYY-MM-DD)" });
    assert.deepEqual(lus({ ...GARNI, lecons: [{ ...provisoire, cooks: -1 }] }), { informe: "apprentissage.lecons[0].cooks: expected a non-negative integer" });
    assert.deepEqual(lus({ ...GARNI, profils: [{ ...GARNI.profils[0], tickets: "29" }] }), { informe: "apprentissage.profils[0].tickets: expected a list" });
    assert.deepEqual(lus({ lecons: [] }), { informe: "apprentissage.profils: expected a list" });
  });

  test("la section : l'adresse d'une promue ne passe pas à la vue — seulement si sa ligne s'ouvre ; une provisoire n'a pas de lien", () => {
    const { lecons, profils } = section(GARNI);
    const [provisoire, ouvrable, sansAdresse] = lecons;
    assert.deepEqual(provisoire, { id: "L4", texte: "run the app tests before touching the view", statut: "provisoire", date: "2026-10-17", tickets: [29, 33], origine: { kind: "retro" }, cooks: 3, progres: PROGRES });
    assert.deepEqual(ouvrable?.lien, { ouvrable: true });
    assert.deepEqual(sansAdresse?.lien, { ouvrable: false });
    assert.equal(JSON.stringify(lecons).includes("https://"), false);
    assert.deepEqual(profils, LU.profils);
  });

  test("le process principal tient la ligne d'une promue, et d'elle seule : ni provisoire, ni inconnue, ni adresse hors de GitHub", () => {
    const tenus = tenirFaits();
    const faits = { ...GARNI, lecons: [...GARNI.lecons, { id: "L-003", texte: "x", statut: "promue", date: "2026-10-09", tickets: [], cooks: 0, url: "file:///etc/passwd" }] };
    tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, apprentissage: faits }) }] });
    assert.equal(tenus.lecon("parade", "L-001"), LIGNE);
    for (const id of ["L4", "L-002", "L-003", "L-999"]) assert.equal(tenus.lecon("parade", id), undefined, id);
    assert.equal(tenus.lecon("cantine", "L-001"), undefined);
  });
});

describe("la section, telle que la vue la pose", () => {
  const poser = (apprentissage: Apprentissage | undefined) => {
    const ouverts: number[] = [];
    const lignes: string[] = [];
    const poses = poserApprentissage(doc, apprentissage, { ouvrir: (ticket: number) => ouverts.push(ticket), ouvrirLaLigne: (id: string) => lignes.push(id) }) as Faux[];
    return { poses, ouverts, lignes };
  };
  const lecons = (bloc: Faux) => bloc.dessous("li").filter(({ className }) => className.split(" ").includes("lecon"));
  const profils = (bloc: Faux) => bloc.dessous("li").filter(({ className }) => className === "profil-appris");
  const liens = (bloc: Faux) => bloc.dessous("button").filter(({ className }) => className === "lien");

  test("les faits pas encore lus : rien n'est posé", () => {
    assert.deepEqual(poser(undefined).poses, []);
  });

  test("chaque leçon dit son statut, sa date, les tickets qui l'ont proposée et le nombre de cooks qui l'ont reçue", () => {
    const [bloc, ...reste] = poser(section(GARNI)).poses;
    assert.deepEqual(reste, []);
    assert.ok(bloc !== undefined);
    assert.equal(bloc.dessous("h2")[0]?.textContent, TITRE);
    const [provisoire, promue, autre] = lecons(bloc);
    assert.ok(provisoire !== undefined && promue !== undefined && autre !== undefined);
    const statut = (lecon: Faux) => lecon.dessous("span").find(({ className }) => className === "statut");
    assert.equal(statut(provisoire)?.textContent, PROVISOIRE);
    assert.equal(statut(promue)?.textContent, PROMUE);
    // Le sens du statut est au survol de sa pastille, pas écrit à plat.
    assert.equal(statut(provisoire)?.ariaLabel, DIT_PROVISOIRE);
    assert.equal(statut(promue)?.ariaLabel, DIT_PROMUE);
    assert.doesNotMatch(bloc.textContent, /open a PR yourself/);
    assert.match(provisoire.textContent, /L4run the app tests before touching the view/);
    assert.match(provisoire.textContent, /since 10\/17\/2026/);
    assert.match(provisoire.textContent, /proposed by#29#33/);
    assert.match(provisoire.textContent, /received by 3 cooks/);
    assert.match(promue.textContent, /since 10\/1\/2026.*proposed by#12#15.*received by 14 cooks/);
    assert.match(autre.textContent, /received by 1 cook$|received by 1 cook[^s]/);
  });

  test("chaque leçon dit d'où elle vient : la rétro, le renvoi de la pass ou la correction du chef, avec son ticket", () => {
    const [bloc] = poser(section(GARNI)).poses;
    assert.ok(bloc !== undefined);
    const origines = lecons(bloc).map((lecon) => lecon.dessous("span").find(({ className }) => className === "origine")?.textContent);
    assert.deepEqual(origines, ["origin: retro", "origin: pass send-back on #12", "origin: chef correction on #18"]);
  });

  test("une leçon sans origine enregistrée se lit et se montre comme une rétro ; une origine inconnue refuse la forme", () => {
    const { origine: _origine, ...sans } = GARNI.lecons[0]!;
    const lue = apprentissageLu({ lecons: [sans], profils: [] });
    assert.deepEqual(lue.lecons[0]?.origine, { kind: "retro" });
    const [bloc] = poser(apprentissageDe(lue)).poses;
    assert.ok(bloc !== undefined);
    assert.equal(lecons(bloc)[0]?.dessous("span").find(({ className }) => className === "origine")?.textContent, "origin: retro");
    for (const mauvaise of [{ kind: "oracle" }, { kind: "pass-send-back" }, { kind: "chef-correction", ticket: 0 }, "retro"]) {
      assert.throws(() => apprentissageLu({ lecons: [{ ...sans, origine: mauvaise }], profils: [] }), /origine/);
    }
  });

  test("un ticket d'une leçon ou d'un profil ouvre sa fiche, et se pose en monospace", () => {
    const { poses, ouverts } = poser(section(GARNI));
    const [bloc] = poses;
    const tickets = bloc?.dessous("button").filter(({ textContent }) => /^#\d+$/.test(textContent)) ?? [];
    assert.deepEqual(tickets.map(({ textContent }) => textContent), ["#29", "#33", "#12", "#15", "#18", "#29", "#36"]);
    for (const bouton of tickets) assert.equal(bouton.className, "mono");
    tickets[6]?.click();
    assert.deepEqual(ouverts, [36]);
  });

  test("une promue a son lien vers sa ligne du carnet, une provisoire aucun ; sans adresse, le lien ne s'ouvre pas et le dit au survol", () => {
    const { poses, lignes } = poser(section(GARNI));
    const [bloc] = poses;
    assert.ok(bloc !== undefined);
    const [provisoire, promue, sansAdresse] = lecons(bloc);
    assert.deepEqual(provisoire && liens(provisoire), []);
    const [lien] = promue ? liens(promue) : [];
    assert.equal(lien?.textContent, LIEN);
    assert.equal(lien?.disabled, false);
    assert.match(lien?.title ?? "", /no branch, no PR is created/);
    lien?.click();
    assert.deepEqual(lignes, ["L-001"]);
    const [mort] = sansAdresse ? liens(sansAdresse) : [];
    assert.equal(mort?.disabled, true);
    assert.match(mort?.title ?? "", /gave no GitHub address/);
    mort?.click();
    assert.deepEqual(lignes, ["L-001"]);
  });

  test("chaque profil dit son domaine, son carnet et les tickets qu'il a cuisinés", () => {
    const [bloc] = poser(section(GARNI)).poses;
    assert.ok(bloc !== undefined);
    const [vue, correctif] = profils(bloc);
    assert.ok(vue !== undefined && correctif !== undefined);
    assert.match(vue.textContent, /^app-src-vuefor app\/src\/vue/);
    assert.match(vue.textContent, /notebook, 2 lessonsL-001keep the view thinL-002every gesture is a buttonretired/);
    assert.equal(vue.dessous("li").find(({ textContent }) => textContent.startsWith("L-002"))?.className, "sortie");
    assert.match(vue.textContent, /cooked#29#36/);
    // Skills et périmètre se disent comme sur la carte d'un profil proposé.
    assert.match(vue.textContent, /skillsagents\/cook-design\.mdperimeterapp\/src\/vuenotebook/);
    assert.match(correctif.textContent, /skillsnoneperimeterruntime\/src\/correctifnotebook/);
    assert.match(correctif.textContent, /notebookempty/);
    assert.match(correctif.textContent, /cookednone yet/);
  });

  test("des leçons sans profil : la partie des profils le dit en une ligne", () => {
    const [bloc] = poser(section({ ...GARNI, profils: [] })).poses;
    assert.ok(bloc !== undefined);
    assert.equal(profils(bloc).length, 0);
    assert.match(bloc.textContent, new RegExp(AUCUN_PROFIL));
    assert.equal(lecons(bloc).length, 3);
  });

  test("chaque leçon et chaque profil dit la part livrée du premier coup et les essais moyens, avant puis après son entrée", () => {
    const [bloc] = poser(section(GARNI)).poses;
    assert.ok(bloc !== undefined);
    const [provisoire] = lecons(bloc);
    assert.match(provisoire?.textContent ?? "", /delivered on the first trybefore60% \(6 of 10\)after75% \(3 of 4\)/);
    assert.match(provisoire?.textContent ?? "", /attempts per ticketbefore1\.5 on averageafter1\.3 on average/);
    const [vue] = profils(bloc);
    assert.match(vue?.textContent ?? "", /delivered on the first trybefore60% \(6 of 10\)after75% \(3 of 4\)/);
    assert.equal(bloc.dessous("div").filter(({ className }) => className === "progres").length, 5);
  });

  test("un côté sans ticket est dit en mots, jamais 0 ni NaN", () => {
    const [bloc] = poser(section({ lecons: [{ ...GARNI.lecons[0]!, progres: SANS_APRES }], profils: [GARNI.profils[1]!] })).poses;
    assert.ok(bloc !== undefined);
    const [lecon] = lecons(bloc);
    assert.match(lecon?.textContent ?? "", new RegExp(`before60% \\(6 of 10\\)after${PAS_ASSEZ}`));
    assert.match(lecon?.textContent ?? "", new RegExp(`before1\\.5 on averageafter${PAS_ASSEZ}`));
    const [profil] = profils(bloc);
    assert.match(profil?.textContent ?? "", new RegExp(`first trybefore${PAS_ASSEZ}after${PAS_ASSEZ}`));
    assert.doesNotMatch(bloc.textContent, /NaN|undefined|before0|after0/);
    const absents = bloc.dessous("span").filter(({ className }) => className === "cote absent");
    assert.equal(absents.length, 2 + 4);
  });

  test("un runtime d'avant `progres` ne casse pas la page : rien n'est mesuré", () => {
    const { progres: _p, ...sans } = GARNI.lecons[0]!;
    const lu = section({ lecons: [sans as never], profils: [] });
    assert.deepEqual(lu.lecons[0]?.progres, { avant: null, apres: null });
  });

  test("un chiffre qui n'a pas sa forme refuse les faits", () => {
    const [provisoire] = GARNI.lecons;
    const mauvais = { ...provisoire, progres: { avant: { ...PROGRES.avant, premierCoup: null }, apres: null } };
    assert.deepEqual(lus({ ...GARNI, lecons: [mauvais] }), { informe: "apprentissage.lecons[0].progres.avant.premierCoup: expected a non-negative number" });
  });

  test("ni leçon ni profil : une phrase seule — ni titre, ni liste (#1456)", () => {
    const [bloc, ...reste] = poser(section({ lecons: [], profils: [] })).poses;
    assert.deepEqual(reste, []);
    assert.ok(bloc !== undefined);
    assert.equal(bloc.balise, "p");
    assert.equal(bloc.textContent, RIEN_APPRIS);
    assert.deepEqual(bloc.children, []);
  });

  test("la ligne du bloc replié : combien de leçons, combien de profils (#1456)", () => {
    assert.equal(resumeDeLApprentissage(section(GARNI)), "3 lessons, 2 profiles");
    assert.equal(resumeDeLApprentissage(section({ lecons: [GARNI.lecons[0]!], profils: [] })), "1 lesson, 0 profiles");
  });
});

describe("l'onglet Cooks, dans l'espace du projet", () => {
  async function ouvrir() {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
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
      ouvrirLecon: () => true,
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    await ouvrirOnglet(vue, "Cooks");
    return vue;
  }
  const faitsLus = (vue: Awaited<ReturnType<typeof ouvrir>>, apprentissage?: ApprentissageDuRuntime): Dessinable => {
    const faits = comprendre(JSON.stringify(apprentissage === undefined ? FAITS : { ...FAITS, apprentissage })) as Faits;
    return { projet: "parade", demande: vue.dernier("faits")[0] as number, a: A, tableau: tableau(faits) };
  };

  test("les faits lus portent des leçons et des profils : l'onglet les pose sous le plafond, et le lien d'une promue ouvre sa ligne sans rien créer", async () => {
    const vue = await ouvrir();
    const page = vue.element("rail");
    assert.equal(page.hidden, false);
    // Les faits pas encore lus : la page ne dit rien de ce qu'elle ne sait pas.
    assert.doesNotMatch(page.textContent, new RegExp(TITRE));
    vue.dire("surFaits", faitsLus(vue, GARNI));
    await repos();
    assert.match(page.textContent, new RegExp(TITRE));
    // Replié derrière une ligne, fermé (#1456) : son titre et ses nombres ; la liste est dessous.
    const replie = page.dessous("details").find(({ textContent }) => textContent.startsWith(TITRE)) ?? assert.fail("pas de bloc replié");
    assert.equal((replie as Faux & { open?: boolean }).open, false);
    assert.equal(replie.dessous("summary")[0]?.textContent, `${TITRE}3 lessons, 2 profiles`);
    assert.match(page.textContent, /provisionalL4run the app tests/);
    assert.match(page.textContent, /app-src-vuefor app\/src\/vue/);
    const avant = vue.appels.length;
    (page.dessous("button").find(({ className, disabled }) => className === "lien" && !disabled) ?? assert.fail("pas de lien")).click();
    await repos();
    // Un seul geste est parti : ouvrir la ligne de L-001 — aucune commande, aucune écriture dans un terminal.
    assert.deepEqual(
      vue.appels.slice(avant).map(({ geste, args }) => [geste, ...args]),
      [["ouvrirLecon", "parade", "L-001"]],
    );
    // Un ticket ouvre sa fiche, par-dessus la page.
    (page.dessous("button").find(({ textContent }) => textContent === "#36") ?? assert.fail("pas de #36")).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
  });

  test("ils ne sont plus sur Reliability, ni sur Rail : une seule place, Cooks", async () => {
    const vue = await ouvrir();
    vue.dire("surFaits", faitsLus(vue, GARNI));
    await repos();
    assert.match(vue.element("rail").textContent, new RegExp(TITRE));
    await ouvrirOnglet(vue, "Rail");
    assert.doesNotMatch(vue.element("rail").textContent, new RegExp(TITRE));
    await ouvrirLecture(vue, "Reliability");
    assert.doesNotMatch(vue.element("fiabilite").textContent, new RegExp(TITRE));
    assert.deepEqual(vue.element("fiabilite").dessous("div").filter(({ className }) => className === "apprentissage-fiabilite"), []);
  });

  test("un projet sans leçon ni profil : la section dit une phrase, à la place d'une liste vide", async () => {
    const vue = await ouvrir();
    vue.dire("surFaits", faitsLus(vue));
    await repos();
    const page = vue.element("rail");
    // Une phrase seule, rien à ouvrir (#1456).
    const bloc = page.dessous("p").find(({ className }) => className === "rien-appris");
    assert.ok(bloc !== undefined);
    assert.equal(bloc.textContent, RIEN_APPRIS);
    assert.equal(vue.element("appris-du-projet").dessous("details").length, 0);
    assert.deepEqual(vue.element("appris-du-projet").dessous("li"), []);
  });
});
