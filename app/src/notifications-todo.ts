// La notification d'une carte de TODO (#2747, épique #2498) : l'app Android prévient le chef quand une carte lui est
// posée, sans qu'il ait ouvert l'app. Une carte de TODO se reconnaît au signal même que l'app lit pour la dessiner
// (tableau/wait-du-chef.ts, `lireCeQuiAttendLeChef`) : aucun nouveau marquage sur GitHub, et tout le reste — une autre
// issue, un commentaire, un label, un statut — n'est pas une entrée de cette lecture, donc ne dit rien.
//
// Ce module ne lance rien et ne touche à rien du téléphone : il lit GitHub par l'`appeler` qu'on lui donne, retient ce
// qui a été notifié par la `memoire` qu'on lui donne (elle survit au redémarrage de l'app), et montre ou retire une
// notification par le `notifier` qu'on lui donne. Sur le téléphone, un job périodique d'Android (SondeWorker.java, toutes
// les quinze minutes, sans serveur de brigade) rejoue ce module dans une WebView sans écran (android/web/sonde.html).
//
// Une carte notifie une fois : elle est retenue par son dépôt, son ticket et sa question. Elle est retirée — sa
// notification disparaît — quand le chef y répond dans l'app (`carteRepondue`), ou quand la lecture suivante ne la porte
// plus (répondue sur GitHub). Un projet dont la lecture échoue ne retire rien : « rien n'est lu » n'est pas « répondu ».
import { questionDuChef } from "./card-todo.ts";
import type { CallGitHub } from "./tableau/client.ts";
import { lireCeQuiAwaitingLeChef, type WaitDuChef } from "./tableau/wait-du-chef.ts";
import { lireLesProjectsDuAccount, type ProjectDuAccount } from "./read-github-phone.ts";

// Le rythme du sondage d'arrière-plan : le plus court que le système donne à un job périodique d'Android.
export const SONDAGE_MS = 15 * 60_000;

// Ce que la mémoire retient d'une carte notifiée.
export type Notifiee = { id: number; projet: string; depot: string; ticket: number; question: string };
export type Notifiees = Record<string, Notifiee>;
// Les ports peuvent être asynchrones : le pont de l'app les passe au natif, la page du sondage les a de plain-pied.
type Peut<T> = T | Promise<T>;
export type Memoire = { lire(): Peut<Notifiees>; ecrire(notifiees: Notifiees): Peut<void> };
// Une notification du système : son identifiant (stable pour une carte), son texte — le projet et la question —, et la
// carte qu'un toucher ouvre.
export type Notification = { id: number; titre: string; texte: string; projet: string; ticket: number };
export type Notifieur = { montrer(notification: Notification): Peut<void>; retirer(id: number): Peut<void> };

export type Options = {
  appeler: CallGitHub;
  memoire: Memoire;
  notifier: Notifieur;
  // Les projets du chef ; par défaut ceux que ses stations ont écrits dans ses gists.
  projets?: () => Promise<ProjectDuAccount[]>;
};
export type Sondage = { lu: true; notifiees: number; retirees: number } | { lu: false; raison: string };

const cleDe = (repository: string, ticket: number) => `${repository.toLowerCase()}#${ticket}`;
// Un identifiant d'Android : un entier positif, le même pour la même carte (FNV-1a).
export function identifiantDe(cle: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cle.length; i++) h = Math.imul(h ^ cle.charCodeAt(i), 0x01000193);
  return (h >>> 1) || 1;
}

// La question qu'une entrée de TODO pose : celle de sa carte, à défaut le début de sa ligne.
export function questionDe({ chef, ligne: line }: WaitDuChef): string {
  return (chef === undefined ? null : questionDuChef(chef)) ?? line.split(" — ")[0] ?? line;
}

export function notificationDe(project: string, ticket: number, question: string): Notification {
  return { id: identifiantDe(`${project}#${ticket}`), titre: "A card awaits you", texte: `${project} — ${question}`, projet: project, ticket };
}

// Un sondage : GitHub est lu, chaque nouvelle carte notifie, chaque carte qui n'attend plus est retirée.
export async function sonder({ appeler, memoire, notifier, projets: projects }: Options): Promise<Sondage> {
  let lus: ProjectDuAccount[];
  try {
    lus = await (projects ?? (() => lireLesProjectsDuAccount(appeler)))();
  } catch (error) {
    return { lu: false, raison: `The projects were not read from GitHub: ${error instanceof Error ? error.message : String(error)}` };
  }
  const gardees = await memoire.lire();
  let notifiees = 0;
  let retirees = 0;
  const retirer = async (cle: string) => {
    const card = gardees[cle];
    if (card === undefined) return;
    delete gardees[cle];
    await memoire.ecrire(gardees);
    await notifier.retirer(card.id);
    retirees++;
  };
  // Un projet que la liste ne porte plus n'attend plus rien.
  const depots = new Set(lus.map(({ depot: repository }) => repository.toLowerCase()));
  for (const [cle, card] of Object.entries(gardees)) if (!depots.has(card.depot.toLowerCase())) await retirer(cle);
  let failure: string | undefined;
  for (const { nom: name, depot: repository } of lus) {
    const lu = await lireCeQuiAwaitingLeChef({ depot: repository, appeler });
    if (!lu.lue) {
      failure ??= lu.raison;
      continue;
    }
    const presentes = new Set<string>();
    for (const wait of lu.attentes) {
      const cle = cleDe(repository, wait.ticket);
      const question = questionDe(wait);
      presentes.add(cle);
      if (gardees[cle]?.question === question) continue;
      // Une carte qui pose une autre question est une autre carte : l'ancienne notification cède la place.
      if (gardees[cle] !== undefined) await retirer(cle);
      const notification = notificationDe(name, wait.ticket, question);
      // Retenue avant d'être montrée : un arrêt entre les deux ne la fait pas notifier deux fois.
      gardees[cle] = { id: notification.id, projet: name, depot: repository, ticket: wait.ticket, question };
      await memoire.ecrire(gardees);
      try {
        await notifier.montrer(notification);
      } catch (error) {
        delete gardees[cle];
        await memoire.ecrire(gardees);
        throw error;
      }
      notifiees++;
    }
    for (const [cle, card] of Object.entries(gardees)) if (card.depot.toLowerCase() === repository.toLowerCase() && !presentes.has(cle)) await retirer(cle);
  }
  return failure === undefined ? { lu: true, notifiees, retirees } : { lu: false, raison: failure };
}

// Le chef vient de répondre à la carte de ce ticket, dans l'app : sa notification disparaît tout de suite.
export async function cardRepondue({ memoire, notifier }: Pick<Options, "memoire" | "notifier">, project: string, ticket: number): Promise<number> {
  const gardees = await memoire.lire();
  let retirees = 0;
  for (const [cle, card] of Object.entries(gardees)) {
    if (card.projet !== project || card.ticket !== ticket) continue;
    delete gardees[cle];
    await notifier.retirer(card.id);
    retirees++;
  }
  if (retirees > 0) await memoire.ecrire(gardees);
  return retirees;
}
