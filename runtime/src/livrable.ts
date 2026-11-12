// Le livrable d'un cook : ce qu'il a délimité dans son dernier message, entre
// `<livrable>` et `</livrable>`. Il n'est jamais déduit — un message sans
// délimitation n'a pas de livrable, quelle que soit sa longueur. Ce qui entoure
// la délimitation reste le compte-rendu : gardé, mais présenté à part. Sans E/S.

export const OUVERTURE = "<livrable>";
export const FERMETURE = "</livrable>";

// Pourquoi un message n'a pas de livrable : rien n'y est délimité, la dernière
// délimitation n'est jamais fermée, ou elle est vide.
export type Defaut = "absent" | "ouvert" | "vide";

export type Livrable = {
  // Ce que le cook a délimité. Nul : il n'a rien délimité qui se lise.
  texte: string | null;
  defaut: Defaut | null;
  // Le reste du message ; sans livrable, le message entier. Nul : rien.
  autour: string | null;
  // Les délimitations fermées que porte le message.
  delimitations: number;
};

// Un petit modèle se reprend, s'interrompt, laisse traîner des balises : chaque
// cas a sa règle. Une fermeture sans ouverture est ignorée, comme toute balise
// qui n'est pas la sienne. Une ouverture rouverte repart de la dernière. De
// plusieurs délimitations, la dernière l'emporte : les autres sont ses
// brouillons. Une ouverture restée sans fermeture ne livre rien, même après une
// délimitation complète — le cook avait commencé à se reprendre.
//
// Une balise citée n'en est pas une : la consigne nomme les deux balises entre
// backticks, et un cook qui la répète (« j'ai délimité entre \`<livrable>\` et
// \`</livrable>\` ») ne délimite rien. Ce qui est entre backticks sur une ligne,
// ou dans un bloc de code fermé, est donc lu comme du texte.
export const blanchir = (texte: string) => texte.replace(/```[\s\S]*?```|`[^`\n]*`/g, (code) => " ".repeat(code.length));

export function lireLivrable(message: string | null): Livrable {
  const entier = message?.trim() ? message : null;
  let ouverte: number | null = null;
  let derniere: { de: number; a: number; texte: string } | null = null;
  let delimitations = 0;
  for (const balise of blanchir(message ?? "").matchAll(/<(\/?)livrable>/gi)) {
    if (balise[1] === "") ouverte = balise.index;
    else if (ouverte !== null) {
      derniere = { de: ouverte, a: balise.index + balise[0].length, texte: (message ?? "").slice(ouverte + OUVERTURE.length, balise.index).trim() };
      delimitations++;
      ouverte = null;
    }
  }
  const defaut: Defaut | null = ouverte !== null ? "ouvert" : derniere === null ? "absent" : derniere.texte === "" ? "vide" : null;
  if (defaut !== null || derniere === null || message === null) return { texte: null, defaut, autour: entier, delimitations };
  const autour = [message.slice(0, derniere.de).trim(), message.slice(derniere.a).trim()].filter(Boolean).join("\n\n");
  return { texte: derniere.texte, defaut: null, autour: autour === "" ? null : autour, delimitations };
}

// Le blocage qu'un cook déclare : dans son livrable, entre `<bloque>` et
// `</bloque>`, la décision ou la condition qui lui manque. Le ticket d'un cook
// qui se déclare bloqué, avec ou sans commit, ne part pas en relecture : la
// station le remonte au chef avec cette question (`brigade-github.ts`, #2805). Même lecture que le livrable : une balise citée n'en est
// pas une, la dernière délimitation fermée l'emporte, une délimitation vide ou
// jamais fermée ne déclare rien.
export const OUVERTURE_BLOCAGE = "<bloque>";
export const FERMETURE_BLOCAGE = "</bloque>";
export function lireBlocage(livrable: string | null): string | null {
  return lireDelimitation(livrable, "bloque");
}

// Le cook qui prouve que le ticket est déjà satisfait sur la branche
// d'intégration le dit entre `<deja-servi>` et `</deja-servi>`, en nommant le
// commit qui l'a satisfait. La station vérifie avant de fermer (`deja-servi.ts`,
// #3146). Même lecture que le blocage.
export const OUVERTURE_DEJA_SERVI = "<deja-servi>";
export const FERMETURE_DEJA_SERVI = "</deja-servi>";
export function lireDejaServi(livrable: string | null): string | null {
  return lireDelimitation(livrable, "deja-servi");
}

export function lireDelimitation(livrable: string | null, balise: string): string | null {
  let ouverte: number | null = null;
  let texte: string | null = null;
  for (const marque of blanchir(livrable ?? "").matchAll(new RegExp(`<(/?)${balise}>`, "gi"))) {
    if (marque[1] === "") ouverte = marque.index;
    else if (ouverte !== null) {
      texte = (livrable ?? "").slice(ouverte + balise.length + 2, marque.index).trim();
      ouverte = null;
    }
  }
  return ouverte !== null || texte === "" ? null : texte;
}

// Ce que la consigne d'un cook dit de son livrable, à la fin de son dernier
// point : la même pour un premier cook et pour un cook renvoyé.
export const CONSIGNE_DU_LIVRABLE = `Dans ce dernier message, délimite ce que tu livres entre \`${OUVERTURE}\` et \`${FERMETURE}\`, une seule fois. Écris ces deux balises nues, ni entre backticks ni dans un bloc de code : citées, elles ne délimitent rien. Seul ce passage est publié comme ton livrable sur le ticket, et c'est lui qui est relu. Ce que tu écris autour — raisonnement, vérifications, brouillons — reste consultable, sans plus. Si tu as commité, ce passage est ton compte-rendu. Si le ticket ne demande aucun commit — une analyse, une réponse, un texte —, ce passage est le livrable lui-même, dans la forme exacte que le ticket exige (longueur, format, rien avant ni après) : sans ce passage, tu n'as rien livré. Si tu t'arrêtes sans avoir fini — une décision te manque, quelque chose te bloque —, c'est dans ce passage que tu dis pourquoi. Si tu ne peux pas finir le ticket parce qu'une décision ou une condition hors de ta portée te manque — un ticket dont il dépend pas encore mergé, un accès, une machine que tu n'as pas —, écris-la dans ce passage entre \`${OUVERTURE_BLOCAGE}\` et \`${FERMETURE_BLOCAGE}\`, que tu aies commité ou non : ce que tu as commité ne part pas en relecture, ton ticket remonte au chef avec cette question, et le cook qui le reprendra après sa réponse repartira de ta branche. Sans ces balises, ta moitié de ticket, ton gabarit vide ou ton « à faire » part en relecture, qui le renvoie à un cook. Si, au contraire, tu prouves que le ticket est déjà satisfait sur la branche d'intégration — le correctif y est, un autre commit ou une autre PR l'a mergé —, n'invente aucun commit : écris dans ce passage, entre \`${OUVERTURE_DEJA_SERVI}\` et \`${FERMETURE_DEJA_SERVI}\`, le hash du commit de la branche d'intégration qui le satisfait (et la PR, si tu la connais) et ce qui le prouve. La station vérifie que ce commit est sur la branche d'intégration et que les gates y sont vertes, puis ferme le ticket comme servi ; sinon ta réponse compte comme un essai raté. N'utilise pas ces balises si le ticket n'appelle vraiment aucun changement.`;

// Le défaut, tel qu'il se lit sur l'issue et dans le renvoi d'un cook.
export const direDefaut = (defaut: Defaut | null): string =>
  defaut === "ouvert"
    ? `une délimitation \`${OUVERTURE}\` est ouverte et jamais fermée`
    : defaut === "vide"
      ? `la délimitation \`${OUVERTURE}\` est vide`
      : `rien n'est délimité entre \`${OUVERTURE}\` et \`${FERMETURE}\``;

// La fin de tour du cook, une seule fois pour toutes les consignes. Personne ne
// lui répond, et ce qui juge son travail — relecture, CI, verdict de la pass,
// retour du chef — vient après sa livraison : « j'attends la relecture » a coûté
// 450 627 tokens pour aucun commit (#413).
//
// Et rien de ce qu'il a lancé en arrière-plan ne tourne encore quand il finit :
// tant qu'une tâche tourne, `claude -p` ne rend pas la main, et la station
// l'attend. Sur les tickets de #2541, des cooks ont fini leur compte-rendu sur
// un test laissé en arrière-plan, puis attendu 7 à 8 min que l'outil le tue,
// comptées à la cuisson ; et leur réponse à la notification de sa fin est
// devenue leur dernier message, à la place du livrable.
export const CONSIGNE_DE_FIN_DE_TOUR = [
  "Personne ne te répondra, et rien n'arrivera pendant ton tour : ni la relecture, ni la CI, ni le verdict de la pass, ni un retour du chef. Tout cela vient après ta livraison, jamais avant : « j'attends la relecture » n'est jamais une raison de t'arrêter.",
  "S'il te manque une décision, ne la devine pas : dis laquelle dans ton compte-rendu. Mais commite d'abord ce que tu as dans les mains — complet ou partiel, mais écrit —, quelle que soit la raison de ton arrêt : décision manquante, doute, attente. Ta fin de tour n'est pas une conversation, c'est une livraison : ce que tu as au moment de t'arrêter est dans un commit.",
  "Avant ce dernier message, plus rien de ce que tu as lancé en arrière-plan ne tourne — commande, Monitor, sous-agent : attends sa fin, ou arrête-le (TaskStop). Tant qu'une tâche tourne, `claude` ne rend pas la main et la station l'attend, ce temps compté à ton ticket ; puis ta réponse à sa fin devient ton dernier message, à la place de ton livrable.",
].join(" ");
