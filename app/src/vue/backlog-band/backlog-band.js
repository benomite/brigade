// @ts-check
// Le bandeau Backlog (ticket 3460, épique 3459) : au-dessus des colonnes du rail, une seule ligne, dessinée comme les bons
// pendus au-dessus du passe — pas comme une colonne, ni comme les cartes du rail. Un élément du backlog est un besoin (une
// épique, une idée, une décision à prendre), pas un ticket : un besoin se découpe en tickets.
//   - Une étiquette par besoin ouvert hors du rail : sa priorité, un titre court, puis, découpé, son avancement servis/total
//     (`7/25`) ; sinon son état en mots simples (`to split`, `not read yet`). Ceux qui attendent le chef sont rouges et
//     viennent d'abord ; les autres suivent, par priorité.
//   - La ligne ne coupe jamais une étiquette : ce qui ne tient pas se compte au bout, `+N`. Sur un écran étroit, elle défile
//     de côté (vue.css, la page étroite).
//   - Un clic sur une étiquette déplie le détail du besoin : son contexte, ses tickets comptés par étape, le lien de son
//     issue — et, s'il attend le chef, sa carte de TODO, la question et le bouton qui y répond. Ses tickets ressortent dans
//     le rail, les autres cartes s'effacent (`marquerLeRail`). Un second clic, ou un clic sur une autre, finit la sélection.
//   - Un clic sur le titre déplie tout le backlog en liste, pour le chef (ticket 3589) : « Next », ce qui vient ensuite dans
//     l'ordre où la cuisine le servira, puis « Ideas in reserve », chacune avec son résumé, « Put on the rail » et « Drop » ;
//     ce qui a été servi, replié en bas. Ce qui attend le chef n'y est pas (il est dans TODO), ni aucun mot du manager ; un
//     clic sur une ligne ouvre son issue. Un second clic sur le titre replie le bandeau sur sa ligne.
//   - Un besoin découpé dont tous les tickets sont servis reste 24 h, marqué servi, puis quitte le bandeau.
// Tout ce qu'il dit vient de la lecture de ce qui est avant le rail (amont.ts) et des colonnes du rail (faits.ts) : rien
// n'est deviné. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { poserAvancement, progresDuBesoin } from "../backlog/avancement.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../amont.ts").Vu} Vu */
/** @typedef {import("../../amont.ts").Issue} Issue */
/** @typedef {import("../../faits.ts").Carte} Carte */
/** @typedef {{ nom: string, cartes: Carte[] }} ColonneLue */
/** @typedef {{ nom: string, nombre: number }} Etape */
/**
 * Un besoin tel que le bandeau le pose.
 * `rouge` : il attend le chef — sa carte est dans TODO (`carte`). `progres` : découpé, ses tickets servis sur leur
 * total. `servi` : découpé, tous servis ; `servieLe`, l'heure où son issue s'est fermée, nulle tant qu'elle est ouverte. `tickets` : ceux de son découpage. `etapes` : ses tickets comptés par étape, découpé seulement.
 * @typedef {{ ticket: number, titre: string, court: string, priorite: number | null, etat: string, groupe: string, mot: string, dit: string, contexte: string | undefined, ouvrable: boolean, rouge: boolean, carte: Carte | undefined, progres: { servis: number, total: number } | null, servi: boolean, servieLe: number | null, tickets: number[], etapes: Etape[] }} Besoin
 */

// La liste TODO des faits, où le chef a quelque chose à trancher (faits.ts, `T_ATTEND`) : la vue en pose les cartes en rouge
// dans la colonne de leur étape (ticket 3458).
export const COLONNE_DU_CHEF = "Awaiting you";
// Un besoin découpé tout servi reste ce temps dans le bandeau, depuis la fermeture de son issue.
export const RETENUE_MS = 24 * 3_600_000;
// Un titre plus long se coupe à un mot, au plus à cette longueur : l'étiquette tient sur sa ligne. Le titre entier est au
// survol.
const TITRE_COURT = 20;

// Les étapes d'un ticket, dans l'ordre du rail (faits.ts) : la colonne où sa carte est, et son nom dans le détail.
const ETAPES = [
  { colonne: "On the rail", nom: "on the rail" },
  { colonne: "Taken", nom: "taken" },
  { colonne: "Pass", nom: "pass" },
  { colonne: COLONNE_DU_CHEF, nom: "awaiting you" },
  { colonne: "Waiting", nom: "WAITING" },
  { colonne: "Served", nom: "served" },
];
// Un ticket ouvert qu'aucune colonne ne porte : né du découpage, `fire` pas encore posé.
const PAS_SUR_LE_RAIL = "not on the rail yet";
// L'état d'un besoin pas découpé, en mots simples, sur son étiquette.
/** @type {Record<string, string>} */
const MOTS = {
  "non-lue": "not read yet",
  incomplete: "incomplete",
  epique: "to split",
  prete: "ready",
  "mise-de-cote": "set aside",
  decoupee: "split",
  servie: "served",
  idee: "idea",
};
const ATTEND = "awaits you";
// Ce qui a été servi, replié en bas de la liste : les plus récents seulement, tant que le chef ne le déplie pas.
export const SERVIS_REPLIES = 3;

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} [texte] */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

/** @param {string} titre */
export function titreCourt(titre) {
  if (titre.length <= TITRE_COURT) return titre;
  const coupe = titre.slice(0, TITRE_COURT);
  const mot = coupe.lastIndexOf(" ");
  return `${(mot > TITRE_COURT / 2 ? coupe.slice(0, mot) : coupe).trimEnd()}…`;
}

/** @param {number | null} priorite */
const prioDe = (priorite) => (priorite === null ? "no prio" : `prio:${priorite}`);

/**
 * Les besoins du bandeau, dans son ordre : ceux qui attendent le chef d'abord, puis les autres, chacun par priorité — sans
 * priorité en dernier, à égalité le plus ancien d'abord. Un besoin tout servi fermé depuis 24 h ou plus n'y est plus.
 * Rien tant que ce qui est avant le rail n'est pas lu.
 * @param {Vu | undefined} vu @param {readonly ColonneLue[]} colonnes @param {number} maintenant
 * @returns {Besoin[]}
 */
export function besoinsDuBacklog(vu, colonnes, maintenant) {
  if (vu === undefined || !("groupes" in vu)) return [];
  /** @type {Map<number, string>} */
  const colonneDe = new Map();
  for (const { nom, cartes } of colonnes) for (const { ticket } of cartes) if (!colonneDe.has(ticket)) colonneDe.set(ticket, nom);
  const duChef = new Map((colonnes.find(({ nom }) => nom === COLONNE_DU_CHEF)?.cartes ?? []).map((carte) => [carte.ticket, carte]));
  const besoins = vu.groupes.flatMap(({ etat, nom: groupe, issues }) =>
    issues.flatMap((issue) => {
      const servieLe = issue.servieLe === undefined ? Number.NaN : Date.parse(issue.servieLe);
      if (maintenant - servieLe >= RETENUE_MS) return [];
      const tickets = issue.tickets ?? [];
      const servis = new Set(issue.servis ?? []);
      /** @type {Map<string, number>} */
      const comptes = new Map();
      for (const ticket of tickets) {
        const colonne = colonneDe.get(ticket);
        const nom = ETAPES.find((etape) => etape.colonne === colonne)?.nom ?? (servis.has(ticket) ? "served" : PAS_SUR_LE_RAIL);
        comptes.set(nom, (comptes.get(nom) ?? 0) + 1);
      }
      const etapes = tickets.length === 0 ? [] : [...ETAPES.map(({ nom }) => ({ nom, nombre: comptes.get(nom) ?? 0 })), ...(comptes.has(PAS_SUR_LE_RAIL) ? [{ nom: PAS_SUR_LE_RAIL, nombre: comptes.get(PAS_SUR_LE_RAIL) ?? 0 }] : [])];
      // La liste de cases à cocher de son issue d'abord, s'il en porte une (backlog/avancement.js, ticket 3480).
      const progres = progresDuBesoin(issue, tickets.length === 0 ? null : { servis: comptes.get("served") ?? 0, total: tickets.length });
      const carte = duChef.get(issue.ticket);
      /** @type {Besoin} */
      const besoin = {
        ticket: issue.ticket,
        titre: issue.titre,
        court: titreCourt(issue.titre),
        priorite: issue.priorite,
        etat,
        groupe,
        mot: MOTS[etat] ?? etat,
        dit: issue.dit,
        contexte: issue.contexte,
        ouvrable: issue.ouvrable,
        rouge: carte !== undefined,
        carte,
        progres,
        servi: progres !== null && progres.servis === progres.total,
        servieLe: Number.isNaN(servieLe) ? null : servieLe,
        tickets,
        etapes,
      };
      return [besoin];
    }),
  );
  /** @param {Besoin} besoin */
  const rang = (besoin) => (besoin.rouge ? 0 : 1);
  return besoins.sort((a, b) => rang(a) - rang(b) || (a.priorite ?? Infinity) - (b.priorite ?? Infinity) || a.ticket - b.ticket);
}

/**
 * Le nombre d'étiquettes rouges du bandeau : les besoins qui attendent le chef. C'est ce que l'entrée TODO (N) compte
 * (ticket 3458), et ce que le titre du bandeau dit.
 * @param {Vu | undefined} vu @param {readonly ColonneLue[]} colonnes @param {number} maintenant
 */
export function rougesDuBacklog(vu, colonnes, maintenant) {
  return besoinsDuBacklog(vu, colonnes, maintenant).filter(({ rouge }) => rouge).length;
}

/**
 * Combien d'étiquettes, dans l'ordre, tiennent sur la ligne sans en couper une : toutes si elles tiennent ; sinon autant
 * qu'il en tient avec le `+N` au bout.
 * @param {readonly number[]} largeurs la largeur de chaque étiquette @param {number} place la largeur de la ligne
 * @param {number} largeurPlus celle du `+N` @param {number} ecart l'espace entre deux éléments
 */
export function combienTiennent(largeurs, place, largeurPlus, ecart) {
  /** @param {number} n */
  const somme = (n) => largeurs.slice(0, n).reduce((total, largeur) => total + largeur, 0) + ecart * Math.max(0, n - 1);
  if (somme(largeurs.length) <= place) return largeurs.length;
  let n = largeurs.length - 1;
  while (n > 0 && somme(n) + ecart + largeurPlus > place) n--;
  return n;
}

/**
 * Ce que le bandeau reçoit de la vue.
 * `selection` : le besoin choisi, son détail déplié ; `deplie` : la liste entière dépliée ; `rouges` : combien t'attendent
 * (`rougesDuBacklog`), que le titre dit. `servisDeplies` : ce qui a été servi, déplié en entier au bas de la liste ;
 * `idees` : le geste d'une idée en route (`envoi`), ou pourquoi il n'est pas passé (`refus`), par issue.
 * @typedef {{ envoi: "rail" | "abandonner" } | { refus: string }} GesteDIdee
 * @typedef {{ vu: Vu | undefined, besoins: Besoin[], selection: number | undefined, deplie: boolean, rouges: number, servisDeplies?: boolean, idees?: ReadonlyMap<number, GesteDIdee> }} Etat
 * @typedef {{ choisir: (ticket: number) => void, basculer: () => void, ouvrirIssue: (ticket: number) => void, carteDuChef: (carte: Carte) => any, basculerServis: () => void, idee: (ticket: number, id: "rail" | "abandonner") => void }} Gestes
 */

/** @param {Fabrique} doc @param {Besoin} besoin @param {boolean} choisi @param {Gestes} gestes */
function etiquette(doc, besoin, choisi, gestes) {
  const tag = noeud(doc, "button", "backlog-tag");
  tag.type = "button";
  tag.dataset.ticket = String(besoin.ticket);
  if (besoin.rouge) tag.dataset.rouge = "";
  if (besoin.servi) tag.dataset.servi = "";
  tag.ariaPressed = String(choisi);
  tag.title = `#${besoin.ticket} ${besoin.titre} — ${besoin.rouge ? `${ATTEND} — ` : ""}${besoin.dit}`;
  tag.append(noeud(doc, "span", "backlog-tag-prio", prioDe(besoin.priorite)), noeud(doc, "span", "backlog-tag-titre", besoin.court), besoin.progres === null ? noeud(doc, "span", "backlog-tag-etat", besoin.rouge ? ATTEND : besoin.mot) : poserAvancement(doc, besoin.progres));
  tag.addEventListener("click", () => gestes.choisir(besoin.ticket));
  return tag;
}

/** @param {Fabrique} doc @param {Besoin} besoin @param {Gestes} gestes */
function detail(doc, besoin, gestes) {
  const pose = noeud(doc, "section", "backlog-band-detail");
  pose.ariaLabel = `#${besoin.ticket} ${besoin.titre}`;
  if (besoin.rouge) pose.dataset.rouge = "";
  const tete = noeud(doc, "header", "backlog-band-detail-tete");
  const numero = noeud(doc, "span", "backlog-band-numero", `#${besoin.ticket}`);
  tete.append(numero, noeud(doc, "strong", "backlog-band-detail-titre", besoin.titre), noeud(doc, "span", "backlog-band-detail-prio", prioDe(besoin.priorite)));
  if (besoin.ouvrable) {
    const lien = noeud(doc, "button", "backlog-band-issue", `open issue #${besoin.ticket}`);
    lien.type = "button";
    lien.title = `open issue #${besoin.ticket} in the browser`;
    lien.addEventListener("click", () => gestes.ouvrirIssue(besoin.ticket));
    tete.append(lien);
  }
  pose.append(tete, noeud(doc, "p", "backlog-band-contexte", besoin.contexte ?? "no context written on its issue"));
  if (besoin.etapes.length === 0) pose.append(noeud(doc, "p", "backlog-band-dit", besoin.dit));
  else {
    const etapes = noeud(doc, "ul", "backlog-band-etapes");
    etapes.ariaLabel = `its ${besoin.progres?.total ?? 0} tickets, by stage`;
    for (const { nom, nombre } of besoin.etapes) {
      const etape = noeud(doc, "li", "backlog-band-etape");
      if (nombre === 0) etape.dataset.zero = "";
      etape.append(noeud(doc, "span", "backlog-band-etape-nom", nom), noeud(doc, "strong", "backlog-band-etape-nombre", String(nombre)));
      etapes.append(etape);
    }
    pose.append(etapes);
  }
  // Ce qui attend le chef : sa carte de TODO, telle que le rail la pose en rouge — la question et son bouton.
  if (besoin.carte !== undefined) {
    const carte = noeud(doc, "div", "backlog-band-question");
    carte.append(gestes.carteDuChef(besoin.carte));
    pose.append(carte);
  }
  return pose;
}

/** @param {Besoin} besoin */
const estServi = (besoin) => besoin.servi || besoin.etat === "servie";

/** @param {Fabrique} doc @param {string} cle @param {string} nom @param {number} compte */
function section(doc, cle, nom, compte) {
  const pose = noeud(doc, "section", "backlog-band-section");
  pose.dataset.section = cle;
  const titre = noeud(doc, "h5", "backlog-band-section-titre");
  titre.append(noeud(doc, "span", "backlog-band-section-nom", nom), noeud(doc, "span", "backlog-band-section-compte", String(compte)));
  pose.append(titre);
  return { pose, titre };
}

// Une ligne qui ouvre l'issue d'un clic : son titre, puis ce que `morceaux` ajoute. Sans adresse https, elle ne s'ouvre pas.
/** @param {Fabrique} doc @param {Besoin} besoin @param {any[]} morceaux @param {Gestes} gestes */
function ouvrable(doc, besoin, morceaux, gestes) {
  const bouton = noeud(doc, "button", "backlog-band-ouvrir");
  bouton.type = "button";
  bouton.dataset.ticket = String(besoin.ticket);
  bouton.title = `#${besoin.ticket} ${besoin.titre} — open its issue`;
  bouton.disabled = !besoin.ouvrable;
  bouton.append(...morceaux);
  bouton.addEventListener("click", () => gestes.ouvrirIssue(besoin.ticket));
  return bouton;
}

/** @param {Fabrique} doc @param {Besoin} besoin @param {Gestes} gestes */
function ligneSuivante(doc, besoin, gestes) {
  const ligne = noeud(doc, "li", "backlog-band-ligne");
  ligne.append(
    ouvrable(
      doc,
      besoin,
      [
        noeud(doc, "span", "backlog-tag-prio", prioDe(besoin.priorite)),
        noeud(doc, "span", "backlog-band-ligne-titre", besoin.titre),
        ...(besoin.progres === null ? [] : [noeud(doc, "span", "backlog-band-ligne-etat", `${besoin.progres.servis}/${besoin.progres.total} served`)]),
      ],
      gestes,
    ),
  );
  return ligne;
}

/** @param {Fabrique} doc @param {Besoin} besoin @param {GesteDIdee | undefined} geste @param {Gestes} gestes */
function ligneDIdee(doc, besoin, geste, gestes) {
  const ligne = noeud(doc, "li", "backlog-band-ligne backlog-band-idee");
  const resume = noeud(doc, "span", "backlog-band-resume", besoin.contexte ?? "");
  if (besoin.contexte !== undefined) resume.title = besoin.contexte;
  const actions = noeud(doc, "span", "backlog-band-idee-actions");
  const envoi = geste !== undefined && "envoi" in geste ? geste.envoi : undefined;
  for (const [id, libelle, enCours] of /** @type {const} */ ([
    ["rail", "Put on the rail", "putting on the rail…"],
    ["abandonner", "Drop", "dropping…"],
  ])) {
    const bouton = noeud(doc, "button", "backlog-band-idee-geste", envoi === id ? enCours : libelle);
    bouton.type = "button";
    bouton.dataset.geste = id;
    bouton.title = id === "rail" ? `put #${besoin.ticket} on the rail: the manager reads it at its next wake-up` : `drop #${besoin.ticket}: its issue is closed as not planned`;
    bouton.disabled = envoi !== undefined;
    bouton.addEventListener("click", () => gestes.idee(besoin.ticket, id));
    actions.append(bouton);
  }
  ligne.append(ouvrable(doc, besoin, [noeud(doc, "span", "backlog-band-ligne-titre", besoin.titre), resume], gestes), actions);
  if (geste !== undefined && "refus" in geste) ligne.append(noeud(doc, "p", "backlog-band-idee-refus", geste.refus));
  return ligne;
}

/**
 * Le backlog déplié, pour le chef (ticket 3589) : ce qui vient ensuite, dans l'ordre où la cuisine le servira — `prio:1`, `prio:2`,
 * `prio:3`, puis sans priorité —, puis les idées en réserve, chacune avec son résumé et ses deux gestes ; ce qui a été servi,
 * replié en bas sur les plus récents. Ce qui attend le chef n'y est pas : il est dans TODO. Aucun mot du manager sur les
 * lignes (calibrage, `fire`, `not read yet`) : un clic ouvre l'issue, où ils restent.
 * @param {Fabrique} doc @param {Besoin[]} besoins @param {{ servisDeplies: boolean, idees: ReadonlyMap<number, GesteDIdee> }} etat @param {Gestes} gestes
 */
function listeEntiere(doc, besoins, { servisDeplies, idees }, gestes) {
  const liste = noeud(doc, "div", "backlog-band-liste");
  const siens = besoins.filter(({ rouge }) => !rouge);
  const suivants = siens.filter((besoin) => besoin.etat !== "idee" && !estServi(besoin));
  const reserve = siens.filter((besoin) => besoin.etat === "idee");
  // Les plus récents d'abord : un besoin tout servi encore ouvert, puis par fermeture, la dernière d'abord.
  const servis = siens.filter((besoin) => besoin.etat !== "idee" && estServi(besoin)).sort((a, b) => (b.servieLe ?? Infinity) - (a.servieLe ?? Infinity) || a.ticket - b.ticket);

  const { pose: suite } = section(doc, "suite", "Next", suivants.length);
  const lignes = noeud(doc, "ol", "backlog-band-lignes");
  lignes.append(...suivants.map((besoin) => ligneSuivante(doc, besoin, gestes)));
  suite.append(suivants.length === 0 ? noeud(doc, "p", "backlog-band-rien", "nothing next before the rail") : lignes);

  const { pose: enReserve } = section(doc, "idees", "Ideas in reserve", reserve.length);
  const lignesDIdees = noeud(doc, "ol", "backlog-band-lignes");
  lignesDIdees.append(...reserve.map((besoin) => ligneDIdee(doc, besoin, idees.get(besoin.ticket), gestes)));
  enReserve.append(reserve.length === 0 ? noeud(doc, "p", "backlog-band-rien", "no idea in reserve") : lignesDIdees);
  liste.append(suite, enReserve);

  if (servis.length > 0) {
    const { pose: servi, titre } = section(doc, "servis", "Served", servis.length);
    const plie = !servisDeplies && servis.length > SERVIS_REPLIES;
    if (servis.length > SERVIS_REPLIES) {
      const bascule = noeud(doc, "button", "backlog-band-servis-bascule", plie ? `show all ${servis.length}` : "show the most recent only");
      bascule.type = "button";
      bascule.ariaExpanded = String(!plie);
      bascule.addEventListener("click", gestes.basculerServis);
      titre.append(bascule);
    }
    const lignesServies = noeud(doc, "ol", "backlog-band-lignes");
    lignesServies.append(...(plie ? servis.slice(0, SERVIS_REPLIES) : servis).map((besoin) => ligneSuivante(doc, besoin, gestes)));
    servi.append(lignesServies);
    liste.append(servi);
  }
  return liste;
}

/**
 * Le bandeau entier — ou null tant que ce qui est avant le rail n'est pas lu, ou qu'une lecture fraîche ne le porte pas.
 * Une lecture ratée le dit sur la ligne, sa raison au survol : ce n'est jamais « rien avant le rail ».
 * @param {Fabrique} doc @param {Etat} etat @param {Gestes} gestes
 */
export function poserBandeauBacklog(doc, { vu, besoins, selection, deplie, rouges, servisDeplies = false, idees = new Map() }, gestes) {
  if (vu === undefined || "nonPublie" in vu) return null;
  const bandeau = noeud(doc, "section", "backlog-band");
  bandeau.ariaLabel = "Backlog: the needs before the rail";
  const choisi = besoins.find(({ ticket }) => ticket === selection);
  if (deplie || choisi !== undefined) bandeau.dataset.deplie = "";
  const ligne = noeud(doc, "div", "backlog-band-rang");
  const titre = noeud(doc, "button", "backlog-band-titre");
  titre.type = "button";
  titre.ariaExpanded = String(deplie);
  titre.append(noeud(doc, "span", "backlog-band-nom", "Backlog"));
  ligne.append(titre);
  bandeau.append(ligne);
  if ("sans" in vu) {
    titre.disabled = true;
    const dit = noeud(doc, "span", "backlog-band-vide", "not read");
    dit.title = vu.sans;
    ligne.append(dit);
    return bandeau;
  }
  titre.title = `${vu.survol} — ${deplie ? "fold the backlog" : "unfold the whole backlog"}`;
  titre.addEventListener("click", gestes.basculer);
  titre.append(noeud(doc, "strong", "backlog-band-compte", String(besoins.length)));
  if (rouges > 0) titre.append(noeud(doc, "span", "backlog-band-rouges", `${rouges} ${ATTEND.replace("awaits", rouges === 1 ? "awaits" : "await")}`));
  if (besoins.length === 0) {
    ligne.append(noeud(doc, "span", "backlog-band-vide", "nothing before the rail"));
    return bandeau;
  }
  const tags = noeud(doc, "ol", "backlog-band-tags");
  for (const besoin of besoins) {
    const pendu = noeud(doc, "li", "backlog-band-pendu");
    pendu.append(etiquette(doc, besoin, besoin.ticket === selection, gestes));
    tags.append(pendu);
  }
  // Le `+N` : caché tant que tout tient — `ajusterLeBandeau` le montre et le compte. Il déplie la liste entière.
  const plus = noeud(doc, "li", "backlog-band-pendu backlog-band-reste");
  plus.hidden = true;
  const bouton = noeud(doc, "button", "backlog-band-plus");
  bouton.type = "button";
  bouton.addEventListener("click", () => {
    if (!deplie) gestes.basculer();
  });
  plus.append(bouton);
  tags.append(plus);
  ligne.append(tags);
  if (choisi !== undefined) bandeau.append(detail(doc, choisi, gestes));
  if (deplie) bandeau.append(listeEntiere(doc, besoins, { servisDeplies, idees }, gestes));
  return bandeau;
}

/**
 * Le bandeau posé dans la page : les étiquettes qui ne tiennent pas sur sa ligne se cachent, entières, et le `+N` les
 * compte. Sur un écran étroit, toutes restent : la ligne défile de côté. Sans mise en page à mesurer — un document sans
 * rendu, ou un rail pas encore affiché, sans largeur —, toutes restent.
 * @param {any} bandeau @param {boolean} etroit
 */
export function ajusterLeBandeau(bandeau, etroit) {
  const tags = bandeau?.querySelector?.(".backlog-band-tags");
  if (tags === null || tags === undefined || typeof tags.getBoundingClientRect !== "function") return;
  const pendus = /** @type {any[]} */ ([...tags.children]);
  const plus = pendus.pop();
  for (const pendu of pendus) pendu.hidden = false;
  plus.hidden = true;
  const place = tags.getBoundingClientRect().width;
  if (etroit || !(place > 0)) return;
  const largeurs = pendus.map((pendu) => pendu.getBoundingClientRect().width);
  const ecart = Number.parseFloat(globalThis.getComputedStyle?.(tags).columnGap ?? "0") || 0;
  plus.hidden = false;
  plus.firstElementChild.textContent = `+${pendus.length}`;
  const largeurPlus = plus.getBoundingClientRect().width;
  const tiennent = combienTiennent(largeurs, place, largeurPlus, ecart);
  pendus.forEach((pendu, rang) => {
    pendu.hidden = rang >= tiennent;
  });
  const reste = pendus.length - tiennent;
  plus.hidden = reste === 0;
  plus.firstElementChild.textContent = `+${reste}`;
  plus.firstElementChild.title = `${reste} more need${reste === 1 ? "" : "s"} — unfold the whole backlog`;
}

/**
 * Le besoin choisi dans le rail : ses tickets — et sa propre carte, s'il attend le chef — ressortent, les autres cartes
 * s'effacent ; sans choix, toutes redeviennent ordinaires.
 * @param {any} grille la rangée des colonnes @param {Iterable<[Carte, any]>} posees chaque carte et son bon
 * @param {Besoin | undefined} choisi
 */
export function marquerLeRail(grille, posees, choisi) {
  const siens = new Set(choisi === undefined ? [] : [choisi.ticket, ...choisi.tickets]);
  if (choisi === undefined) delete grille.dataset.besoin;
  else grille.dataset.besoin = String(choisi.ticket);
  for (const [carte, bon] of posees) {
    if (choisi === undefined) delete bon.dataset.besoin;
    else bon.dataset.besoin = siens.has(carte.ticket) ? "sien" : "autre";
  }
}

// Le bandeau suivi : sa ligne se recompte quand sa largeur change — la fenêtre qui change de taille, le rail qui s'affiche.
/** @type {any} */
let suivi;
/**
 * Pose le compte du bandeau, et le refait à chaque changement de sa largeur ; le bandeau précédent n'est plus suivi.
 * @param {any} bandeau @param {() => boolean} etroit
 */
export function suivreLeBandeau(bandeau, etroit) {
  ajusterLeBandeau(bandeau, etroit());
  suivi?.disconnect();
  suivi = undefined;
  const tags = bandeau?.querySelector?.(".backlog-band-tags");
  const Observateur = globalThis.ResizeObserver;
  if (tags === null || tags === undefined || Observateur === undefined) return;
  suivi = new Observateur(() => ajusterLeBandeau(bandeau, etroit()));
  suivi.observe(tags);
}
