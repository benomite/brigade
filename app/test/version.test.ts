// La version du runtime et sa mise en service, à côté de la file : une version
// en attente, rien en attente, les cooks en vol, un échec. Ce que la box en dit
// vient de `faits` ; l'échec du dernier geste, de l'entrée `version` du bloc
// `attend` — écrite ici par le runtime lui-même, une issue de chaque sorte :
// si sa forme change, c'est ce test qui rougit. La vue est jouée devant un faux
// document : la carte de version ne porte aucun geste ; « mettre en service » est sur la ligne
// de la bande qui dit que la version attend, et n'ouvre que sa confirmation — c'est l'un de ses
// deux « oui » qui fait partir le geste.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireAttentes, type Attente } from "../../runtime/src/attend.ts";
import { direIssue } from "../../runtime/src/dire-mise-en-service.ts";
import { ETATS_DE_MISE_EN_SERVICE, ETATS_DE_VERSION } from "../../runtime/src/etat.ts";
import type { GesteRendu } from "../../runtime/src/projections/mise-en-service.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { alertes } from "../src/alertes.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tableau, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GESTES, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { ANNULER, AVERTISSEMENT, COUPER, DEMANDER, echecDe, entreeDeVersion, voir, type MiseEnService, type Version, type Vu } from "../src/version.ts";
import { type Faux, jouerLaVue, type Jouee, type Reponses, repos } from "./aides/fausse-vue.ts";

const RACINE = join(import.meta.dirname, "../..");
const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");

const LU = "2026-10-12T10:04:11.000Z";
const SERVIE = "3b0177804de604efe58ddf269aaae76365b0fbff";
const TETE = "eec91320ee328010308c1a56812855450c758366";
const EN_ATTENTE: Version = { etat: "en attente", depuis: "2026-10-12T08:21:07.000Z", branche: "origin/v2", enService: SERVIE, enAttente: TETE, livraisons: 26, raison: null };
const A_JOUR: Version = { etat: "à jour", depuis: "2026-10-12T08:21:07.000Z", branche: "origin/v2", enService: SERVIE, enAttente: null, livraisons: null, raison: null };
const NON_COMPAREE: Version = { etat: "non comparée", depuis: "2026-10-12T09:54:11.000Z", branche: "origin/v2", enService: SERVIE, enAttente: null, livraisons: null, raison: "l'origine ne répond pas" };
const CALME: MiseEnService = { etat: "aucune", depuis: null, coupe: false, enVol: [], tokens: 0 };
// Trois cooks en vol : deux tickets — l'un sans relevé encore, hors du rail — et un jugement du manager.
const EN_VOL: MiseEnService["enVol"] = [
  { ticket: 14, run: "14-3f9a01bc", station: "box/claude", tokens: 230000 },
  { ticket: 30, run: "30-77aa01bc", station: null, tokens: null },
  { ticket: null, run: "manager-5c1d", station: "box/claude", tokens: 220775 },
];
const EN_COURS: MiseEnService = { ...CALME, enVol: EN_VOL, tokens: 450775 };
const RAIL = [{ ticket: 14, titre: "Le journal en ajout seul" }];

const nombre = (valeur: number) => valeur.toLocaleString("en-US");
// Une durée, comptée jusqu'à l'heure de la lecture : le test n'en vérifie que l'instant reçu.
const depuis = (instant: string) => `<${instant}>`;
const vue = (version: Version | null | undefined, miseEnService: MiseEnService | undefined, bloc?: string): Vu =>
  voir({ ...(version === undefined ? {} : { version }), ...(miseEnService === undefined ? {} : { miseEnService }), rail: RAIL.map((ticket) => ({ ...ticket, etat: "pris", url: "" })) }, bloc === undefined ? undefined : { bloc, a: LU }, depuis);

const ATTENDRE = { id: DEMANDER, libelle: "wait for a quiet rail", dit: "no cook is interrupted: those in flight finish, no other goes, and the runtime launches the box action as soon as none is in flight" };
const RENONCER = { id: ANNULER, libelle: "withdraw the request", dit: "nothing was launched, no cook is interrupted, and the kitchen takes its tickets again" };
const couper = (dit: string) => ({ id: COUPER, libelle: "cut without waiting", dit });
const COUPER_TROIS = couper(`the box action goes without waiting: 3 cooks in flight interrupted by the restart, ${nombre(450775)} tokens already spent`);
const FAITS_EN_ATTENTE = [
  { libelle: "awaiting", valeur: "origin/v2 (eec91320ee32)", exact: true },
  { libelle: "in service", valeur: "3b0177804de6", exact: true },
  { libelle: "behind for", valeur: "<2026-10-12T08:21:07.000Z>" },
  { libelle: "deliveries not in service", valeur: "26" },
];
const TROIS_EN_VOL = {
  titre: `3 cooks in flight — ${nombre(450775)} tokens already spent in all, 1 not yet measured`,
  cooks: [
    { ticket: "#14", titre: "Le journal en ajout seul", station: "box/claude", tokens: `${nombre(230000)} tokens already spent` },
    { ticket: "#30", titre: "", station: "unknown station", tokens: "tokens: not measured yet" },
    { titre: "a manager judgement", station: "box/claude", tokens: `${nombre(220775)} tokens already spent` },
  ],
};

describe("une version attend : elle se lit à côté de la file, avec le geste qui la met en service", () => {
  test("ce que la box en dit — la branche et son commit, celui qui est en service, depuis quand, combien de livraisons ne le sont pas — et le geste, avec ses deux choix", () => {
    assert.deepEqual(vue(EN_ATTENTE, CALME), {
      etat: "en attente",
      ton: "jaune",
      faits: FAITS_EN_ATTENTE,
      lignes: [],
      enVol: { titre: "no cook in flight — the rail is quiet", cooks: [] },
      mettre: {
        libelle: "deploy…",
        avertissement: AVERTISSEMENT,
        choix: [ATTENDRE, couper("the box action goes without waiting for a quiet rail — at this reading, no cook is in flight")],
        renoncer: "request nothing",
      },
      gestes: [],
    });
  });

  test("« depuis quand » est l'heure de la plus ancienne livraison qui n'est pas en service, comptée jusqu'à la lecture de la box — pas jusqu'à l'horloge du poste", () => {
    const pose = tableau({ etat: "ouverte", lu: LU, dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], version: EN_ATTENTE, miseEnService: CALME }).version;

    assert.deepEqual(pose.faits[2], { libelle: "behind for", valeur: "1 h 43" });
    assert.deepEqual(pose.faits[3], { libelle: "deliveries not in service", valeur: "26" });
  });

  test("une seule livraison s'écrit au singulier", () => {
    assert.deepEqual(vue({ ...EN_ATTENTE, livraisons: 1 }, CALME).faits.at(-1), { libelle: "delivery not in service", valeur: "1" });
  });

  test("les deux choix sont deux gestes du socle, distincts, et rien d'autre n'est offert tant qu'aucun n'est pris", () => {
    const { mettre, gestes } = vue(EN_ATTENTE, EN_COURS);

    assert.deepEqual(mettre?.choix.map(({ id }) => id), [DEMANDER, COUPER]);
    assert.notEqual(mettre?.choix[0].id, mettre?.choix[1].id);
    for (const id of [DEMANDER, COUPER, ANNULER]) assert.ok(GESTES.some((geste) => geste.id === id), `« ${id} » n'est pas un geste du socle`);
    assert.deepEqual(gestes, []);
  });

  test("l'avertissement est dit en anglais, et reprend celui de docs/runtime.md, « Mettre en service »", () => {
    assert.ok(doc.includes("**Mettre en service.**"), "docs/runtime.md n'a plus « Mettre en service »");
    assert.equal(AVERTISSEMENT, "Deploying is a real restart: the cooks in flight die with the runtime, and their tickets start over from zero.");
  });
});

describe("rien n'attend : aucun geste n'est offert, et rien n'est dit à jour qui ne l'est pas", () => {
  test("à jour : la box le dit, avec le commit en service et la branche comparée — ni geste, ni cook en vol à montrer", () => {
    assert.deepEqual(vue(A_JOUR, EN_COURS), {
      etat: "à jour",
      ton: "vert",
      faits: [
        { libelle: "in service", valeur: "3b0177804de6", exact: true },
        { libelle: "compared with", valeur: "origin/v2", exact: true },
        { libelle: "for", valeur: "<2026-10-12T08:21:07.000Z>" },
      ],
      lignes: ["nothing is waiting to be deployed"],
      gestes: [],
    });
  });

  test("non comparée : la raison de la box, mot pour mot — rien ne dit qu'elle est à jour, et le runtime refuserait la demande : aucun geste", () => {
    const pose = vue(NON_COMPAREE, CALME);

    assert.equal(pose.etat, "non comparée");
    assert.equal(pose.ton, "gris");
    assert.deepEqual(pose.lignes, ["l'origine ne répond pas — nothing says the version in service is up to date; the runtime resumes the comparison by itself"]);
    assert.ok(!("mettre" in pose) && !("enVol" in pose));
    assert.deepEqual(pose.gestes, []);
  });

  test("un runtime qui n'a rien comparé, ou qui ne donne pas encore sa version : ce n'est pas « à jour », et rien n'est offert", () => {
    assert.deepEqual(vue(null, CALME), {
      etat: "nothing compared",
      faits: [],
      lignes: ["the running runtime has compared nothing with its origin: it has just started, or is not running a version put in place by the switch. This is not “up to date”"],
      gestes: [],
    });
    assert.deepEqual(vue(undefined, undefined), { etat: "not read", faits: [], lignes: ["this box's runtime does not yet give its version in `faits`. This is not “up to date”"], gestes: [] });
  });

  test("les mots d'état sont ceux des deux listes fermées du runtime ; un mot inconnu s'affiche tel quel, sans couleur ni geste", () => {
    assert.deepEqual(ETATS_DE_VERSION.map((etat) => vue({ ...A_JOUR, etat }, CALME).ton), ["vert", "jaune", "gris"]);
    assert.deepEqual(ETATS_DE_MISE_EN_SERVICE.map((etat) => vue(EN_ATTENTE, { ...EN_COURS, etat, depuis: LU }).demande?.ton), [undefined, "jaune", "bleu"]);

    const neuve = vue({ ...EN_ATTENTE, etat: "en avance" }, CALME);
    assert.equal(neuve.etat, "en avance");
    assert.ok(!("ton" in neuve) && !("mettre" in neuve));
    const suspendue = vue(EN_ATTENTE, { ...EN_COURS, etat: "suspendue", depuis: LU });
    assert.deepEqual(suspendue.demande, { etat: "suspendue", dit: `for <${LU}>` });
    assert.ok(!("mettre" in suspendue));
    assert.deepEqual(suspendue.gestes, []);
  });

  test("une version attend, mais le runtime ne dit pas encore ce qui est en vol : le geste n'est pas offert, et l'app dit pourquoi", () => {
    const pose = vue(EN_ATTENTE, undefined);

    assert.deepEqual(pose.lignes, ["deploy: not offered — this box's runtime does not yet say in `faits` what is requested, nor what is in flight. This is not “no cook in flight”"]);
    assert.ok(!("mettre" in pose) && !("enVol" in pose));
    assert.deepEqual(pose.gestes, []);
  });
});

describe("les cooks en vol : montrés avant d'agir, avec ce qu'ils ont déjà dépensé", () => {
  test("chacun avec son ticket, son titre du rail, sa station et ses tokens ; un jugement du manager n'a pas de ticket ; le total est celui que la box a compté", () => {
    const pose = vue(EN_ATTENTE, EN_COURS);

    assert.deepEqual(pose.enVol, TROIS_EN_VOL);
    // Le total se lit, il ne se recompte pas : celui de la box, même s'il n'est pas la somme.
    assert.match(vue(EN_ATTENTE, { ...EN_COURS, tokens: 500000 }).enVol?.titre ?? "", new RegExp(`^3 cooks in flight — ${nombre(500000)} tokens`));
  });

  test("couper dit ce qu'il interrompt : combien de cooks, et ce qu'ils ont dépensé ; attendre dit qu'aucun ne l'est", () => {
    assert.deepEqual(vue(EN_ATTENTE, EN_COURS).mettre?.choix, [ATTENDRE, COUPER_TROIS]);
    assert.deepEqual(vue(EN_ATTENTE, { ...CALME, enVol: [EN_VOL[0] ?? assert.fail()], tokens: 230000 }).mettre?.choix[1], couper(`the box action goes without waiting: 1 cook in flight interrupted by the restart, ${nombre(230000)} tokens already spent`));
    assert.equal(vue(EN_ATTENTE, { ...CALME, enVol: [EN_VOL[0] ?? assert.fail()], tokens: 230000 }).enVol?.titre, `1 cook in flight — ${nombre(230000)} tokens already spent in all`);
  });

  test("demandée, elle attend le rail calme : les cooks en vol restent posés, et deux gestes — ne plus attendre, y renoncer ; « mettre en service » n'est plus offert", () => {
    const demandee = vue(EN_ATTENTE, { ...EN_COURS, etat: "demandée", depuis: "2026-10-12T10:01:40.000Z" });

    assert.deepEqual(demandee, {
      etat: "en attente",
      ton: "jaune",
      faits: FAITS_EN_ATTENTE,
      lignes: [],
      demande: { etat: "demandée", ton: "jaune", dit: "for <2026-10-12T10:01:40.000Z> — it is waiting for a quiet rail: no cook is interrupted, no other goes, and the box action goes by itself as soon as none is in flight" },
      gestes: [COUPER_TROIS, RENONCER],
      enVol: TROIS_EN_VOL,
    });
  });

  test("déjà coupée, ou le rail calme : il ne reste qu'à y renoncer ; lancée, plus aucun geste — le geste de box ne se rappelle pas", () => {
    const coupee = vue(EN_ATTENTE, { ...EN_COURS, etat: "demandée", depuis: LU, coupe: true });
    assert.equal(coupee.demande?.dit, `for <${LU}> — without waiting for a quiet rail: the box action goes at the runtime's next wake-up`);
    assert.deepEqual(coupee.gestes, [RENONCER]);

    const calme = vue(EN_ATTENTE, { ...CALME, etat: "demandée", depuis: LU });
    assert.equal(calme.demande?.dit, `for <${LU}> — the rail is quiet: the box action goes at the runtime's next wake-up`);
    assert.deepEqual(calme.gestes, [RENONCER]);

    const lancee = vue(EN_ATTENTE, { ...EN_COURS, etat: "lancée", depuis: LU });
    assert.deepEqual(lancee.demande, { etat: "lancée", ton: "bleu", dit: `for <${LU}> — the box action has gone, and cannot be recalled: the runtime is about to restart, no cook goes any more` });
    assert.deepEqual(lancee.gestes, []);
    assert.deepEqual(lancee.enVol, TROIS_EN_VOL);
  });

  test("une demande qui vit sur une version que la box ne dit plus en attente garde ses gestes : elle se coupe, ou s'abandonne", () => {
    const pose = vue(NON_COMPAREE, { ...EN_COURS, etat: "demandée", depuis: LU });

    assert.deepEqual(pose.gestes, [COUPER_TROIS, RENONCER]);
    assert.ok(!("mettre" in pose));
  });
});

// Le bloc `attend`, écrit par le runtime : une version qui attend, et ce que le dernier geste
// de box a donné — `direIssue` et `direFin` en font la ligne et sa suite.
const LANCE = "2026-10-12T10:00:00.000Z";
const REPARTI = "2026-10-12T10:01:00.000Z";
const MOTIF = "le runtime est sorti en code 1, et systemd ne le relance pas (`failed`)";
const FIN = [
  "brigade-mise-en-service : le clone (/opt/brigade) passe de 3b0177804de6 à eec91320ee32 — 3 commit(s) reçu(s) de son origine",
  "brigade-bascule : eec91320ee32 n'a pas démarré pour brigade@brigade.service — le runtime est sorti en code 1, et systemd ne le relance pas (`failed`)",
  "                  ce que l'essai a écrit : /opt/brigade-versions/brigade/essai.journal ; `brigade brigade installation` le redit",
];
const REVENUE: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "returned", le: REPARTI, servie: SERVIE, refusee: TETE, motif: MOTIF, fin: FIN.join("\n") } };
const SANS_REFUS: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "returned", le: REPARTI, servie: SERVIE, refusee: null, motif: null, fin: "" } };
const UNITE_CHANGEE: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "exited", le: REPARTI, code: 72, signal: null, fin: "brigade-bascule : eec91320ee32 change brigade@.service\n  sudo cp /opt/brigade/runtime/deploy/brigade@.service /etc/systemd/system/ ; sudo systemctl daemon-reload", erreur: null } };
const SUDO_REFUSE: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "exited", le: REPARTI, code: 1, signal: null, fin: "sudo: a password is required", erreur: null } };
const PAS_LANCE: GesteRendu = { lanceLe: LANCE, avant: null, issue: { quoi: "exited", le: REPARTI, code: null, signal: null, fin: "", erreur: "spawn sudo ENOENT" } };
const TUE: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "exited", le: REPARTI, code: null, signal: "SIGTERM", fin: "", erreur: null } };
const RIEN_A_FAIRE: GesteRendu = { lanceLe: LANCE, avant: SERVIE, issue: { quoi: "exited", le: REPARTI, code: 0, signal: null, fin: "brigade-mise-en-service : 3b0177804de6 est déjà en service", erreur: null } };
const ISSUES: readonly [nom: string, geste: GesteRendu][] = [
  ["la version précédente est revenue", REVENUE],
  ["le runtime est reparti sans refus noté", SANS_REFUS],
  ["la version change une unité posée", UNITE_CHANGEE],
  ["sudo refuse le compte du service", SUDO_REFUSE],
  ["le geste n'a pas pu être lancé", PAS_LANCE],
  ["le geste a été tué", TUE],
  ["le geste n'avait rien à mettre en service", RIEN_A_FAIRE],
];
const version = (service: GesteRendu): Attente => ({ ticket: null, title: null, since: EN_ATTENTE.depuis, quoi: "version", projet: "brigade", servie: SERVIE, branche: "origin/v2", tete: TETE, livraisons: 26, service });
const TICKET: Attente = { ticket: 21, title: "L'export du journal", since: "2026-10-12T08:00:00.000Z", quoi: "bloque", abandonnes: [{ ticket: 17, reason: "label" }] };
const ecrit = (...attentes: Attente[]) => decrireAttentes(attentes, () => "1 h 39").join("\n");

describe("une mise en service qui a échoué : la version précédente revenue et la raison, sans renvoyer au terminal", () => {
  test("le bloc que le runtime écrit dit la version refusée, le motif de la bascule et la version revenue : l'app les pose mot pour mot, avec les dernières lignes du geste", () => {
    const bloc = ecrit(TICKET, version(REVENUE));

    assert.deepEqual(echecDe(bloc), {
      dit: `MISE EN SERVICE ÉCHOUÉE, lancée le ${LANCE} : eec91320ee32 n'a pas démarré — « ${MOTIF} » ; la version précédente (3b0177804de6) est revenue en service, le runtime est reparti sur elle le ${REPARTI}`,
      fin: ["les dernières lignes du geste de box :", ...FIN.map((ligne) => `│ ${ligne}`)],
    });
  });

  for (const [nom, geste] of ISSUES) {
    test(`${nom} : la phrase du runtime est reprise jusqu'au geste à refaire, qui se refait ici d'un bouton — ni \`sudo\`, ni commande à taper`, () => {
      const dite = direIssue(geste, "brigade");
      const lu = echecDe(ecrit(version(geste))) ?? assert.fail("l'entrée `version` ne dit plus l'échec dans la forme que l'app sait lire");

      assert.ok(dite.startsWith(`${lu.dit} — `), dite);
      assert.match(dite.slice(lu.dit.length), /^ — (une version corrigée livrée, |une fois levé ce qu'il dit, )?à redemander : `brigade <projet> mise-en-service` ; ou à la main : `sudo brigade-mise-en-service brigade`$/);
      assert.doesNotMatch(lu.dit, /`run |sudo brigade-mise-en-service|à redemander/);
    });
  }

  test("sans échec, rien n'en est dit : un bloc sans version, un bloc vide", () => {
    for (const bloc of [ecrit(TICKET), ecrit()]) assert.equal(echecDe(bloc), undefined, bloc);
    assert.equal(entreeDeVersion(ecrit(TICKET)), undefined);
    assert.match(entreeDeVersion(ecrit(version(REVENUE)))?.ligne ?? "", /^depuis 1 h 39 {2}une version attend : origin\/v2 \(eec91320ee32\)/);
  });

  test("une version non comparée dit l'échec de même, à la suite de sa raison", () => {
    const bloc = ecrit({ ticket: null, title: null, since: LANCE, quoi: "version-illisible", projet: "brigade", servie: SERVIE, branche: "origin/v2", raison: "l'origine ne répond pas", service: UNITE_CHANGEE });

    assert.match(echecDe(bloc)?.dit ?? "", /^MISE EN SERVICE ÉCHOUÉE, lancée le .* : le geste de box a rendu 72 .*\(la version change une unité posée\), sans rien redémarrer/);
    assert.equal(echecDe(bloc)?.fin.length, 3);
  });

  test("seule l'entrée `version` est lue, et sa suite s'arrête à la ligne qui n'est plus en retrait d'elle", () => {
    const bloc = ["attend     2 décisions attendent le chef", "  version  depuis 2 j  une version attend — MISE EN SERVICE ÉCHOUÉE, lancée hier : rien ne va — à redemander : `brigade <projet> mise-en-service`", "      │ une ligne", "      │ une autre", "  #12  depuis 2 j  MISE EN SERVICE ÉCHOUÉE dans un titre", "      pas à la version", "fin attend"].join("\n");

    assert.deepEqual(echecDe(bloc), { dit: "MISE EN SERVICE ÉCHOUÉE, lancée hier : rien ne va", fin: ["│ une ligne", "│ une autre"] });
    for (const tete of ["version  sans retrait", " version  un seul espace", "    version  quatre espaces", "  version sans les deux espaces", "  versions  un autre nom"]) {
      assert.equal(echecDe(`attend\n${tete} — MISE EN SERVICE ÉCHOUÉE : x\nfin attend`), undefined, tete);
    }
  });

  test("une phrase qui ne finit pas comme le runtime l'écrit est posée entière : rien n'en est coupé au hasard", () => {
    const bloc = "attend     1 décision\n  version  depuis 2 j  une version attend — MISE EN SERVICE ÉCHOUÉE, lancée hier : rien ne va — regarde le journal\nfin attend";

    assert.equal(echecDe(bloc)?.dit, "MISE EN SERVICE ÉCHOUÉE, lancée hier : rien ne va — regarde le journal");
  });

  test("l'échec se pose avec l'heure de la lecture du bloc, la version attend toujours, et le geste se redemande dans la bande", () => {
    const pose = vue(EN_ATTENTE, CALME, ecrit(version(REVENUE)));

    assert.equal(pose.etat, "en attente");
    assert.deepEqual(pose.echec, {
      dit: `MISE EN SERVICE ÉCHOUÉE, lancée le ${LANCE} : eec91320ee32 n'a pas démarré — « ${MOTIF} » ; la version précédente (3b0177804de6) est revenue en service, le runtime est reparti sur elle le ${REPARTI}`,
      fin: ["les dernières lignes du geste de box :", ...FIN.map((ligne) => `│ ${ligne}`)],
      suite: "The version is still waiting. Once what the action says is cleared, it can be requested again in the alert band, with “deploy”.",
      a: LU,
    });
    assert.deepEqual(pose.mettre?.choix.map(({ id }) => id), [DEMANDER, COUPER]);
    // Sans bloc pris — un autre écran, une lecture ratée — rien n'est dit de l'échec, et rien n'est inventé.
    assert.ok(!("echec" in vue(EN_ATTENTE, CALME)));
    // Là où le geste n'est pas offert — une version non comparée —, l'échec se lit sans promettre de le redemander ici.
    const sansGeste = vue(NON_COMPAREE, CALME, ecrit(version(REVENUE)));
    assert.ok(sansGeste.echec !== undefined && !("suite" in sansGeste.echec) && !("mettre" in sansGeste));
  });

  test("le bloc `attend` que `status` vient de rendre rejoint les faits déjà tenus : l'échec se pose sans attendre la lecture suivante de `faits`", () => {
    const tenus = tenirFaits();
    const faits: Faits = { etat: "ouverte", lu: LU, dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], version: EN_ATTENTE, miseEnService: CALME };
    const recue = tenus.recevoir({ projet: "brigade", demande: 1, a: LU, sorties: [{ commande: "faits", texte: JSON.stringify(faits) }] });
    assert.ok("tableau" in recue && !("echec" in recue.tableau.version));

    const redessine = tenus.attendre({ projet: "brigade", demande: 2, a: REPARTI, attend: ecrit(version(REVENUE)), sorties: [] });

    assert.ok(redessine !== undefined && "tableau" in redessine);
    assert.equal(redessine.tableau.version.echec?.a, REPARTI);
    assert.match(redessine.tableau.version.echec?.dit ?? "", /la version précédente \(3b0177804de6\) est revenue en service/);
  });
});

// La vue, jouée : un espace ouvert, et ce que `faits` donne à poser de sa version.
const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS, rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
// Les faits de « parade » que la box rend : la section de la version et la bande en sont tirées, et
// la confirmation de « mettre en service » aussi — comme le process principal la tire (confirmation.ts).
const faitsDe = (version: Version, miseEnService: MiseEnService): Faits => ({
  etat: miseEnService.etat === "aucune" ? "ouverte" : "retenue",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 1, auTravail: 2, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: RAIL.map((ticket) => ({ ...ticket, etat: "pris", url: "" })),
  version,
  miseEnService,
});
const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } };
const REPONSES: Reponses & Required<Pick<Reponses, "demarrage">> = { demarrage, espace: () => [SECOND], geste: () => SECOND };
const dessinable = (pose: Vu): Dessinable => ({
  projet: PARADE,
  demande: 0,
  a: A,
  tableau: { etat: "ouverte", ton: "vert", arretee: false, tick: "dernier tick il y a 12 s", compteurs: [], cooks: { enCours: [], vide: "aucun cook en cours" }, evenement: "rien", rail: { colonnes: [], hors: [] }, version: pose },
});
// La bande de « parade » d'après ces faits : le manager allumé, la cuisine dite par `status`.
const bandeDe = (faits: Faits) => ({ projet: PARADE, alertes: alertes({ projet: PARADE, faits, status: "cuisine    ouverte\n", manager: { allume: true, mot: "ALLUMÉ", dit: "" } }) });

// L'espace de « parade », ouvert, ses faits lus : la section de la version, telle que la vue la pose,
// et la ligne de la bande qui dit la version.
async function poser(version: Version, miseEnService: MiseEnService, bloc?: string): Promise<{ jouee: Jouee; section: Faux; ligne: () => Faux; relire: (faits: Faits) => void }> {
  let faits = faitsDe(version, miseEnService);
  const jouee = await jouerLaVue({ ...REPONSES, confirmer: (_, id, grant) => confirmationDe(id, PROJET, { faits, a: LU }, grant) });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const relire = (nouveaux: Faits) => {
    faits = nouveaux;
    jouee.dire("surFaits", { ...dessinable(vue(nouveaux.version, nouveaux.miseEnService, bloc)), demande: jouee.dernier("faits")[0] as number });
    jouee.dire("surAlertes", bandeDe(nouveaux));
  };
  relire(faits);
  const ligne = () => jouee.element("alertes").children.find((pose) => pose.dataset.sujet === "version") ?? assert.fail("pas de ligne de version");
  return { jouee, section: jouee.element("version"), ligne, relire };
}
const boutons = (ou: Faux) => ou.dessous("button").map((bouton) => bouton.textContent);
const cliquer = async (ou: Faux, libelle: string) => {
  (ou.dessous("button").find((bouton) => bouton.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`)).click();
  await repos();
};
const ecrits = (jouee: Jouee) => jouee.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args);
const confirmation = (ligne: Faux) => ligne.dessous("div").find((pose) => pose.className === "confirmation");

describe("dans l'espace du projet, la version se pose juste au-dessus de ce qui t'attend", () => {
  test("la section est dans le panneau, entre les pages servies et la lecture de `status` — dont le bloc `attend` est la tête", () => {
    const html = readFileSync(join(RACINE, "app/src/vue/index.html"), "utf8");

    assert.match(html, /<section id="pages"[^>]*><\/section>\s*<section id="version" class="carte"[^>]*hidden><\/section>\s*<div id="lecture"><\/div>/);
  });

  test("une version en attente : son mot d'état, ses faits — le commit en monospace —, les cooks en vol, et aucun bouton : son geste est sur la ligne de la bande", async () => {
    const { jouee, section, ligne } = await poser(EN_ATTENTE, EN_COURS);

    assert.equal(section.hidden, false);
    assert.match(section.dessous("h3")[0]?.textContent ?? "", /^the runtime version, from `ssh box brigade parade faits` — read at /);
    assert.deepEqual(
      section.dessous("ul").find((liste) => liste.className === "faits")?.children.map((fait) => fait.children.map((pose) => [pose.textContent, pose.className])),
      [
        [["awaiting", ""], ["origin/v2 (eec91320ee32)", "mono"]],
        [["in service", ""], ["3b0177804de6", "mono"]],
        [["behind for", ""], ["<2026-10-12T08:21:07.000Z>", ""]],
        [["deliveries not in service", ""], ["26", ""]],
      ],
    );
    assert.ok(section.dessous("strong").some((mot) => mot.textContent === "en attente" && mot.parentElement?.dataset.ton === "jaune"));
    assert.ok(section.dessous("p").some((pose) => pose.textContent === TROIS_EN_VOL.titre));
    assert.deepEqual(boutons(section), []);
    // Le geste est collé à l'état qu'il change : la ligne de la bande qui dit que la version attend.
    assert.deepEqual(boutons(ligne()), ["deploy…"]);
    assert.deepEqual(ecrits(jouee), []);
  });

  test("« mettre en service… » ouvre sa confirmation sous la ligne : l'avertissement, les cooks en vol et leurs tokens, puis deux choix distincts — et rien ne part", async () => {
    const { jouee, ligne } = await poser(EN_ATTENTE, EN_COURS);

    await cliquer(ligne(), "deploy…");

    assert.deepEqual(jouee.dernier("confirmer"), [PARADE, DEMANDER, undefined]);
    const ouverte = confirmation(ligne()) ?? assert.fail("pas de confirmation");
    assert.ok(ouverte.dessous("strong").some((mot) => mot.textContent === "⚠️ deploy"));
    assert.ok(ouverte.dessous("p").some((pose) => pose.textContent === AVERTISSEMENT));
    assert.ok(ouverte.dessous("p").some((pose) => pose.textContent === TROIS_EN_VOL.titre));
    assert.deepEqual(
      ouverte.dessous("ul").find((liste) => liste.className === "cooks")?.children.map((cook) => cook.children.map((pose) => [pose.balise, pose.textContent, pose.className])),
      [
        [["strong", "#14", "mono"], ["span", "Le journal en ajout seul", ""], ["small", "box/claude", "mono"], ["small", `${nombre(230000)} tokens already spent`, ""]],
        [["strong", "#30", "mono"], ["span", "", ""], ["small", "unknown station", "mono"], ["small", "tokens: not measured yet", ""]],
        [["span", "a manager judgement", ""], ["small", "box/claude", "mono"], ["small", `${nombre(220775)} tokens already spent`, ""]],
      ],
    );
    assert.deepEqual(boutons(ouverte), ["wait for a quiet rail", "cut without waiting", "request nothing"]);
    // Chaque choix dit ce qu'il engage, à côté de son bouton.
    for (const { libelle, dit } of [ATTENDRE, COUPER_TROIS]) assert.ok(ouverte.dessous("p").some((pose) => pose.className === "gestes" && pose.textContent === `${libelle}${dit}`), libelle);
    assert.deepEqual(ecrits(jouee), []);
  });

  test("la confirmation ouverte ne se referme pas quand `faits` est relu et que la ligne dit une autre durée", async () => {
    const { ligne, relire } = await poser(EN_ATTENTE, EN_COURS);
    await cliquer(ligne(), "deploy…");
    const avant = ligne().dessous("strong")[0]?.textContent;

    relire({ ...faitsDe(EN_ATTENTE, EN_COURS), lu: "2026-10-12T11:04:11.000Z" });

    assert.notEqual(ligne().dessous("strong")[0]?.textContent, avant);
    assert.deepEqual(boutons(confirmation(ligne()) ?? assert.fail("la confirmation s'est refermée")), ["wait for a quiet rail", "cut without waiting", "request nothing"]);
  });

  for (const [libelle, id] of [["wait for a quiet rail", DEMANDER], ["cut without waiting", COUPER]] as const) {
    test(`« ${libelle} » est un « oui » : il nomme le geste « ${id} » au process principal, une fois, avec ce « oui » — et la vue ne lui passe aucune commande`, async () => {
      const { jouee, ligne } = await poser(EN_ATTENTE, EN_COURS);
      await cliquer(ligne(), "deploy…");

      await cliquer(confirmation(ligne()) ?? assert.fail(), libelle);

      assert.deepEqual(ecrits(jouee), [[PARADE, id, undefined, true]]);
      // Le choix est pris : la confirmation se referme sur son bouton.
      assert.deepEqual(boutons(ligne()), ["deploy…"]);
    });
  }

  test("« ne rien demander » referme la confirmation : rien ne part", async () => {
    const { jouee, ligne } = await poser(EN_ATTENTE, EN_COURS);
    await cliquer(ligne(), "deploy…");

    await cliquer(confirmation(ligne()) ?? assert.fail(), "request nothing");

    assert.deepEqual(boutons(ligne()), ["deploy…"]);
    assert.deepEqual(ecrits(jouee), []);
  });

  test("rien n'attend : la version est dite à jour, aucun bouton n'est posé, et la bande ne dit rien de la version", async () => {
    const { jouee, section } = await poser(A_JOUR, EN_COURS);

    assert.equal(section.hidden, false);
    assert.ok(section.dessous("strong").some((mot) => mot.textContent === "à jour" && mot.parentElement?.dataset.ton === "vert"));
    assert.ok(section.dessous("p").some((pose) => pose.textContent === "nothing is waiting to be deployed"));
    assert.deepEqual(boutons(section), []);
    assert.equal(jouee.element("alertes").children.find((pose) => pose.dataset.sujet === "version"), undefined);
    assert.deepEqual(ecrits(jouee), []);
  });

  test("une demande qui attend le rail calme : son état et les cooks en vol sur la carte ; sur la ligne, couper — confirmé — et y renoncer — direct", async () => {
    const { jouee, section, ligne } = await poser(EN_ATTENTE, { ...EN_COURS, etat: "demandée", depuis: LU });

    assert.ok(section.dessous("strong").some((mot) => mot.textContent === "deploy demandée" && mot.parentElement?.dataset.ton === "jaune"));
    assert.ok(section.textContent.includes(TROIS_EN_VOL.titre));
    assert.deepEqual(boutons(section), []);
    assert.deepEqual(boutons(ligne()), ["cut without waiting…", "withdraw the request"]);

    // Y renoncer part au clic : il n'interrompt rien.
    await cliquer(ligne(), "withdraw the request");
    assert.deepEqual(ecrits(jouee), [[PARADE, ANNULER, undefined, undefined]]);
    // Couper ne part qu'à son « oui ».
    await cliquer(ligne(), "cut without waiting…");
    assert.deepEqual(jouee.dernier("confirmer"), [PARADE, COUPER, undefined]);
    assert.equal(ecrits(jouee).length, 1);
    await cliquer(confirmation(ligne()) ?? assert.fail(), "cut without waiting");
    assert.deepEqual(ecrits(jouee), [[PARADE, ANNULER, undefined, undefined], [PARADE, COUPER, undefined, true]]);
  });

  test("un échec : la phrase du runtime — la version revenue, la raison —, les dernières lignes du geste mot pour mot, l'heure de leur lecture ; et le geste se redemande sur la ligne de la bande", async () => {
    const { section, ligne } = await poser(EN_ATTENTE, CALME, ecrit(version(REVENUE)));

    const [dit] = section.dessous("p").filter((pose) => pose.className === "echec");
    assert.equal(dit?.textContent, `MISE EN SERVICE ÉCHOUÉE, lancée le ${LANCE} : eec91320ee32 n'a pas démarré — « ${MOTIF} » ; la version précédente (3b0177804de6) est revenue en service, le runtime est reparti sur elle le ${REPARTI}`);
    // Ce que la box a rendu reste dans un `pre` nu, ligne pour ligne.
    assert.deepEqual(section.dessous("pre").map((pre) => [pre.textContent, pre.className]), [[["les dernières lignes du geste de box :", ...FIN.map((ligne) => `│ ${ligne}`)].join("\n"), ""]]);
    assert.ok(section.dessous("small").some((source) => source.textContent.startsWith("from the `version` entry of the `attend` block of `ssh box brigade parade status` — read at ")));
    assert.deepEqual(boutons(section), []);
    assert.deepEqual(boutons(ligne()), ["deploy…"]);
    // Rien de ce que l'app dit elle-même ne renvoie au terminal : ni `sudo`, ni commande à taper.
    for (const pose of [...section.dessous("p"), ...section.dessous("small"), ...section.dessous("button")]) assert.doesNotMatch(pose.textContent, /sudo|`run /, pose.textContent);
  });

  test("sans faits — la première lecture en cours, une box qui ne les rend pas — rien n'est posé de la version : la carte dit déjà pourquoi", async () => {
    const jouee = await jouerLaVue(REPONSES);
    (jouee.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.equal(jouee.element("version").hidden, true);

    jouee.dire("surFaits", { projet: PARADE, demande: jouee.dernier("faits")[0] as number, a: A, titre: "PAS JOINT", erreur: "ssh: connect to host box port 22: Operation timed out", atteinte: false, cas: "ssh-en-echec" });

    assert.equal(jouee.element("version").hidden, true);
    assert.deepEqual(jouee.element("version").children, []);
  });
});
