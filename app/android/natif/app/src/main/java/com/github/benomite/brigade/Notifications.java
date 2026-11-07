package com.github.benomite.brigade;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

// Les notifications des cartes de TODO (le ticket 2747) : une par carte, que le chef touche pour ouvrir la carte dans
// l'app (MainActivity, Pont.java `carteDemandee`). Ce qui a été notifié est retenu dans les préférences de l'app, d'où le
// sondage d'arrière-plan (SondeWorker) et le pont le lisent : une carte ne notifie pas deux fois, même après un redémarrage.
final class Notifications {

    static final String CANAL = "cartes";
    static final String EXTRA_PROJET = "brigade.projet";
    static final String EXTRA_TICKET = "brigade.ticket";
    private static final String PREFERENCES = "brigade.cartes";
    private static final String GARDEES = "gardees";

    private Notifications() {}

    static SharedPreferences preferences(Context contexte) {
        return contexte.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    // Ce qui a été notifié, en JSON ; `{}` sans rien.
    static String gardees(Context contexte) {
        return preferences(contexte).getString(GARDEES, "{}");
    }

    static void garder(Context contexte, String json) {
        preferences(contexte).edit().putString(GARDEES, json).commit();
    }

    // Montre la notification de la carte `ticket` de `projet`. Sans droit de notifier (Android 13 et après), rien n'est montré.
    static void montrer(Context contexte, int id, String titre, String texte, String projet, int ticket) {
        NotificationManager systeme = contexte.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systeme.createNotificationChannel(new NotificationChannel(CANAL, "Cards awaiting you", NotificationManager.IMPORTANCE_DEFAULT));
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(contexte, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            throw new IllegalStateException("the app may not post notifications: allow them in the phone's settings");
        }
        Intent ouvrir = new Intent(contexte, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_PROJET, projet)
            .putExtra(EXTRA_TICKET, ticket);
        PendingIntent toucher = PendingIntent.getActivity(contexte, id, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(contexte, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titre)
            .setContentText(texte)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texte))
            .setContentIntent(toucher)
            .setAutoCancel(true);
        NotificationManagerCompat.from(contexte).notify(id, notification.build());
    }

    static void retirer(Context contexte, int id) {
        NotificationManagerCompat.from(contexte).cancel(id);
    }
}
