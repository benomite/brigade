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
// Une station : son état (« online », « offline for 12 min »), ce qu'elle fait — ses cooks,
// une mise à jour ratée, sa connexion Max perdue —, et les projets qu'elle porte. Sa machine et sa
// version ne se lisent qu'au survol.
//
// Ce module ne lance rien et ne demande rien de neuf à personne : il dit, d'après ce que les veilles
// ont déjà lu — `faits` de chaque projet, son `status` quand il est lu, les stations et leurs
// projets sur GitHub. Un état qui n'a pas été lu n'est jamais dit sain.
import { CONNECTION, KITCHEN, tetesDe } from "./alerts.ts";
import type { Montree } from "./awaiting.ts";
import type { Read } from "./box.ts";
import { COMMAND as FACTS, comprendre, estOutsideLine, type CallsGithub, type Facts } from "./facts.ts";
import { driftOf } from "./fiabilite.ts";
import { heure, heureCourte } from "./format.ts";
import type { VuDesProjects } from "./projects/projects.ts";
import { capsDe, type CapVu } from "./cap.ts";
import { raisonDe, type RaisonDeStation } from "./stations/raison.ts";
import { LIMIT, type StationVue, type VuDesStations } from "./stations/stations.ts";
import { blockedDe, ditALHome } from "./vue/rail-blocked/rail-blocked.ts";
import { enCours, MEME_RAISON, OUTAGES_OUTSIDE_PAUSE } from "./vue/pause-quota/line-de-la-pause.js";

// Les tons des pastilles de la peau (vue.css) : vert, jaune — l'orange de la maquette —, rouge, gris ; bleu, le calme de la
// pause de quota GitHub du compte (vue/pause-quota/, #3482).
export type Ton = "vert" | "jaune" | "rouge" | "gris" | "bleu";
// Une ligne de l'accueil : ce qu'elle dit, sa pastille, et ce qui se lit au survol.
// `attend` : combien de décisions attendent le chef, absent quand aucune (la pastille « N awaiting you » de l'accueil, #2912).
export type LineDeProject = { nom: string; ton: Ton; dit: string; survol: string; attend?: number };
// Une station a aussi `phrase` : son état en une phrase, en tête de sa page (#877) — « online · 2 cooks
// running », « offline for 12 min ». Ni sa machine, ni sa version, ni ses projets.
// `raison` : une station installée qui ne cuit pas encore dit pourquoi, en une phrase qui nomme le geste (stations/raison.ts, #1758).
// `note` : sous la phrase, une station en ligne qui ne fait la cuisine d'aucun projet dit en une phrase si c'est normal.
// `plafond` : ce que le `status` d'un projet dit de son plafond de cooks (cap.ts) ;
// `reglable` : un projet que l'app lit nomme son plafond, la page peut donc le régler.
export type LineDeStation = { id: string; nom: string; ton: Ton; dit: string; phrase: string; survol: string; note?: string; raison?: RaisonDeStation; plafond?: CapVu; reglable?: true; appels?: CallsGithub };
export type Sante = { ton: Ton; dit: string; survol: string };
// `stations` : absentes, la première lecture sur GitHub est en route.
// `plafonds` : par projet dont le `status` est lu, et par station qu'il nomme, le plafond de cooks de ce projet sur elle
// et ce qui la retient (ticket 1292) — la ligne de station de l'onglet Stations les dit et les règle.
export type CapsDeStation = { plafond: CapVu };
export type Home = { projets: LineDeProject[]; stations?: LineDeStation[]; sante: Sante; plafonds?: Record<string, Record<string, CapsDeStation>> };

// Un projet du fichier, tel que l'accueil le nomme : `servi` faux, aucune station ne le sert, et rien n'en est lu.
export type ProjectDeLHome = { nom: string; servi: boolean };
// Ce que la dernière lecture de `faits` a donné d'un projet : ses faits, une box qui n'a pas été
// jointe, ou une box jointe qui n'a pas rendu ce que l'app lit.
export type ReadFacts = { a: string } & ({ faits: Facts } | { injoignable: true } | { illisible: true });
// Le dernier `status` lu d'un projet, son bloc `attend` mis à part.
export type StatusLu = { texte: string; attend?: string };

const s = (combien: number) => (combien > 1 ? "s" : "");
// Une durée que la box écrit (runtime/src/etat.ts, `duree`) — « 40 s », « 12 min », « 3 h 05 », « 2 j » —, dans les mots de l'app.
const enAnglais = (duree: string) => duree.replace(/ j$/, " d");

// --- Un projet -------------------------------------------------------------------

// Ce qui retient la cuisine, d'après les lignes de tête de `status` (alerts.ts lit les mêmes).
function causes(status: string): string[] {
  return tetesDe(status).flatMap(({ titre, valeur }) => {
    if (KITCHEN.includes(titre) && /disjoncteur OUVERT|breaker OPEN/.test(valeur)) return ["breaker open"];
    if (titre === "stations") return ["no station declared"];
    if (CONNECTION.includes(titre)) return ["Max connection down"];
    if (titre === "setup" && /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u.test(valeur)) return ["project setup blocked"];
    return [];
  });
}
const baseRed = (status: string | undefined) => status !== undefined && tetesDe(status).some(({ titre, valeur }) => titre === "base" && /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u.test(valeur));
// Le ticket qui répare la base rouge, quand `status` le dit en tête (runtime/src/etat.ts, `RIEN_NE_CUIT`),
// en anglais ou en français (#928).
const reparation = (status: string | undefined): number | undefined => {
  const [, anglais, francais] = /^(?:nothing cooks: base red since .*, repair #(\d+) in progress|rien ne cuit : base rouge depuis .*, réparation #(\d+) en cours)$/m.exec(status ?? "") ?? [];
  const ticket = anglais ?? francais;
  return ticket === undefined ? undefined : Number(ticket);
};

// Ce qui bloque le projet, le plus grave d'abord : rien ne le débloque sans le chef.
function blockers(facts: Facts, status: string | undefined): string[] {
  const red = baseRed(status) ? [reparation(status) === undefined ? "base red" : `base red · #${reparation(status)} being repaired`] : [];
  switch (facts.etat) {
    case "éteinte":
      return ["runtime stopped", ...red];
    case "arrêtée":
      return ["kitchen stopped", ...red];
    case "retenue": {
      // Sans `status` lu, la cause n'est pas dite : la cuisine l'est, retenue.
      const lues = status === undefined ? [] : causes(status);
      return red.length + lues.length === 0 ? ["kitchen held"] : [...red, ...lues];
    }
    default:
      return red;
  }
}

// Depuis quand la plus ancienne décision attend le chef : la tête du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`),
// en français ou en anglais (`awaiting   2 decisions await the chef — the oldest for 3 d`, #927).
const depuis = (awaiting: string | undefined): string | undefined => {
  const [, duree] = /^(?:attend +\d+ décisions? attend(?:ent)? le chef(?: — la plus ancienne)? depuis|awaiting +\d+ decisions? awaits? the chef — (?:the oldest )?for) (.+)$/m.exec(awaiting ?? "") ?? [];
  return duree === undefined ? undefined : enAnglais(duree.trim());
};

// Ce qui attend le chef : combien de décisions, depuis quand ; et, quand toute la cuisine les attend, que rien ne cuit d'ici là.
function awaiting(facts: Facts, status: StatusLu | undefined): string[] {
  const combien = facts.compteurs.attend;
  if (combien === 0) return [];
  const duree = depuis(status?.attend);
  const dit = `${combien} decision${s(combien)} await${combien === 1 ? "s" : ""} you${duree === undefined ? "" : `, for ${duree}`}`;
  return [facts.urgence == null ? dit : `${dit} — nothing cooks until then`];
}

// Ce qui cuit : les tickets de ses cooks — la réparation de la base est déjà dite —, sinon ce qui est à la pass.
function cuit(facts: Facts, repare: number | undefined): string[] {
  const tickets = facts.cooks?.map(({ ticket }) => ticket).filter((ticket) => ticket !== repare);
  if (tickets === undefined) return facts.compteurs.auTravail > 0 ? [`${facts.compteurs.auTravail} at work`] : [];
  if (tickets.length > 2) return [`${tickets.length} cooks at work`];
  if (tickets.length > 0) return [`${tickets.map((ticket) => `#${ticket}`).join(" and ")} cooking`];
  return facts.compteurs.aLaPass > 0 ? [`${facts.compteurs.aLaPass} at the pass`] : [];
}

export function lineDeProject(project: ProjectDeLHome, lu: ReadFacts | undefined, status: StatusLu | undefined): LineDeProject {
  const { nom: name } = project;
  // Le rail bloqué (vue/rail-blocked/, #3358) : des tickets qu'aucun manager ne prend — aussi quand aucune station ne le
  // sert, puisque c'est sa cause. Il bloque le projet, en tête de sa ligne ; sa phrase entière au survol.
  // Pendant la pause de quota GitHub du compte (vue/pause-quota/, #3482), le projet dit seulement qu'il est en pause pour la
  // même raison, d'une pastille calme : son rail bloqué n'en est pas un — sauf une panne que la pause n'explique pas.
  const enPause = lu !== undefined && "faits" in lu && enCours(lu.faits.pauseQuota, Date.parse(lu.faits.lu));
  const blockedLu = lu !== undefined && "faits" in lu ? blockedDe(lu.faits.railBloque) : undefined;
  const railBlocked = enPause && blockedLu !== undefined && !OUTAGES_OUTSIDE_PAUSE.includes(blockedLu.cause) ? undefined : blockedLu;
  if (!project.servi && railBlocked === undefined) return { nom: name, ton: "gris", dit: "no station: nothing is read", survol: "no station serves this project yet — open it to see what is missing" };
  if (lu === undefined) return { nom: name, ton: "gris", dit: "first read in progress…", survol: "the app reads every project's station every 30 s" };
  if ("injoignable" in lu) return { nom: name, ton: "rouge", dit: "station unreachable", survol: `its station did not answer at ${heure(lu.a)} — the app tries again every 30 s; open it to see why` };
  if ("illisible" in lu) return { nom: name, ton: "gris", dit: "not read: its station does not answer as the app expects", survol: `tried at ${heure(lu.a)} — open it to see what its station returned` };
  const { faits: facts } = lu;
  const bloquant = [...(railBlocked === undefined ? [] : [ditALHome(railBlocked, Date.parse(facts.lu))]), ...blockers(facts, status?.texte)];
  const attendu = awaiting(facts, status);
  // La dérive se lit dans les lignes `drift` de `status` : un mot sur la ligne, ce qu'elle dit au survol.
  // Elle ne change pas la pastille — rien n'attend le chef, rien ne bloque.
  const drift = status === undefined ? [] : driftOf(status.texte);
  const enPauseOnly = enPause && bloquant.length === 0;
  const parties = [...bloquant, ...(enPauseOnly ? [MEME_RAISON] : []), ...attendu, ...cuit(facts, reparation(status?.texte))];
  const dit = parties.length === 0 ? "nothing cooking, nothing waits for you" : parties.join(" · ");
  return {
    nom: name,
    ton: bloquant.length > 0 ? "rouge" : attendu.length > 0 ? "jaune" : enPauseOnly ? "bleu" : "vert",
    dit: drift.length === 0 ? dit : `${dit} · drifting`,
    survol: `read at ${heure(lu.a)} — ${railBlocked === undefined ? "" : `${railBlocked.phrase} — `}${drift.length === 0 ? "" : `reliability drifting: ${drift.join(" · ")} — `}open it to act`,
    ...(facts.compteurs.attend > 0 ? { attend: facts.compteurs.attend } : {}),
  };
}

// --- Une station -----------------------------------------------------------------

// Un projet ouvert dans l'app dont la cuisine tourne sur une autre station : `station` la nomme.
export type KitchenElsewhere = { projet: string; station: string };

// Ce que la station dit des cuisines portées ailleurs, quand c'est l'ordinateur de l'app : « your 3 projects cook on parade-box ».
function kitchensElsewhere(ailleurs: readonly KitchenElsewhere[]): string {
  const stations = [...new Set(ailleurs.map(({ station }) => station))];
  return `your ${ailleurs.length === 1 ? "project cooks" : `${ailleurs.length} projects cook`} on ${stations.join(", ")}`;
}

export const NE_KITCHEN_PAS = "does not cook";

// La ligne d'une station qui ne cuisine pas : son état, et la mention. Jamais de cooks.
function lineDePhone(station: StationVue, survol: string): LineDeStation {
  const { id, nom: name } = station;
  const enLine = station.etat === "en-ligne";
  return {
    id,
    nom: name,
    ton: enLine ? "vert" : "gris",
    dit: [station.dit, NE_KITCHEN_PAS].join(" · "),
    ...(enLine ? {} : { raison: raisonDe("hors-ligne", name) }),
    phrase: `${station.dit} · ${NE_KITCHEN_PAS}`,
    survol,
    ...(enLine ? { note: "A phone: it runs no cook, and is never offered to run a project's cooks." } : {}),
  };
}

// `cooks` : ceux que les projets disent en cours sur elle ;
// `ailleurs` : si c'est l'ordinateur de l'app, ses projets ouverts dont la cuisine tourne sur une autre station.
export function lineDeStation(station: StationVue, cooks: number, ailleurs: readonly KitchenElsewhere[] = []): LineDeStation {
  const { id, nom: name } = station;
  const survol = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((partie) => partie !== "").join(" · ");
  const withoutKitchen = station.projets.length === 0;
  // Un téléphone (#1158) ne fait tourner aucun cook : sa ligne le dit, et il n'a aucun projet à attendre.
  if (station.cuisine === false) return lineDePhone(station, survol);
  const projects = withoutKitchen ? "no project" : station.projets.join(", ");
  if (station.etat !== "en-ligne") return { id, nom: name, ton: "gris", dit: [station.dit, ...(station.etat === "illisible" ? [] : [projects])].join(" · "), phrase: station.dit, raison: raisonDe(station.etat === "illisible" ? "illisible" : "hors-ligne", name), survol: survol === "" ? "its state on GitHub cannot be read — open it to see why" : survol };
  const max = station.pannes.some(({ sujet }) => sujet === "connexion-max");
  const update = station.pannes.some(({ sujet }) => sujet === "mise-a-jour");
  const fait = [...(max ? ["Max connection lost"] : []), ...(update ? ["update failed"] : []), ...(cooks > 0 ? [`${cooks} cook${s(cooks)}`] : [])];
  return {
    id,
    nom: name,
    ton: max ? "rouge" : update ? "jaune" : "vert",
    dit: [station.dit, ...(fait.length === 0 ? ["idle"] : fait), withoutKitchen ? "runs no kitchen" : projects].join(" · "),
    phrase: `${station.dit} · ${cooks === 0 ? "no cook running" : `${cooks} cook${s(cooks)} running`}`,
    ...(withoutKitchen && ailleurs.length === 0 ? { raison: raisonDe("sans-projet", name) } : {}),
    survol: withoutKitchen && ailleurs.length > 0 ? [survol, kitchensElsewhere(ailleurs)].filter((partie) => partie !== "").join(" · ") : survol,
    ...(withoutKitchen
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
type State = { bon: true } | { panne: string[] } | { pas: string };

// Ce que les blocs `attend` des projets disent du jeton et de la session Max (runtime/src/attend.ts) : une entrée qui ne porte pas de ticket.
// Le bloc se lit en français ou en anglais (`token  for …`, #927).
function maxDesBlocs(blocs: readonly string[], maintenant: number): string[] {
  return blocs.flatMap((bloc) =>
    bloc.split("\n").flatMap((line) => {
      const [, quoi, dit = ""] = /^ {2}(jeton|token|session) {2}(?:depuis|for) \S.*? {2}(.*)$/.exec(line) ?? [];
      if (quoi === "session") return [/^(?:renouvellement|Max session renewal)/.test(dit) ? "Max: session renewal failed" : "Max: session about to expire"];
      if (quoi !== "jeton" && quoi !== "token") return [];
      if (/ÉCHU|EXPIRED/.test(dit)) return ["Max: token expired, to redo"];
      const [, echeance] = /(?:il échoit le|it expires on) (\S+?),? /.exec(dit) ?? [];
      const jours = echeance === undefined ? Number.NaN : Math.ceil((Date.parse(echeance) - maintenant) / 86_400_000);
      return [Number.isFinite(jours) ? `Max: token to redo within ${Math.max(jours, 0)} d` : "Max: token's expiry unknown"];
    }),
  );
}

function deMax(stations: readonly StationVue[] | undefined, blocs: readonly string[], maintenant: number): State {
  const perdues = (stations ?? []).filter(({ max }) => max === "perdue").map(({ nom: name }) => name);
  const outages = [...new Set([...(perdues.length === 0 ? [] : [`Max: connection lost on ${perdues.join(", ")}`]), ...maxDesBlocs(blocs, maintenant)])];
  if (outages.length > 0) return { panne: outages };
  if ((stations ?? []).some(({ max }) => max === "connectee")) return { bon: true };
  return { pas: stations === undefined ? "your stations are not read yet" : "no online station says how its Max connection is" };
}

// Ce qu'une lecture ratée sur GitHub dit, dans les mots de l'app : jamais ce que `gh` a répondu.
function commeGitHub(sans: string, limit: VuDesStations["limite"]): string {
  if (limit !== undefined || LIMIT.test(sans)) return `GitHub limits calls${limit?.reprise == null ? "" : `, back around ${heureCourte(limit.reprise)}`}`;
  if (/gave no answer within/.test(sans)) return "GitHub does not answer";
  if (/is not on this computer/.test(sans)) return "GitHub: its tool is missing on this computer";
  if (/auth|log ?in|credentials|HTTP 401/i.test(sans)) return "GitHub: this computer is not signed in";
  if (/error connecting|could not resolve|network|timeout/i.test(sans)) return "GitHub cannot be reached";
  return "GitHub could not be read";
}

function deGitHub(stations: VuDesStations | undefined, projects: VuDesProjects | undefined): State {
  if (stations === undefined) return { pas: "the first reading of your stations on GitHub is in progress" };
  const outages = [...new Set([...(stations.sans === undefined ? [] : [commeGitHub(stations.sans, stations.limite)]), ...(projects?.sans === undefined ? [] : [commeGitHub(projects.sans, undefined)])])];
  return outages.length === 0 ? { bon: true } : { panne: outages };
}

export function sante(stations: VuDesStations | undefined, projects: VuDesProjects | undefined, blocs: readonly string[], maintenant: number): Sante {
  const states = [["Max", deMax(stations?.stations, blocs, maintenant)], ["GitHub", deGitHub(stations, projects)]] as const;
  const dit = states.flatMap(([name, state]) => ("bon" in state ? [`${name} ✓`] : "panne" in state ? state.panne : [`${name} ?`])).join("  ·  ");
  const survol = [
    "Max: what your online stations publish of their connection, and what your projects' stations say of its token",
    "GitHub: your stations are read there every 30 s",
    ...states.flatMap(([name, state]) => ("pas" in state ? [`${name} not checked: ${state.pas}`] : [])),
  ].join("\n");
  const ton = states.some(([, state]) => "panne" in state) ? "rouge" : states.every(([, state]) => "bon" in state) ? "vert" : "gris";
  return { ton, dit, survol };
}

// --- Ce qui est tenu ---------------------------------------------------------------

// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas (un poste sur un téléphone).
export type OptionsHome = { projets: () => readonly ProjectDeLHome[]; locale?: () => string | null; maintenant?: () => number };

// Les dernières lectures de chaque projet et des stations, tenues par le process principal, et
// l'accueil qui s'en dessine. Chaque réception rend l'accueil à redessiner — rien, quand il dit la
// même chose qu'avant : rien ne bouge. Un `status` que plus rien ne rafraîchit est lâché : la
// ligne redit alors ce que `faits` seul en dit.
export function holdHome({ projets: projects, locale = () => null, maintenant = Date.now }: OptionsHome) {
  const facts = new Map<string, ReadFacts>();
  const statuts = new Map<string, StatusLu>();
  let stations: VuDesStations | undefined;
  let projectsDesStations: VuDesProjects | undefined;
  let dit: string | undefined;

  const vu = (): Home => {
    const liste = projects();
    const lus = liste.map(({ nom: name }) => facts.get(name)).flatMap((lu) => (lu !== undefined && "faits" in lu ? [lu.faits] : []));
    const cooks = (station: string) => lus.reduce((total, { cooks = [] }) => total + cooks.filter((cook) => cook.station === station).length, 0);
    // Les projets ouverts ici dont la cuisine tourne sur une autre station : celle qui porte son suivi, à défaut une autre qui le porte.
    const ailleursDe = (locale_: string): KitchenElsewhere[] =>
      liste.flatMap(({ nom: name }) => {
        const suivie = projectsDesStations?.projets.find((project) => project.nom === name)?.suiviPar;
        const portee = (suivie !== undefined && suivie.id !== locale_ ? suivie.nom : undefined) ?? stations?.stations.find(({ id, projets: doors }) => id !== locale_ && doors.includes(name))?.nom;
        return portee === undefined ? [] : [{ projet: name, station: portee }];
      });
    const ici = locale();
    const caps = [...statuts.values()].map(({ texte }) => capsDe(texte));
    // Ce que dit le premier projet lu qui nomme la station : un plafond se règle pour tous, et ils disent le même.
    const first = <T>(dits: readonly Map<string, T>[], station: string) => dits.find((lus) => lus.has(station))?.get(station);
    // Les appels de la box à GitHub : ceux que publie le premier projet lu qui nomme la station et dont le runtime les donne.
    const callsDe = (station: string): CallsGithub | undefined => {
      for (const [name, { texte }] of statuts) {
        const lu = facts.get(name);
        if (lu !== undefined && "faits" in lu && lu.faits.appelsGithub !== undefined && capsDe(texte).has(station)) return lu.faits.appelsGithub;
      }
      return undefined;
    };
    const detail = (station: StationVue): Partial<LineDeStation> => {
      const cap = first(caps, station.nom);
      const calls = callsDe(station.nom);
      return { ...(cap === undefined ? {} : { plafond: cap, reglable: true as const }), ...(calls === undefined ? {} : { appels: calls }) };
    };
    const capsDesProjects = Object.fromEntries(
      [...statuts].map(([name, { texte }]) => [name, Object.fromEntries([...capsDe(texte)].map(([station, cap]) => [station, { plafond: cap }]))]),
    );
    return {
      projets: liste.map((project) => lineDeProject(project, facts.get(project.nom), statuts.get(project.nom))),
      ...(Object.keys(capsDesProjects).length === 0 ? {} : { plafonds: capsDesProjects }),
      ...(stations === undefined ? {} : { stations: stations.stations.map((station) => ({ ...lineDeStation(station, cooks(station.nom), station.id === ici ? ailleursDe(station.id) : []), ...detail(station) })) }),
      sante: sante(
        stations,
        projectsDesStations,
        [...statuts.values()].flatMap(({ attend: awaiting }) => (awaiting === undefined ? [] : [awaiting])),
        maintenant(),
      ),
    };
  };
  // L'accueil, s'il a changé depuis le dernier rendu.
  const change = (): Home | undefined => {
    const neuf = vu();
    const texte = JSON.stringify(neuf);
    if (texte === dit) return undefined;
    dit = texte;
    return neuf;
  };

  return {
    vu,
    // Les projets dont le `status` lu nomme le plafond de cette station : ce sont leurs box qui reçoivent son réglage.
    projetsDe: (station: string): string[] => [...statuts].filter(([, { texte }]) => capsDe(texte).has(station)).map(([name]) => name),
    // Le fichier des projets a changé : leurs lignes suivent.
    relire: change,
    // Une lecture de `faits`.
    // Hors ligne (#1818), la ligne garde ce qui a été lu en dernier : sa station n'y est pour rien.
    faits(read: Read): Home | undefined {
      const { projet: project, a } = read;
      if (estOutsideLine(read)) return undefined;
      if ("erreur" in read) facts.set(project, read.atteinte ? { a, illisible: true } : { a, injoignable: true });
      else {
        const lu = comprendre(read.sorties.find(({ commande: command }) => command === FACTS)?.texte ?? "");
        facts.set(project, "informe" in lu ? { a, illisible: true } : { a, faits: lu });
      }
      return change();
    },
    // Une lecture de `status`, son bloc `attend` mis à part. Ratée, elle ne dit plus rien ; hors ligne, rien n'en change (#1818).
    status(montree: Montree): Home | undefined {
      if (estOutsideLine(montree)) return undefined;
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande: command }) => command === "status")?.texte;
      if ("erreur" in montree || texte === undefined) statuts.delete(montree.projet);
      else statuts.set(montree.projet, { texte, ...(montree.attend === undefined ? {} : { attend: montree.attend }) });
      return change();
    },
    // La veille de `status` ne lit plus que ces projets : le `status` des autres n'est plus rafraîchi.
    veiller(lus: readonly string[]): Home | undefined {
      for (const project of statuts.keys()) if (!lus.includes(project)) statuts.delete(project);
      return change();
    },
    // La barre est reposée : `faits` va être relu pour chacun.
    oublier(): Home | undefined {
      facts.clear();
      return change();
    },
    stations(lues: VuDesStations): Home | undefined {
      stations = lues;
      return change();
    },
    projetsDesStations(lus: VuDesProjects): Home | undefined {
      projectsDesStations = lus;
      return change();
    },
  };
}
