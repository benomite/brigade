// L'accueil : la vue d'ensemble de brigade (#870) — une ligne par projet, une par station, et en
// bas une ligne de santé, Max et GitHub. On n'y agit pas : un clic sur une ligne ouvre sa page, et
// c'est là que tout se décide. Chaque ligne dit ce qui s'y passe en quelques mots de l'app, avec sa
// pastille — jamais une commande, jamais le texte d'une erreur : ce qu'elle tait se lit au survol,
// dans les mots de l'app aussi.
//
// Un projet : rouge quand il est bloqué — base rouge, cuisine arrêtée ou retenue, runtime éteint,
// box injoignable ; jaune quand une décision attend le chef ; vert sinon ; gris tant que rien n'en
// est lu. Sa phrase dit, dans cet ordre, ce qui bloque, ce qui attend le chef — combien, depuis
// quand —, puis ce qui cuit ; et, quand la fiabilité de ses cooks a dérivé, d'un mot : « drifting » (#987).
// Une station : son état (« online », « offline for 12 min »), ce qu'elle fait — ses cooks, saturée,
// une mise à jour ratée, sa connexion Max perdue —, et les projets qu'elle porte. Sa machine et sa
// version ne se lisent qu'au survol.
//
// Ce module ne lance rien et ne demande rien de neuf à personne : il dit, d'après ce que les veilles
// ont déjà lu — `faits` de chaque projet, son `status` quand il est lu, les stations et leurs
// projets sur GitHub. Un état qui n'a pas été lu n'est jamais dit sain.
import { CONNEXION, CUISINE, tetesDe } from "./alertes.ts";
import type { Montree } from "./attend.ts";
import type { Lecture } from "./box.ts";
import { COMMANDE as FAITS, comprendre, type AppelsGithub, type Faits } from "./faits.ts";
import { deriveDe } from "./fiabilite.ts";
import { heure, heureCourte } from "./format.ts";
import type { VuDesProjets } from "./projets/projets.ts";
import { plafondsDe, retenuesDe, type PlafondVu, type RetenueVue } from "./plafond.ts";
import { raisonDe, type RaisonDeStation } from "./stations/raison.ts";
import { LIMITE, type StationVue, type VuDesStations } from "./stations/stations.ts";

// Les tons des pastilles de la peau (vue.css) : vert, jaune — l'orange de la maquette —, rouge, gris.
export type Ton = "vert" | "jaune" | "rouge" | "gris";
// Une ligne de l'accueil : ce qu'elle dit, sa pastille, et ce qui se lit au survol.
export type LigneDeProjet = { nom: string; ton: Ton; dit: string; survol: string };
// Une station a aussi `phrase` : son état en une phrase, en tête de sa page (#877) — « online · 2 cooks
// running », « offline for 12 min », « saturated ». Ni sa machine, ni sa version, ni ses projets.
// `raison` : une station installée qui ne cuit pas encore dit pourquoi, en une phrase qui nomme le geste (stations/raison.ts, #1758).
// `note` : sous la phrase, une station en ligne qui ne fait la cuisine d'aucun projet dit en une phrase si c'est normal.
// `plafond` et `retenue` : ce que le `status` d'un projet dit de son plafond de cooks et de ce qui la retient (plafond.ts) ;
// `reglable` : un projet que l'app lit nomme son plafond, la page peut donc le régler.
export type LigneDeStation = { id: string; nom: string; ton: Ton; dit: string; phrase: string; survol: string; note?: string; raison?: RaisonDeStation; plafond?: PlafondVu; retenue?: RetenueVue; reglable?: true; appels?: AppelsGithub };
export type Sante = { ton: Ton; dit: string; survol: string };
// `stations` : absentes, la première lecture sur GitHub est en route.
// `plafonds` : par projet dont le `status` est lu, et par station qu'il nomme, le plafond de cooks de ce projet sur elle
// et ce qui la retient (ticket 1292) — la ligne de station de l'onglet Cooks les dit et les règle.
export type PlafondsDeStation = { plafond: PlafondVu; retenue?: RetenueVue };
export type Accueil = { projets: LigneDeProjet[]; stations?: LigneDeStation[]; sante: Sante; plafonds?: Record<string, Record<string, PlafondsDeStation>> };

// Un projet du fichier, tel que l'accueil le nomme : sans box, ou désinstallé de la sienne, rien n'en est lu.
export type ProjetDeLAccueil = { nom: string; box: boolean; desinstalle: boolean };
// Ce que la dernière lecture de `faits` a donné d'un projet : ses faits, une box qui n'a pas été
// jointe, ou une box jointe qui n'a pas rendu ce que l'app lit.
export type FaitsLus = { a: string } & ({ faits: Faits } | { injoignable: true } | { illisible: true });
// Le dernier `status` lu d'un projet, son bloc `attend` mis à part.
export type StatusLu = { texte: string; attend?: string };

const s = (combien: number) => (combien > 1 ? "s" : "");
// Une durée que la box écrit (runtime/src/etat.ts, `duree`) — « 40 s », « 12 min », « 3 h 05 », « 2 j » —, dans les mots de l'app.
const enAnglais = (duree: string) => duree.replace(/ j$/, " d");

// --- Un projet -------------------------------------------------------------------

// Ce qui retient la cuisine, d'après les lignes de tête de `status` (alertes.ts lit les mêmes).
function causes(status: string): string[] {
  return tetesDe(status).flatMap(({ titre, valeur }) => {
    if (CUISINE.includes(titre) && /disjoncteur OUVERT|breaker OPEN/.test(valeur)) return ["breaker open"];
    if (titre === "stations") return ["no station declared"];
    if (CONNEXION.includes(titre)) return ["Max connection down"];
    if (titre === "setup" && /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u.test(valeur)) return ["project setup blocked"];
    return [];
  });
}
const baseRouge = (status: string | undefined) => status !== undefined && tetesDe(status).some(({ titre, valeur }) => titre === "base" && /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u.test(valeur));
// Le ticket qui répare la base rouge, quand `status` le dit en tête (runtime/src/etat.ts, `RIEN_NE_CUIT`),
// en anglais ou en français (#928).
const reparation = (status: string | undefined): number | undefined => {
  const [, anglais, francais] = /^(?:nothing cooks: base red since .*, repair #(\d+) in progress|rien ne cuit : base rouge depuis .*, réparation #(\d+) en cours)$/m.exec(status ?? "") ?? [];
  const ticket = anglais ?? francais;
  return ticket === undefined ? undefined : Number(ticket);
};

// Ce qui bloque le projet, le plus grave d'abord : rien ne le débloque sans le chef.
function bloque(faits: Faits, status: string | undefined): string[] {
  const rouge = baseRouge(status) ? [reparation(status) === undefined ? "base red" : `base red · #${reparation(status)} being repaired`] : [];
  switch (faits.etat) {
    case "éteinte":
      return ["runtime stopped", ...rouge];
    case "arrêtée":
      return ["kitchen stopped", ...rouge];
    case "retenue": {
      // Sans `status` lu, la cause n'est pas dite : la cuisine l'est, retenue.
      const lues = status === undefined ? [] : causes(status);
      return rouge.length + lues.length === 0 ? ["kitchen held"] : [...rouge, ...lues];
    }
    default:
      return rouge;
  }
}

// Depuis quand la plus ancienne décision attend le chef : la tête du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`),
// en français ou en anglais (`awaiting   2 decisions await the chef — the oldest for 3 d`, #927).
const depuis = (attend: string | undefined): string | undefined => {
  const [, duree] = /^(?:attend +\d+ décisions? attend(?:ent)? le chef(?: — la plus ancienne)? depuis|awaiting +\d+ decisions? awaits? the chef — (?:the oldest )?for) (.+)$/m.exec(attend ?? "") ?? [];
  return duree === undefined ? undefined : enAnglais(duree.trim());
};

// Ce qui attend le chef : combien de décisions, depuis quand ; et, quand toute la cuisine les attend, que rien ne cuit d'ici là.
function attend(faits: Faits, status: StatusLu | undefined): string[] {
  const combien = faits.compteurs.attend;
  if (combien === 0) return [];
  const duree = depuis(status?.attend);
  const dit = `${combien} decision${s(combien)} await${combien === 1 ? "s" : ""} you${duree === undefined ? "" : `, for ${duree}`}`;
  return [faits.urgence == null ? dit : `${dit} — nothing cooks until then`];
}

// Ce qui cuit : les tickets de ses cooks — la réparation de la base est déjà dite —, sinon ce qui est à la pass.
function cuit(faits: Faits, repare: number | undefined): string[] {
  const tickets = faits.cooks?.map(({ ticket }) => ticket).filter((ticket) => ticket !== repare);
  if (tickets === undefined) return faits.compteurs.auTravail > 0 ? [`${faits.compteurs.auTravail} at work`] : [];
  if (tickets.length > 2) return [`${tickets.length} cooks at work`];
  if (tickets.length > 0) return [`${tickets.map((ticket) => `#${ticket}`).join(" and ")} cooking`];
  return faits.compteurs.aLaPass > 0 ? [`${faits.compteurs.aLaPass} at the pass`] : [];
}

export function ligneDeProjet(projet: ProjetDeLAccueil, lu: FaitsLus | undefined, status: StatusLu | undefined): LigneDeProjet {
  const { nom } = projet;
  if (projet.desinstalle) return { nom, ton: "gris", dit: "uninstalled from its station: nothing is read", survol: "the app uninstalled it from its station — open it to remove it from the app" };
  if (!projet.box) return { nom, ton: "gris", dit: "no station: nothing is read", survol: "its entry in the projects file does not say where its station is — open it to see what is missing" };
  if (lu === undefined) return { nom, ton: "gris", dit: "first read in progress…", survol: "the app reads every project's station every 30 s" };
  if ("injoignable" in lu) return { nom, ton: "rouge", dit: "station unreachable", survol: `its station did not answer at ${heure(lu.a)} — the app tries again every 30 s; open it to see why` };
  if ("illisible" in lu) return { nom, ton: "gris", dit: "not read: its station does not answer as the app expects", survol: `tried at ${heure(lu.a)} — open it to see what its station returned` };
  const { faits } = lu;
  const bloquant = bloque(faits, status?.texte);
  const attendu = attend(faits, status);
  // La dérive se lit dans les lignes `drift` de `status` : un mot sur la ligne, ce qu'elle dit au survol.
  // Elle ne change pas la pastille — rien n'attend le chef, rien ne bloque.
  const derive = status === undefined ? [] : deriveDe(status.texte);
  const parties = [...bloquant, ...attendu, ...cuit(faits, reparation(status?.texte))];
  const dit = parties.length === 0 ? "nothing cooking, nothing waits for you" : parties.join(" · ");
  return {
    nom,
    ton: bloquant.length > 0 ? "rouge" : attendu.length > 0 ? "jaune" : "vert",
    dit: derive.length === 0 ? dit : `${dit} · drifting`,
    survol: `read at ${heure(lu.a)} — ${derive.length === 0 ? "" : `reliability drifting: ${derive.join(" · ")} — `}open it to act`,
  };
}

// --- Une station -----------------------------------------------------------------

// Les stations que le `status` d'un projet dit saturées (runtime/src/etat.ts) : `MACHINE SATURATED … : <station> takes no
// more tickets` depuis #940, `MACHINE SATURÉE … : <station> ne prend plus de ticket` sur une box pas encore à jour.
export function saturees(status: string): string[] {
  return [...status.matchAll(/MACHINE (?:SATURÉE\b.* : (.+?) ne prend plus de ticket|SATURATED\b.*: (.+?) takes no more tickets)/g)].map(
    ([, francaise, anglaise]) => francaise ?? anglaise ?? "",
  );
}

// Un projet ouvert dans l'app dont la cuisine tourne sur une autre station : `station` la nomme.
export type CuisineAilleurs = { projet: string; station: string };

// Ce que la station dit des cuisines portées ailleurs, quand c'est l'ordinateur de l'app : « your 3 projects cook on parade-box ».
function cuisinesAilleurs(ailleurs: readonly CuisineAilleurs[]): string {
  const stations = [...new Set(ailleurs.map(({ station }) => station))];
  return `your ${ailleurs.length === 1 ? "project cooks" : `${ailleurs.length} projects cook`} on ${stations.join(", ")}`;
}

export const NE_CUISINE_PAS = "does not cook";

// La ligne d'une station qui ne cuisine pas : son état, et la mention. Jamais de cooks, ni de saturation.
function ligneDeTelephone(station: StationVue, survol: string): LigneDeStation {
  const { id, nom } = station;
  const enLigne = station.etat === "en-ligne";
  return {
    id,
    nom,
    ton: enLigne ? "vert" : "gris",
    dit: [station.dit, NE_CUISINE_PAS].join(" · "),
    ...(enLigne ? {} : { raison: raisonDe("hors-ligne", nom) }),
    phrase: `${station.dit} · ${NE_CUISINE_PAS}`,
    survol,
    ...(enLigne ? { note: "A phone: it runs no cook, and is never offered to run a project's cooks." } : {}),
  };
}

// `cooks` : ceux que les projets disent en cours sur elle ; `saturee` : un `status` lu la dit saturée ;
// `ailleurs` : si c'est l'ordinateur de l'app, ses projets ouverts dont la cuisine tourne sur une autre station.
export function ligneDeStation(station: StationVue, cooks: number, saturee: boolean, ailleurs: readonly CuisineAilleurs[] = []): LigneDeStation {
  const { id, nom } = station;
  const survol = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((partie) => partie !== "").join(" · ");
  const sansCuisine = station.projets.length === 0;
  // Un téléphone (#1158) ne fait tourner aucun cook : sa ligne le dit, et il n'a aucun projet à attendre.
  if (station.cuisine === false) return ligneDeTelephone(station, survol);
  const projets = sansCuisine ? "no project" : station.projets.join(", ");
  if (station.etat !== "en-ligne") return { id, nom, ton: "gris", dit: [station.dit, ...(station.etat === "illisible" ? [] : [projets])].join(" · "), phrase: station.dit, raison: raisonDe(station.etat === "illisible" ? "illisible" : "hors-ligne", nom), survol: survol === "" ? "its state on GitHub cannot be read — open it to see why" : survol };
  const max = station.pannes.some(({ sujet }) => sujet === "connexion-max");
  const miseAJour = station.pannes.some(({ sujet }) => sujet === "mise-a-jour");
  const fait = [...(max ? ["Max connection lost"] : []), ...(miseAJour ? ["update failed"] : []), ...(saturee ? ["saturated"] : []), ...(cooks > 0 ? [`${cooks} cook${s(cooks)}`] : [])];
  return {
    id,
    nom,
    ton: max ? "rouge" : miseAJour || saturee ? "jaune" : "vert",
    dit: [station.dit, ...(fait.length === 0 ? ["idle"] : fait), sansCuisine ? "runs no kitchen" : projets].join(" · "),
    // Saturée, elle ne prend plus de ticket : c'est ce qui compte d'elle, ses cooks attendent.
    phrase: saturee ? "saturated" : `${station.dit} · ${cooks === 0 ? "no cook running" : `${cooks} cook${s(cooks)} running`}`,
    ...(sansCuisine && ailleurs.length === 0 ? { raison: raisonDe("sans-projet", nom) } : {}),
    survol: sansCuisine && ailleurs.length > 0 ? [survol, cuisinesAilleurs(ailleurs)].filter((partie) => partie !== "").join(" · ") : survol,
    ...(sansCuisine
      ? {
          note:
            ailleurs.length > 0
              ? `Normal: this computer drives your projects, whose kitchens run on ${[...new Set(ailleurs.map(({ station }) => station))].join(", ")} — giving it one would add a place for their cooks to run, nothing requires it.`
              : "Normal: a station that runs no kitchen simply waits — giving it a project would let it cook that project, nothing requires it.",
        }
      : {}),
  };
}

// --- La ligne de santé -------------------------------------------------------------

// L'état d'une des deux choses que la ligne dit : bon, en panne — et ce qui ne va pas, en une phrase —, ou pas su.
type Etat = { bon: true } | { panne: string[] } | { pas: string };

// Ce que les blocs `attend` des projets disent du jeton et de la session Max (runtime/src/attend.ts) : une entrée qui ne porte pas de ticket.
// Le bloc se lit en français ou en anglais (`token  for …`, #927).
function maxDesBlocs(blocs: readonly string[], maintenant: number): string[] {
  return blocs.flatMap((bloc) =>
    bloc.split("\n").flatMap((ligne) => {
      const [, quoi, dit = ""] = /^ {2}(jeton|token|session) {2}(?:depuis|for) \S.*? {2}(.*)$/.exec(ligne) ?? [];
      if (quoi === "session") return [/^(?:renouvellement|Max session renewal)/.test(dit) ? "Max: session renewal failed" : "Max: session about to expire"];
      if (quoi !== "jeton" && quoi !== "token") return [];
      if (/ÉCHU|EXPIRED/.test(dit)) return ["Max: token expired, to redo"];
      const [, echeance] = /(?:il échoit le|it expires on) (\S+?),? /.exec(dit) ?? [];
      const jours = echeance === undefined ? Number.NaN : Math.ceil((Date.parse(echeance) - maintenant) / 86_400_000);
      return [Number.isFinite(jours) ? `Max: token to redo within ${Math.max(jours, 0)} d` : "Max: token's expiry unknown"];
    }),
  );
}

function deMax(stations: readonly StationVue[] | undefined, blocs: readonly string[], maintenant: number): Etat {
  const perdues = (stations ?? []).filter(({ max }) => max === "perdue").map(({ nom }) => nom);
  const pannes = [...new Set([...(perdues.length === 0 ? [] : [`Max: connection lost on ${perdues.join(", ")}`]), ...maxDesBlocs(blocs, maintenant)])];
  if (pannes.length > 0) return { panne: pannes };
  if ((stations ?? []).some(({ max }) => max === "connectee")) return { bon: true };
  return { pas: stations === undefined ? "your stations are not read yet" : "no online station says how its Max connection is" };
}

// Ce qu'une lecture ratée sur GitHub dit, dans les mots de l'app : jamais ce que `gh` a répondu.
function commeGitHub(sans: string, limite: VuDesStations["limite"]): string {
  if (limite !== undefined || LIMITE.test(sans)) return `GitHub limits calls${limite?.reprise == null ? "" : `, back around ${heureCourte(limite.reprise)}`}`;
  if (/gave no answer within/.test(sans)) return "GitHub does not answer";
  if (/is not on this machine/.test(sans)) return "GitHub: its tool is missing on this computer";
  if (/auth|log ?in|credentials|HTTP 401/i.test(sans)) return "GitHub: this computer is not signed in";
  if (/error connecting|could not resolve|network|timeout/i.test(sans)) return "GitHub cannot be reached";
  return "GitHub could not be read";
}

function deGitHub(stations: VuDesStations | undefined, projets: VuDesProjets | undefined): Etat {
  if (stations === undefined) return { pas: "the first reading of your stations on GitHub is in progress" };
  const pannes = [...new Set([...(stations.sans === undefined ? [] : [commeGitHub(stations.sans, stations.limite)]), ...(projets?.sans === undefined ? [] : [commeGitHub(projets.sans, undefined)])])];
  return pannes.length === 0 ? { bon: true } : { panne: pannes };
}

export function sante(stations: VuDesStations | undefined, projets: VuDesProjets | undefined, blocs: readonly string[], maintenant: number): Sante {
  const etats = [["Max", deMax(stations?.stations, blocs, maintenant)], ["GitHub", deGitHub(stations, projets)]] as const;
  const dit = etats.flatMap(([nom, etat]) => ("bon" in etat ? [`${nom} ✓`] : "panne" in etat ? etat.panne : [`${nom} ?`])).join("  ·  ");
  const survol = [
    "Max: what your online stations publish of their connection, and what your projects' stations say of its token",
    "GitHub: your stations are read there every 30 s",
    ...etats.flatMap(([nom, etat]) => ("pas" in etat ? [`${nom} not checked: ${etat.pas}`] : [])),
  ].join("\n");
  const ton = etats.some(([, etat]) => "panne" in etat) ? "rouge" : etats.every(([, etat]) => "bon" in etat) ? "vert" : "gris";
  return { ton, dit, survol };
}

// --- Ce qui est tenu ---------------------------------------------------------------

// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas (un poste sur un téléphone).
export type OptionsAccueil = { projets: () => readonly ProjetDeLAccueil[]; locale?: () => string | null; maintenant?: () => number };

// Les dernières lectures de chaque projet et des stations, tenues par le process principal, et
// l'accueil qui s'en dessine. Chaque réception rend l'accueil à redessiner — rien, quand il dit la
// même chose qu'avant : rien ne bouge. Un `status` que plus rien ne rafraîchit est lâché : la
// ligne redit alors ce que `faits` seul en dit.
export function tenirAccueil({ projets, locale = () => null, maintenant = Date.now }: OptionsAccueil) {
  const faits = new Map<string, FaitsLus>();
  const statuts = new Map<string, StatusLu>();
  let stations: VuDesStations | undefined;
  let projetsDesStations: VuDesProjets | undefined;
  let dit: string | undefined;

  const vu = (): Accueil => {
    const liste = projets();
    const lus = liste.map(({ nom }) => faits.get(nom)).flatMap((lu) => (lu !== undefined && "faits" in lu ? [lu.faits] : []));
    const cooks = (station: string) => lus.reduce((total, { cooks = [] }) => total + cooks.filter((cook) => cook.station === station).length, 0);
    // Les projets ouverts ici dont la cuisine tourne sur une autre station : celle que le projet nomme principale, à défaut une autre qui le porte.
    const ailleursDe = (locale_: string): CuisineAilleurs[] =>
      liste.flatMap(({ nom }) => {
        const principale = projetsDesStations?.projets.find((projet) => projet.nom === nom)?.stations.find(({ principale: est, id }) => est && id !== locale_)?.nom;
        const portee = principale ?? stations?.stations.find(({ id, projets: portes }) => id !== locale_ && portes.includes(nom))?.nom;
        return portee === undefined ? [] : [{ projet: nom, station: portee }];
      });
    const ici = locale();
    const pleines = new Set([...statuts.values()].flatMap(({ texte }) => saturees(texte)));
    const plafonds = [...statuts.values()].map(({ texte }) => plafondsDe(texte));
    const retenues = [...statuts.values()].map(({ texte }) => retenuesDe(texte));
    // Ce que dit le premier projet lu qui nomme la station : un plafond se règle pour tous, et ils disent le même.
    const premier = <T>(dits: readonly Map<string, T>[], station: string) => dits.find((lus) => lus.has(station))?.get(station);
    // Les appels de la box à GitHub : ceux que publie le premier projet lu qui nomme la station et dont le runtime les donne.
    const appelsDe = (station: string): AppelsGithub | undefined => {
      for (const [nom, { texte }] of statuts) {
        const lu = faits.get(nom);
        if (lu !== undefined && "faits" in lu && lu.faits.appelsGithub !== undefined && plafondsDe(texte).has(station)) return lu.faits.appelsGithub;
      }
      return undefined;
    };
    const detail = (station: StationVue): Partial<LigneDeStation> => {
      const plafond = premier(plafonds, station.nom);
      const retenue = premier(retenues, station.nom);
      const appels = appelsDe(station.nom);
      return { ...(plafond === undefined ? {} : { plafond, reglable: true as const }), ...(retenue === undefined ? {} : { retenue }), ...(appels === undefined ? {} : { appels }) };
    };
    const plafondsDesProjets = Object.fromEntries(
      [...statuts].map(([nom, { texte }]) => {
        const retenuesDuProjet = retenuesDe(texte);
        return [nom, Object.fromEntries([...plafondsDe(texte)].map(([station, plafond]) => [station, { plafond, ...(retenuesDuProjet.has(station) ? { retenue: retenuesDuProjet.get(station) } : {}) }]))];
      }),
    );
    return {
      projets: liste.map((projet) => ligneDeProjet(projet, faits.get(projet.nom), statuts.get(projet.nom))),
      ...(Object.keys(plafondsDesProjets).length === 0 ? {} : { plafonds: plafondsDesProjets }),
      ...(stations === undefined ? {} : { stations: stations.stations.map((station) => ({ ...ligneDeStation(station, cooks(station.nom), pleines.has(station.nom), station.id === ici ? ailleursDe(station.id) : []), ...detail(station) })) }),
      sante: sante(
        stations,
        projetsDesStations,
        [...statuts.values()].flatMap(({ attend }) => (attend === undefined ? [] : [attend])),
        maintenant(),
      ),
    };
  };
  // L'accueil, s'il a changé depuis le dernier rendu.
  const change = (): Accueil | undefined => {
    const neuf = vu();
    const texte = JSON.stringify(neuf);
    if (texte === dit) return undefined;
    dit = texte;
    return neuf;
  };

  return {
    vu,
    // Les projets dont le `status` lu nomme le plafond de cette station : ce sont leurs box qui reçoivent son réglage.
    projetsDe: (station: string): string[] => [...statuts].filter(([, { texte }]) => plafondsDe(texte).has(station)).map(([nom]) => nom),
    // Le fichier des projets a changé : leurs lignes suivent.
    relire: change,
    // Une lecture de `faits`.
    faits(lecture: Lecture): Accueil | undefined {
      const { projet, a } = lecture;
      if ("erreur" in lecture) faits.set(projet, lecture.atteinte ? { a, illisible: true } : { a, injoignable: true });
      else {
        const lu = comprendre(lecture.sorties.find(({ commande }) => commande === FAITS)?.texte ?? "");
        faits.set(projet, "informe" in lu ? { a, illisible: true } : { a, faits: lu });
      }
      return change();
    },
    // Une lecture de `status`, son bloc `attend` mis à part. Ratée, elle ne dit plus rien.
    status(montree: Montree): Accueil | undefined {
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande }) => commande === "status")?.texte;
      if ("erreur" in montree || texte === undefined) statuts.delete(montree.projet);
      else statuts.set(montree.projet, { texte, ...(montree.attend === undefined ? {} : { attend: montree.attend }) });
      return change();
    },
    // La veille de `status` ne lit plus que ces projets : le `status` des autres n'est plus rafraîchi.
    veiller(lus: readonly string[]): Accueil | undefined {
      for (const projet of statuts.keys()) if (!lus.includes(projet)) statuts.delete(projet);
      return change();
    },
    // La barre est reposée : `faits` va être relu pour chacun.
    oublier(): Accueil | undefined {
      faits.clear();
      return change();
    },
    stations(lues: VuDesStations): Accueil | undefined {
      stations = lues;
      return change();
    },
    projetsDesStations(lus: VuDesProjets): Accueil | undefined {
      projetsDesStations = lus;
      return change();
    },
  };
}
