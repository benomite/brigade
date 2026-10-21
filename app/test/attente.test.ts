// WAITING sur le rail (#591) : deux colonnes, TODO — ce que le chef peut trancher maintenant — et
// WAITING — ce qui attend un tiers. Sur une carte de TODO, « waiting for… » ouvre un formulaire :
// ce qu'elle attend, de qui, la relance proposée à sept jours ; validé, la commande `waiting set` du
// runtime part dans le second. Une carte de WAITING dit sans clic ce qu'elle attend, de qui, depuis
// quand, sa relance et ce qui se passera à l'arrivée, et porte « resume » et « it arrived, back to
// the kitchen ». Une carte revenue de WAITING le dit — pas pourquoi : le runtime ne le rend pas
// dans `faits`. Ce qui part se compare à la commande
// du runtime (runtime/src/attente-cli.ts), passée par les deux shells qu'elle traverse ; la vue est
// jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { commandeDAttente, ecrireAttente, GESTES_D_ATTENTE, relanceProposee } from "../src/attente.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, rail, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const RACINE = join(import.meta.dirname, "../..");
const PARADE: Projet = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
// Le jour du poste, fixé : la relance se borne d'après lui.
const AUJOURDHUI = new Date(2026, 9, 15, 14, 30);

// Ce que le shell lit d'une ligne : ses mots, un par un — joué par un vrai `sh`, qui n'exécute rien d'autre que `printf`.
const mots = (ligne: string): string[] => execFileSync("sh", ["-c", `printf '%s\\0' ${ligne}`], { encoding: "utf8" }).split("\0").slice(0, -1);
// Ce que la box reçoit d'une commande de poste : le shell du Mac la découpe pour `ssh`, qui joint ce
// qui suit l'hôte par des espaces ; le shell de la box le découpe à son tour (docs/runtime/, « Piloter »).
function recuParLaBox(commande: string): string[] {
  const [ssh, hote, ...suite] = mots(commande);
  assert.deepEqual([ssh, hote], ["ssh", "box"]);
  return mots(suite.join(" "));
}

function ecrite(id: string, ticket: unknown, saisie?: unknown, projet: Projet = PARADE): string {
  const ecrit = commandeDAttente(id, projet, ticket, saisie, AUJOURDHUI);
  assert.ok(ecrit !== undefined && "commande" in ecrit, `rien n'est écrit par « ${id} » : ${JSON.stringify(ecrit)}`);
  return ecrit.commande;
}
const refus = (id: string, ticket: unknown, saisie?: unknown) => {
  const ecrit = commandeDAttente(id, PARADE, ticket, saisie, AUJOURDHUI);
  assert.ok(ecrit !== undefined && "refus" in ecrit, `« ${id} » écrit quelque chose : ${JSON.stringify(ecrit)}`);
  return ecrit.refus;
};

describe("les trois gestes de WAITING écrivent la commande `waiting` du runtime", () => {
  test("la relance proposée est dans sept jours, au calendrier du poste — fin de mois et d'année comprises", () => {
    assert.equal(relanceProposee(AUJOURDHUI), "2026-10-22");
    assert.equal(relanceProposee(new Date(2026, 9, 28, 23, 59)), "2026-11-04");
    assert.equal(relanceProposee(new Date(2026, 11, 30, 0, 1)), "2027-01-06");
  });

  test("ce sont les gestes que la commande accepte, et ses options : rien d'autre ne s'écrit", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal(scripts.waiting, "node src/attente-cli.ts");
    const cli = readFileSync(join(RACINE, "runtime/src/attente-cli.ts"), "utf8");
    assert.ok(cli.includes('const OPTIONS = ["--what", "--from", "--remind"];'), "la commande du runtime ne prend plus ces options");
    assert.ok(cli.includes('!["set", "resume", "arrived"].includes(geste)'), "la commande du runtime ne prend plus ces gestes");
    assert.deepEqual(
      GESTES_D_ATTENTE.map(({ id, commande }) => [id, commande]),
      [
        ["attente-poser", "waiting set"],
        ["attente-reprendre", "waiting resume"],
        ["attente-arrivee", "waiting arrived"],
      ],
    );
  });

  test("« resume » et « it arrived » écrivent la commande de poste, au caractère près, pour le ticket nommé", () => {
    assert.equal(ecrite("attente-reprendre", 8), "ssh box brigade parade waiting resume 8");
    assert.equal(ecrite("attente-arrivee", 8), "ssh box brigade parade waiting arrived 8");
  });

  test("« waiting for… » écrit ce que le chef a rempli : la box reçoit chaque champ entier, en un argument, sans rien en exécuter", () => {
    const saisie = { quoi: "  sa validation écrite du devis  ", qui: "le client", relance: "2026-10-22" };
    assert.deepEqual(recuParLaBox(ecrite("attente-poser", 8, saisie)), ["brigade", "parade", "waiting", "set", "8", "--what", "sa validation écrite du devis", "--from", "le client", "--remind", "2026-10-22"]);

    // Ce qu'un shell lirait autrement : des apostrophes, des guillemets, `$(…)`, `;`, des étoiles, un tiret en tête.
    for (const texte of ["l'accord d'Anne", `"le" devis`, "$(reboot)", "`id`; sudo reboot", "* et ?", "--remind demain", "a\\b & c | d > e"]) {
      assert.deepEqual(recuParLaBox(ecrite("attente-poser", 12, { quoi: texte, qui: texte, relance: "2026-11-01" })).slice(5), ["--what", texte, "--from", texte, "--remind", "2026-11-01"], texte);
    }
  });

  test("rien n'est écrit sans ce que la commande demande : quoi, de qui, une relance à venir, un ticket", () => {
    const plein = { quoi: "sa réponse", qui: "le client", relance: "2026-10-22" };
    assert.match(refus("attente-poser", 8, { ...plein, quoi: "   " }), /say what it waits for/);
    assert.match(refus("attente-poser", 8, { ...plein, qui: "" }), /say whom it waits for/);
    assert.match(refus("attente-poser", 8, { quoi: "sa réponse" }), /say whom it waits for/);
    for (const relance of ["", "22/10/2026", "2026-02-30", "2026-10-22T09:00", "7j"]) assert.match(refus("attente-poser", 8, { ...plein, relance }), /is not a day of the calendar/, relance);
    for (const relance of ["2026-10-15", "2026-10-01"]) assert.match(refus("attente-poser", 8, { ...plein, relance }), /is not after today/, relance);
    assert.match(refus("attente-poser", 8, { ...plein, quoi: "une ligne\npuis une autre" }), /control character/);
    for (const ticket of [0, -3, 1.5, "8", null, undefined]) assert.match(refus("attente-reprendre", ticket), /names no ticket/, String(ticket));
    // Un geste inconnu, ou un projet sans box : rien à écrire.
    assert.equal(commandeDAttente("waiting set 8", PARADE, 8), undefined);
    assert.equal(commandeDAttente("attente-reprendre", { nom: "seul", dossier: "/tmp" }, 8), undefined);
  });

  test("le geste part dans le second, préfixé du `!` qui le lance — ou dit pourquoi rien n'est parti", async () => {
    const envoyes: string[] = [];
    const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second", note: "", arrete: false };
    const terminaux = { envoyer: (_: Projet, commande: string) => (envoyes.push(commande), Promise.resolve(SECOND)) };

    assert.deepEqual(await ecrireAttente(terminaux, "attente-arrivee", PARADE, 8), SECOND);
    assert.deepEqual(envoyes, ["!ssh box brigade parade waiting arrived 8"]);
    assert.deepEqual(ecrireAttente(terminaux, "attente-poser", PARADE, 8, { quoi: "", qui: "x", relance: "2026-10-22" }, AUJOURDHUI), { refus: "nothing is written: say what it waits for, in your words" });
    assert.match((ecrireAttente(terminaux, "attente-reprendre", { ...PARADE, refus: "illisible" }, 8) as { refus: string }).refus, /does not open — illisible/);
    assert.equal(envoyes.length, 1);
  });
});

// Ce que la box rend : un ticket sur le rail de chaque sorte qui compte ici.
const ticket = (numero: number, etat: string, plus: Partial<Faits["rail"][number]> = {}): Faits["rail"][number] => ({ ticket: numero, etat, titre: `Ticket ${numero}`, url: `https://github.com/benomite/brigade/issues/${numero}`, activite: null, ...plus });
const TIERS = { quoi: "sa validation écrite du devis", qui: "le client", depuis: "2026-10-12T10:04:20.000Z", relance: "2026-10-21T00:00:00.000Z", aLArrivee: "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour" };
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-15T10:04:20.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    ticket(21, "en attente"),
    ticket(8, "WAITING", { attente: { raison: "attend : un tiers (WAITING)", colonne: "WAITING", retour: null }, tiers: TIERS }),
    ticket(12, "en pass"),
    ticket(30, "86", { attente: { raison: "attend : le chef — revenu de WAITING", colonne: "86", retour: null }, tiers: null }),
    ticket(31, "86", { attente: { raison: "attend : le chef — revenu de WAITING", colonne: "86", retour: null }, tiers: null }),
  ],
  attend: [
    { ticket: 30, titre: "Ticket 30", url: "https://github.com/benomite/brigade/issues/30" },
    { ticket: 31, titre: "Ticket 31", url: "https://github.com/benomite/brigade/issues/31" },
    { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" },
  ],
  livres: [],
};
const rangs = (faits: Faits) => rail(faits).colonnes.map(({ nom, compte, cartes }) => [nom, compte, cartes.map(({ ticket: numero }) => numero)]);

describe("le rail en TODO et WAITING", () => {
  test("TODO ne prend que ce que le chef peut trancher ; WAITING, ce qui attend un tiers — juste après, et nulle part ailleurs", () => {
    assert.deepEqual(rangs(FAITS), [
      ["On the rail", "1", [21]],
      ["Taken", "0", []],
      ["Pass", "0", []],
      ["TODO", "3", [30, 31, 12]],
      ["WAITING", "1", [8]],
      ["Served", "0", []],
    ]);
    // Même nommé par la file, un ticket qui attend un tiers n'est pas dans TODO.
    const nomme = { ...FAITS, attend: [...(FAITS.attend ?? []), { ticket: 8, titre: "Ticket 8", url: null }] };
    assert.deepEqual(rangs(nomme)[3], ["TODO", "3", [30, 31, 12]]);
    assert.deepEqual(rangs(nomme)[4], ["WAITING", "1", [8]]);
    // Aucun : la colonne le dit.
    assert.equal(rail({ ...FAITS, rail: [] }).colonnes[4]?.vide, "no ticket waits for a third party");
  });

  test("une carte de WAITING dit, sans clic, ce qu'elle attend dans les mots du chef, de qui, depuis quand, sa relance, et ce qui se passera à l'arrivée — puis ses deux gestes", () => {
    const carte = rail(FAITS).colonnes[4]?.cartes[0];
    assert.deepEqual(carte?.dit, [
      { libelle: "waiting for", valeur: "sa validation écrite du devis" },
      { libelle: "from", valeur: "le client" },
      { libelle: "since", valeur: "2026-10-12 10:04 UTC — 3 d before the reading" },
      { libelle: "follow-up", valeur: "2026-10-21 00:00 UTC — in 5 d from the reading" },
      { libelle: "on arrival", valeur: TIERS.aLArrivee },
    ]);
    assert.deepEqual([carte?.etat, carte?.ton, carte?.titre, carte?.ouvrable, carte?.attendu, carte?.sans], ["WAITING", "gris", "Ticket 8", true, false, undefined]);
    assert.deepEqual(carte?.gestes, ["attente-reprendre", "attente-arrivee"]);
    // Une relance passée le dit aussi.
    const passee = rail({ ...FAITS, lu: "2026-10-23T00:00:00.000Z" }).colonnes[4]?.cartes[0]?.dit.find(({ libelle }) => libelle === "follow-up");
    assert.equal(passee?.valeur, "2026-10-21 00:00 UTC — passed 2 d before the reading");
    // Une box qui dit WAITING sans dire ce qu'il attend : la carte l'écrit, et garde ses gestes.
    const muette = rail({ ...FAITS, rail: [ticket(8, "WAITING")] }).colonnes[4]?.cartes[0];
    assert.deepEqual([muette?.dit, muette?.gestes], [[], ["attente-reprendre", "attente-arrivee"]]);
    assert.match(muette?.sans ?? "", /^not given — this station's runtime does not give in `facts` what it waits for/);
  });

  test("« waiting for… » est sur une carte de TODO que le runtime laisse attendre — pas sur un ticket en pass, ni hors du rail, ni hors de TODO", () => {
    const todo = rail({ ...FAITS, attend: [...(FAITS.attend ?? []), { ticket: 99, titre: "", url: null }] }).colonnes[3]?.cartes ?? [];
    assert.deepEqual(
      todo.map(({ ticket: numero, gestes }) => [numero, gestes]),
      [
        [30, ["attente-poser"]],
        [31, ["attente-poser"]],
        [12, undefined],
        [99, undefined],
      ],
    );
    assert.equal(rail(FAITS).colonnes[0]?.cartes[0]?.gestes, undefined);
  });

  // Le motif du retour vient de `faits.rail[].revenu`, mot pour mot : l'app n'en déduit rien.
  test("une carte revenue de WAITING dit le motif que le runtime en donne — et rien de plus sans lui", () => {
    const MOTIF = "relance du 21/10 : pas de réponse";
    const avec = { ...FAITS, rail: FAITS.rail.map((lu) => (lu.ticket === 30 ? { ...lu, revenu: MOTIF } : lu)) };
    const [relance] = rail(avec).colonnes[3]?.cartes ?? [];
    assert.deepEqual(relance?.dit, [
      { libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" },
      { libelle: "came back", valeur: MOTIF },
    ]);
    // Sans motif (repris par le chef, ou runtime d'avant) : la carte n'en dit pas plus.
    const [sans] = rail(FAITS).colonnes[3]?.cartes ?? [];
    assert.deepEqual(sans?.dit, [{ libelle: "set aside", valeur: "attend : le chef — revenu de WAITING" }]);
    assert.deepEqual(rail({ ...FAITS, rail: FAITS.rail.map((lu) => (lu.ticket === 30 ? { ...lu, revenu: null } : lu)) }).colonnes[3]?.cartes[0]?.dit, sans?.dit);
    // Le champ se lit dans la forme ; mal formé, il la refuse.
    const lu = comprendre(JSON.stringify({ ...FAITS, rail: [{ ...ticket(30, "86"), revenu: MOTIF }] }));
    assert.ok(!("informe" in lu) && lu.rail[0]?.revenu === MOTIF);
    assert.deepEqual(comprendre(JSON.stringify({ ...FAITS, rail: [{ ...ticket(30, "86"), revenu: 3 }] })), { informe: "“rail[0].revenu” is not a string" });
  });

  test("`tiers` se lit dans la forme : absent d'un runtime d'avant lui, nul pour un autre ticket — et une attente mal formée refuse la forme", () => {
    const sortie = (rail: unknown[]) => JSON.stringify({ ...FAITS, rail });
    const lu = comprendre(sortie(FAITS.rail));
    assert.ok(!("informe" in lu));
    assert.deepEqual(lu.rail, FAITS.rail);
    const ancien = comprendre(sortie([{ ticket: 21, etat: "en attente", titre: "Ticket 21", url: "https://x/21" }]));
    assert.ok(!("informe" in ancien) && !("tiers" in (ancien.rail[0] ?? {})));
    assert.deepEqual(comprendre(sortie([{ ...ticket(8, "WAITING"), tiers: { ...TIERS, relance: "demain" } }])), { informe: "“rail[0].tiers.relance” is not a time" });
    assert.deepEqual(comprendre(sortie([{ ...ticket(8, "WAITING"), tiers: { ...TIERS, qui: 3 } }])), { informe: "“rail[0].tiers.qui” is not a string" });
  });
});

const A = "2026-10-15T10:04:20.000Z";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const STATUS = "projet     parade\n\nattend     2 décisions\n  #30  depuis 3 min  revenu de WAITING\n  #31  depuis 1 min  revenu de WAITING\nfin attend\n";
function dessinable(faits: Faits = FAITS): Dessinable {
  const tenus = tenirFaits();
  tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  return tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}
const recevoir = (vue: Jouee, recue: Dessinable = dessinable()) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
const colonne = (vue: Jouee, nom: string): Faux => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === nom) ?? assert.fail(`pas de colonne ${nom}`);
const bonDe = (vue: Jouee, numero: number): Faux =>
  vue
    .element("rail")
    .dessous("li")
    .find((bon) => bon.className === "bon" && bon.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
const boutonDe = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const champ = (ou: Faux, nom: string): Faux => ou.dessous("input").find((pose) => pose.dataset.champ === nom) ?? assert.fail(`pas de champ ${nom}`);
const taper = (entree: Faux, texte: string) => {
  entree.value = texte;
  entree.declencher("input");
};

describe("sur l'écran, les cartes de WAITING et leurs gestes", () => {
  test("les colonnes TODO et WAITING sont côte à côte, et la carte de WAITING se lit sans clic", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const noms = vue
      .element("rail")
      .dessous("section")
      .map((pose) => pose.children[0]?.children[0]?.textContent);
    // Le kanban est entier sur Rail, Taken et Pass compris.
    assert.deepEqual(noms, ["On the rail", "Taken", "Pass", "TODO", "WAITING", "Served"]);
    const bon = bonDe(vue, 8);
    assert.ok(colonne(vue, "WAITING").contains(bon));
    assert.ok(!colonne(vue, "TODO").contains(bon));
    // La carte dit l'essentiel en une ligne ; le détail est dans sa fiche.
    assert.equal(bon.dessous("p").find((pose) => pose.className === "ligne-carte")?.textContent, "waiting for sa validation écrite du devis · from le client");
    assert.equal(bon.dessous("li").length, 0);
    bon.click();
    const lu = fiche(vue).dessous("li").map((fait) => fait.children.map((pose) => pose.textContent));
    assert.deepEqual(lu, [
      ["waiting for", "sa validation écrite du devis"],
      ["from", "le client"],
      ["since", "2026-10-12 10:04 UTC — 3 d before the reading"],
      ["follow-up", "2026-10-21 00:00 UTC — in 5 d from the reading"],
      ["on arrival", TIERS.aLArrivee],
    ]);
  });

  test("« resume » et « it arrived, back to the kitchen » partent au clic, pour ce ticket", async () => {
    const vue = await ouvrir({ attente: () => SECOND });
    recevoir(vue);
    boutonDe(bonDe(vue, 8), "resume").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-reprendre", 8, undefined]);
    boutonDe(bonDe(vue, 8), "it arrived, back to the kitchen").click();
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-arrivee", 8, undefined]);
    // Le clic d'un geste n'ouvre pas la fiche par-dessus le rail.
    assert.equal(fiche(vue).hidden, true);
    // Une carte de TODO n'a pas ces deux-là ; une carte de WAITING n'a pas « waiting for… ».
    assert.ok(!bonDe(vue, 30).dessous("button").some(({ textContent }) => textContent === "resume"));
    assert.ok(!bonDe(vue, 8).dessous("button").some(({ textContent }) => textContent === "waiting for…"));
  });

  test("« waiting for… » ouvre sur la carte un formulaire — quoi, de qui, la relance proposée à sept jours —, qui survit à une lecture ; validé, la commande part, et il se referme", async () => {
    const vue = await ouvrir({ attente: () => SECOND });
    recevoir(vue);
    assert.equal(bonDe(vue, 12).dessous("button").filter(({ dataset }) => "attente" in dataset).length, 0, "un ticket en pass ne se met pas en attente");
    boutonDe(bonDe(vue, 30), "waiting for…").click();
    await repos();

    const formulaire = () => bonDe(vue, 30).dessous("form")[0] ?? assert.fail("pas de formulaire");
    const avant = relanceProposee(new Date());
    assert.deepEqual(
      formulaire()
        .dessous("label")
        .map((etiquette) => etiquette.children[0]?.textContent),
      ["what it waits for, in your words", "from whom", "follow-up on"],
    );
    assert.deepEqual([champ(formulaire(), "quoi").value, champ(formulaire(), "qui").value], ["", ""]);
    assert.equal(champ(formulaire(), "relance").type, "date");
    assert.ok([avant, relanceProposee(new Date())].includes(champ(formulaire(), "relance").value), champ(formulaire(), "relance").value);
    assert.equal(fiche(vue).hidden, true);

    taper(champ(formulaire(), "quoi"), "sa réponse écrite");
    taper(champ(formulaire(), "qui"), "le client");
    taper(champ(formulaire(), "relance"), "2026-11-02");
    // Une lecture redessine le rail : le formulaire revient tel que le chef l'a laissé.
    recevoir(vue);
    assert.deepEqual(
      ["quoi", "qui", "relance"].map((nom) => champ(formulaire(), nom).value),
      ["sa réponse écrite", "le client", "2026-11-02"],
    );

    formulaire().declencher("submit");
    await repos();
    assert.deepEqual(vue.dernier("attente"), ["parade", "attente-poser", 30, { quoi: "sa réponse écrite", qui: "le client", relance: "2026-11-02" }]);
    assert.equal(bonDe(vue, 30).dessous("form").length, 0);
    assert.ok(bonDe(vue, 30).dessous("button").some(({ textContent }) => textContent === "waiting for…"));
  });

  test("refusé, le formulaire reste, et dit pourquoi ; « cancel » le referme sans rien envoyer ; et le ticket passé dans WAITING le referme", async () => {
    let reponse: Terminal | { refus: string } = { refus: "nothing is written: say whom it waits for — the client, a team, a person" };
    const vue = await ouvrir({ attente: () => reponse });
    recevoir(vue);
    boutonDe(bonDe(vue, 31), "waiting for…").click();
    await repos();
    const formulaire = () => bonDe(vue, 31).dessous("form")[0] ?? assert.fail("pas de formulaire");
    taper(champ(formulaire(), "quoi"), "sa réponse");
    formulaire().declencher("submit");
    await repos();
    assert.equal(formulaire().dessous("p").find((pose) => pose.className === "refus")?.textContent, "nothing is written: say whom it waits for — the client, a team, a person");
    assert.equal(champ(formulaire(), "quoi").value, "sa réponse");

    const appels = vue.appels.filter(({ geste }) => geste === "attente").length;
    boutonDe(formulaire(), "cancel").click();
    await repos();
    assert.equal(bonDe(vue, 31).dessous("form").length, 0);
    assert.equal(vue.appels.filter(({ geste }) => geste === "attente").length, appels);

    // Rouvert, puis le ticket passe dans WAITING à la lecture suivante : le formulaire n'a plus de carte, il se referme.
    reponse = SECOND;
    boutonDe(bonDe(vue, 31), "waiting for…").click();
    await repos();
    recevoir(vue, dessinable({ ...FAITS, rail: FAITS.rail.map((pose) => (pose.ticket === 31 ? { ...pose, etat: "WAITING", tiers: TIERS } : pose)) }));
    assert.ok(colonne(vue, "WAITING").contains(bonDe(vue, 31)));
    assert.equal(bonDe(vue, 31).dessous("form").length, 0);
    recevoir(vue);
    assert.equal(bonDe(vue, 31).dessous("form").length, 0, "le formulaire refermé ne revient pas");
  });

});

const fiche = (vue: Jouee) => vue.element("fiche");
