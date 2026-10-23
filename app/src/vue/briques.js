// @ts-check
// Les briques communes de la vue : ce que l'app dit moins, et dit pareil partout. Une explication
// ne s'écrit pas à plat dans l'écran, elle se montre au survol ou au focus clavier d'une icône
// d'aide ; une lecture qui manque tient en une ligne courte, son détail technique dans le survol ;
// un bouton recommandé se distingue des autres, et son prix, s'il en a un, est dans son survol ;
// une confirmation qui coûte dit son prix en une seule ligne, une qui ne coûte rien n'en dit aucune.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien
// et les tests un faux. Il ne pose rien dans la page, et ne câble aucun écran : il rend des éléments.

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Un prix « nul ou absent » : rien, 0, ou un texte vide. Ni survol ni ligne n'en naissent.
/** @param {unknown} prix @returns {string} */
export function prixDit(prix) {
  if (typeof prix === "number") return prix > 0 ? String(prix) : "";
  return typeof prix === "string" ? prix.trim() : "";
}

// Le survol : un déclencheur (une icône « ? » par défaut) et, à côté, le texte — posé quand le
// pointeur ou le clavier arrive, retiré quand il part. Hors survol, le texte n'est nulle part dans
// l'élément : il n'est pas caché, il n'y est pas. Il reste lisible à qui ne voit pas l'écran, par
// le nom accessible du déclencheur.
/** @param {Fabrique} doc @param {string} texte @param {any} [declencheur] */
export function survol(doc, texte, declencheur) {
  const racine = doc.createElement("span");
  racine.className = "survol";
  const cible = declencheur ?? doc.createElement("button");
  if (declencheur === undefined) {
    cible.type = "button";
    cible.className = "aide";
    cible.textContent = "?";
  }
  cible.ariaLabel = texte;
  racine.append(cible);
  /** @type {any} */
  let bulle;
  const montrer = () => {
    if (bulle !== undefined) return;
    bulle = doc.createElement("span");
    bulle.className = "bulle";
    bulle.role = "tooltip";
    bulle.textContent = texte;
    racine.append(bulle);
  };
  const cacher = () => {
    bulle?.remove();
    bulle = undefined;
  };
  for (const [evenement, geste] of /** @type {const} */ ([["mouseenter", montrer], ["focus", montrer], ["mouseleave", cacher], ["blur", cacher]])) {
    racine.addEventListener(evenement, geste);
    cible.addEventListener(evenement, geste);
  }
  // Échap ferme, comme pour tout survol.
  racine.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
    if (evenement.key === "Escape") cacher();
  });
  return racine;
}

// Une lecture indisponible : une ligne courte, jamais le détail. « historique indisponible » se lit ;
// ce que la box ou le réseau a répondu se montre au survol.
/** @param {Fabrique} doc @param {string} ligne @param {string} detail */
export function lectureIndisponible(doc, ligne, detail) {
  const racine = doc.createElement("p");
  racine.className = "indisponible";
  const texte = doc.createElement("span");
  texte.textContent = ligne;
  racine.append(texte);
  if (detail.trim() !== "") racine.append(survol(doc, detail));
  return racine;
}

// Un bouton d'action. `recommande` le distingue des autres (classe `recommande`, et `aria-` de rien
// d'autre : c'est une question de peau). `prix` : nul ou absent, il n'y a ni survol ni icône ; sinon
// le prix est dans le survol, pas écrit sous le bouton.
/** @param {Fabrique} doc @param {string} libelle @param {() => void} geste @param {{ recommande?: boolean, prix?: number | string | null }} [options] */
export function boutonAction(doc, libelle, geste, { recommande = false, prix } = {}) {
  const groupe = doc.createElement("span");
  groupe.className = "action";
  const bouton = doc.createElement("button");
  bouton.type = "button";
  bouton.textContent = libelle;
  bouton.className = recommande ? "recommande" : "";
  bouton.addEventListener("click", geste);
  groupe.append(bouton);
  const cout = prixDit(prix);
  if (cout !== "") groupe.append(survol(doc, cout));
  return groupe;
}

// Une confirmation de geste : ce que le geste fait, sa ligne de prix s'il coûte — une seule —, et
// les deux réponses. Sans coût, aucune ligne de prix : pas de « gratuit », pas de ligne vide.
/** @param {Fabrique} doc @param {{ titre: string, prix?: number | string | null, oui: string, non: string }} confirmation @param {{ oui: () => void, non: () => void }} gestes */
export function confirmationDeGeste(doc, { titre, prix, oui, non }, gestes) {
  const racine = doc.createElement("section");
  racine.className = "confirmation";
  const entete = doc.createElement("p");
  entete.className = "titre";
  entete.textContent = titre;
  racine.append(entete);
  const cout = prixDit(prix);
  if (cout !== "") {
    const ligne = doc.createElement("p");
    ligne.className = "prix";
    ligne.textContent = cout.replace(/\s*\n\s*/g, " ");
    racine.append(ligne);
  }
  const accepter = doc.createElement("button");
  accepter.type = "button";
  accepter.className = "recommande";
  accepter.textContent = oui;
  accepter.addEventListener("click", gestes.oui);
  const renoncer = doc.createElement("button");
  renoncer.type = "button";
  renoncer.textContent = non;
  renoncer.addEventListener("click", gestes.non);
  racine.append(accepter, renoncer);
  return racine;
}

// Une case à cocher nommée (ticket 1307, reprise par le ticket 1510) : ce qu'elle coche, et dessous, s'il y a quoi, ce
// qui le dit en plus. `mono` : son nom est un mot de la machine, écrit tel qu'il se déclare (`navigateur-headless`).
// `changer` reçoit l'état de la case à chaque clic.
/** @param {Fabrique} doc @param {{ nom: string, dit: string, cochee: boolean, mono?: boolean }} quoi @param {(cochee: boolean) => void} changer */
export function caseACocher(doc, { nom, dit, cochee, mono = false }, changer) {
  const racine = doc.createElement("label");
  racine.className = "capacite";
  const coche = doc.createElement("input");
  coche.type = "checkbox";
  coche.checked = cochee;
  coche.ariaLabel = nom;
  coche.addEventListener("change", () => changer(coche.checked === true));
  const appele = doc.createElement("span");
  appele.textContent = nom;
  if (mono) appele.className = "mono";
  racine.append(coche, appele);
  if (dit !== "") {
    const note = doc.createElement("small");
    note.textContent = dit;
    racine.append(note);
  }
  return racine;
}

// Un bloc replié derrière une ligne (ticket 1456) : ce qui sert rarement — une lecture brute, un historique, un
// réglage — se montre fermé, sa ligne disant son titre et, en quelques mots, ce qu'il contient ; l'ouvrir montre le
// reste. `ouvert` : ce que le chef en a laissé — la vue le retient d'une lecture à l'autre, que le bloc reposé ne se
// referme pas sous ses yeux ; `basculer` le lui dit. `aide` : ce qu'il est, au survol de sa ligne.
/** @param {Fabrique} doc @param {{ titre: string, resume: string, aide?: string, ouvert?: boolean, basculer?: (ouvert: boolean) => void }} ligne @param {any[]} contenu */
export function replie(doc, { titre, resume, aide, ouvert = false, basculer }, contenu) {
  const racine = doc.createElement("details");
  racine.className = "replie";
  racine.open = ouvert;
  const tete = doc.createElement("summary");
  if (aide !== undefined) tete.title = aide;
  tete.append(...titreEtResume(doc, titre, resume));
  racine.append(tete, ...contenu);
  racine.addEventListener("toggle", () => basculer?.(racine.open === true));
  return racine;
}

// Un bloc qui n'a rien à dire — tout à zéro, rien en cours — tient en une ligne, pas un tableau (ticket 1456) : son
// titre, et ce qu'il dirait, en mots.
/** @param {Fabrique} doc @param {string} titre @param {string} dit */
export function uneLigne(doc, titre, dit) {
  const racine = doc.createElement("p");
  racine.className = "une-ligne";
  racine.append(...titreEtResume(doc, titre, dit));
  return racine;
}

/** @param {Fabrique} doc @param {string} titre @param {string} resume */
function titreEtResume(doc, titre, resume) {
  const nom = doc.createElement("strong");
  nom.textContent = titre;
  const dit = doc.createElement("span");
  dit.className = "resume";
  dit.textContent = resume;
  return [nom, dit];
}
