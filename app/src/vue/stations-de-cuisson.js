// @ts-check
// Les stations du projet sur l'onglet Cooks (ticket 1185) : une ligne par station — son nom, son mot (cooking,
// stopped, saturated, refused) et ce qu'il veut dire, ses cooks en cours, et un seul bouton, qui arrête ou
// relance la cuisine du projet sur elle, la box comme le Mac ou un autre ordinateur. Sur un écran large, chaque
// station est un bloc, et ses cooks en cours y sont les cartes de leurs tickets — celles du kanban de Rail, qui
// s'ouvrent de même (ticket 1270) ; sur un écran étroit, en lecture seule, une ligne par cook. Le clic part par le process
// principal (cuisson.ts) ; tant qu'il n'a pas répondu, le bouton dit qu'il s'y met. Ce qu'il a fait se dit en une
// ligne sous la station, ce que le runtime a répondu au survol — jusqu'à ce que la lecture suivante la montre
// dans son état neuf.
// Et, sur l'onglet Rail, la ligne qui dit ce qui, du côté des cooks, demande un geste au chef — une station
// saturée, un projet refusé, l'accès au dépôt bloqué — avec de quoi ouvrir Cooks, où ce geste se fait. Une seule
// ligne, quel que soit le nombre de causes ; aucune quand rien ne le demande.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../cuisson.ts").LigneDeStation} Ligne */
/** @typedef {import("../faits.ts").Cook} Cook */
/** @typedef {import("../cuisson.ts").GesteDeCuisson} Geste */
/** @typedef {import("../projets/demande.ts").AccesBloque} Acces */
/** @typedef {import("../projets/demande.ts").Refus} Refus */
/** @typedef {import("../projets/demande.ts").EchecDuClone} Clone */
/** @typedef {import("../accueil.ts").PlafondsDeStation} Plafonds */
// Ce que le dernier réglage du plafond a rendu pour une station : la phrase, refusée ou non, et son détail au survol.
/** @typedef {{ dit: string, refus: boolean, detail: string }} DitDuPlafond */
// Ce qu'un clic a rendu pour une station : la phrase, refusée ou non, le détail au survol, et le mot de la
// station au moment du clic — elle s'efface quand la station en a changé.
/** @typedef {{ dit: string, refus: boolean, detail: string, etat: string }} Dit */

export const TITRE = "Its stations";
export const AUCUN_COOK = "no cook running";
export const OUVRIR_COOKS = "open Cooks";

// Le plafond de cooks du projet sur la station (ticket 1292) : ce qu'il vaut, d'où il vient, et ses deux gestes.
export const POSER_LE_PLAFOND = "set the cap";
export const PLAFOND_PAR_DEFAUT = "back to the default";
// Ce que dit une station saturée : ce qui la sature, et ce que baisser le plafond change — et ne change pas.
export const BAISSER_LE_PLAFOND = "Lowering the cap makes this project run fewer cooks at once; the machine's load does not drop right away.";

// Ce que chaque bouton dit, ce qu'il dit tant que le clic attend sa réponse, ce qu'il fait — au survol du bouton —,
// et son prix, nul quand il ne coûte rien : arrêter ne coupe rien et ne perd rien ; relancer remet ses cooks au
// travail, sur le quota du chef. Le prix passe en survol, jamais sous le bouton.
/** @type {Readonly<Record<Geste, { libelle: string, enCours: string, fait: string, prix: string | null }>>} */
export const BOUTONS = {
  stop: { libelle: "stop cooking", enCours: "stopping…", fait: "it takes no more tickets of this project; its running cooks finish — delivered, or their ticket goes back to the rail", prix: null },
  start: { libelle: "start cooking", enCours: "starting…", fait: "it takes the project's tickets again", prix: "its cooks spend what cooks spend, on your quota" },
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les cooks en cours d'une station, une ligne chacun : son ticket et son titre (l'écran étroit).
/** @param {Fabrique} doc @param {Ligne} ligne */
function lignesDeCooks(doc, ligne) {
  const cooks = cree(doc, "ul");
  cooks.className = ligne.cooks.length === 0 ? "cooks vide" : "cooks";
  cooks.append(
    ...(ligne.cooks.length === 0
      ? [cree(doc, "li", AUCUN_COOK)]
      : ligne.cooks.map(({ ticket, titre }) => {
          const cook = cree(doc, "li");
          const numero = cree(doc, "strong", `#${ticket}`);
          numero.className = "mono";
          const dit = cree(doc, "span", titre);
          dit.title = titre;
          cook.append(numero, dit);
          return cook;
        })),
  );
  return cooks;
}

// Les cooks en cours d'une station, la carte de son ticket chacun, telle que `carte` la pose.
/** @param {Fabrique} doc @param {Ligne} ligne @param {(cook: Cook) => any} carte */
function cartesDeCooks(doc, ligne, carte) {
  if (ligne.cooks.length === 0) {
    const vide = cree(doc, "p", AUCUN_COOK);
    vide.className = "aucun-cook";
    return vide;
  }
  const cartes = cree(doc, "ol");
  cartes.className = "cartes";
  cartes.ariaLabel = `tickets in progress on ${ligne.station}`;
  cartes.append(...ligne.cooks.map(carte));
  return cartes;
}

// Sous une station : le plafond du projet sur elle comme sa box le dit (`3 at most — 8 cores`), en une phrase ce qui
// la sature quand elle l'est, le champ et ses deux gestes — le nombre, ou le retour au défaut quand le chef l'a réglé.
// Le plafond neuf se lit à la lecture qui suit le geste ; `en cours` : le geste attend sa réponse.
/**
 * @param {Fabrique} doc @param {string} station @param {Plafonds} cap @param {DitDuPlafond | "en cours" | undefined} rendu
 * @param {{ lire: (station: string) => string, ecrire: (station: string, valeur: string) => void } | undefined} saisies @param {(station: string, valeur: string) => void} regler
 */
function plafondDeLaStation(doc, station, cap, rendu, saisies, regler) {
  const attend = rendu === "en cours";
  const plafond = cree(doc, "p", `Cooks at once: ${cap.plafond.dit}`);
  plafond.className = "plafond-de-station";
  const lignes = [plafond];
  if (cap.retenue !== undefined) {
    const sature = cree(doc, "p", `Saturated on ${cap.retenue.ressources} — ${cap.retenue.detail}. ${BAISSER_LE_PLAFOND}`);
    sature.className = "retenue-de-station";
    lignes.push(sature);
  }
  const champ = cree(doc, "input");
  champ.type = "text";
  champ.inputMode = "numeric";
  champ.placeholder = "cooks at once";
  champ.ariaLabel = `cook cap on ${station}`;
  champ.value = saisies?.lire(station) ?? "";
  champ.addEventListener("input", () => saisies?.ecrire(station, champ.value));
  champ.disabled = attend;
  const regle = cree(doc, "p");
  regle.className = "regle-le-plafond-de-station";
  const poser = boutonAction(doc, POSER_LE_PLAFOND, () => regler(station, champ.value.trim()), { recommande: true, prix: "no running cook is stopped; the station launches no more while it is above — 0 lifts the limit" });
  const clic = poser.children[0];
  if (clic !== undefined) clic.disabled = attend;
  regle.append(champ, poser);
  if (cap.plafond.parLeChef) {
    const retour = boutonAction(doc, PLAFOND_PAR_DEFAUT, () => regler(station, "auto"), { prix: "withdraws your cap: the one derived from the machine's cores returns" });
    const clicRetour = retour.children[0];
    if (clicRetour !== undefined) clicRetour.disabled = attend;
    regle.append(retour);
  }
  lignes.push(regle);
  if (rendu !== undefined && rendu !== "en cours") {
    const dit = cree(doc, "p", rendu.dit);
    dit.className = rendu.refus ? "dit refus" : "dit";
    if (rendu.detail !== "") dit.title = rendu.detail;
    lignes.push(dit);
  }
  return lignes;
}

// La section des stations, ou null : `facts` ne les donne pas. `enCours` : les stations dont un clic attend sa
// réponse, et lequel ; `dits` : ce que le dernier clic de chacune a rendu. `pastille` : celle de la vue. `carte` :
// la carte du ticket d'un cook, celle du kanban — sans elle, une ligne par cook. `tete` : ce qui se lit sous son titre,
// avant les stations — la ligne de la cuisine du projet, où sa carte est fondue (ticket 1456).
/**
 * @param {Fabrique} doc
 * @param {{ lignes: readonly Ligne[] | undefined, enCours: ReadonlyMap<string, Geste>, dits: ReadonlyMap<string, Dit>, jouer: (station: string, geste: Geste) => void, pastille: (mot: string, ton: string | undefined) => any, carte?: (cook: Cook) => any, plafonds?: Readonly<Record<string, Plafonds>>, plafondsDits?: ReadonlyMap<string, DitDuPlafond | "en cours">, saisies?: { lire: (station: string) => string, ecrire: (station: string, valeur: string) => void }, regler?: (station: string, valeur: string) => void, tete?: readonly any[] }} options
 */
export function poserLesStations(doc, { lignes, enCours, dits, jouer, pastille, carte, plafonds, plafondsDits, saisies, regler, tete = [] }) {
  if (lignes === undefined) return null;
  const section = cree(doc, "section");
  section.className = "stations-de-cuisson";
  section.ariaLabel = TITRE;
  if (carte !== undefined) section.dataset.cartes = "";
  const liste = cree(doc, "ol");
  liste.append(
    ...lignes.map((ligne) => {
      const pose = cree(doc, "li");
      pose.className = "station-de-cuisson";
      pose.dataset.station = ligne.station;
      // Son nom, et où elle tourne.
      const nom = cree(doc, "span");
      nom.className = "nom";
      const appele = cree(doc, "strong", ligne.station);
      appele.className = "mono";
      nom.append(appele, ...(ligne.distante ? [cree(doc, "small", "remote")] : []));
      // Son mot, ce qu'il veut dire en quelques mots, et le reste au survol.
      const etat = cree(doc, "span");
      etat.className = "etat";
      const pilule = cree(doc, "span");
      pilule.className = "pilule";
      if (ligne.ton !== undefined) pilule.dataset.ton = ligne.ton;
      pilule.append(pastille(ligne.etat, ligne.ton), cree(doc, "strong", ligne.etat));
      pilule.title = ligne.survol;
      etat.append(pilule, ...(ligne.dit === "" ? [] : [cree(doc, "small", ligne.dit)]));
      // Ses cooks en cours : arrêtée, ce sont ceux qui finissent. Leurs cartes ferment le bloc, sous son geste.
      const cooks = carte === undefined ? lignesDeCooks(doc, ligne) : cartesDeCooks(doc, ligne, carte);
      pose.append(nom, etat, ...(carte === undefined ? [cooks] : []));
      // Le geste : un seul bouton, et seulement quand c'est d'elle que l'arrêt vient ou s'en va.
      if (ligne.geste !== null) {
        const geste = ligne.geste;
        const attendu = enCours.get(ligne.station);
        const bouton = boutonAction(doc, attendu === undefined ? BOUTONS[geste].libelle : BOUTONS[attendu].enCours, () => jouer(ligne.station, geste), { prix: BOUTONS[geste].prix });
        bouton.className = "action geste-de-cuisson";
        const clic = bouton.children[0];
        if (clic !== undefined) {
          clic.ariaLabel = `${BOUTONS[geste].libelle} on ${ligne.station}`;
          clic.title = BOUTONS[geste].fait;
          clic.disabled = attendu !== undefined;
        }
        pose.append(bouton);
      }
      // Ce que le dernier clic a rendu, tant que la station n'a pas changé de mot.
      const rendu = dits.get(ligne.station);
      if (rendu !== undefined && rendu.etat === ligne.etat) {
        const dit = cree(doc, "p", rendu.dit);
        dit.className = rendu.refus ? "dit refus" : "dit";
        if (rendu.detail !== "") dit.title = rendu.detail;
        pose.append(dit);
      }
      if (carte !== undefined) pose.append(cooks);
      const cap = plafonds?.[ligne.station];
      if (cap !== undefined && regler !== undefined) pose.append(...plafondDeLaStation(doc, ligne.station, cap, plafondsDits?.get(ligne.station), saisies, regler));
      return pose;
    }),
  );
  section.append(cree(doc, "h3", TITRE), ...tete, liste);
  return section;
}

// Le détail de git, que la raison d'un accès bloqué porte entre parenthèses à sa fin : au survol (depot-retenu.js).
const DETAIL_DE_GIT = /\s*\(git: ([^)]*)\)\.?$/;

// La ligne d'alerte de l'onglet Rail, ou null : rien, du côté des cooks, ne demande un geste au chef.
// `alerte` : ce que les stations en disent (cuisson.ts) ; `refusee` : l'une d'elles y dit déjà un refus ;
// `acces`, `refus` : ce que la station du projet publie de l'accès au dépôt et de son refus (projets/demande.ts).
// Plusieurs causes tiennent sur la même ligne, la plus urgente d'abord : l'accès, que seul le chef lève.
// `clone` : le clone du dépôt en échec (ticket 1390) — sa cause dit plus que le refus qui l'accompagne, et le remplace.
/**
 * @param {Fabrique} doc
 * @param {{ alerte: string | null, refusee: boolean, acces: Acces | null, clone?: Clone | null, refus: Refus | null, gates?: string | null, ouvrir: () => void }} options
 */
export function ligneDAlerte(doc, { alerte, refusee, acces, clone = null, refus, gates = null, ouvrir }) {
  const causes = [
    ...(gates === null ? [] : [gates]),
    ...(acces === null ? [] : [acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.$/, "")]),
    ...(acces !== null || clone === null ? [] : [clone.raison.replace(/\.$/, "")]),
    ...(alerte === null ? [] : [alerte]),
    ...(refus === null || refusee || clone !== null ? [] : [refus.message.replace(/\.$/, "")]),
  ];
  if (causes.length === 0) return null;
  const pose = cree(doc, "p");
  pose.className = "alerte-de-cuisine";
  pose.role = "alert";
  const dit = cree(doc, "span", `${causes.join(" · ")}.`);
  const lien = cree(doc, "button", OUVRIR_COOKS);
  lien.type = "button";
  lien.className = "lien";
  lien.addEventListener("click", ouvrir);
  pose.append(dit, lien);
  return pose;
}
