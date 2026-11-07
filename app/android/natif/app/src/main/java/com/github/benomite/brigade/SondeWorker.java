package com.github.benomite.brigade;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.Logger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

// Le sondage d'arrière-plan des cartes de TODO (le ticket 2747) : toutes les quinze minutes — le plus court rythme qu'Android
// donne à un job périodique —, avec le réseau, sans serveur de brigade. Il lit GitHub avec le jeton du coffre, par le même
// code que l'app (app/src/notifications-todo.ts), qu'une WebView sans écran joue sur la page android/sonde.html : le signal
// d'une carte de TODO n'est écrit qu'une fois. La page reçoit le jeton, la mémoire des cartes notifiées et la
// notification par `BrigadeSonde`, et dit sa fin par `fini`.
public class SondeWorker extends Worker {

    static final String NOM = "sonde-des-cartes";
    static final long MINUTES = 15;
    static final String PAGE = "https://appassets.androidplatform.net/assets/public/android/sonde.html";
    private static final long PATIENCE_S = 120;

    public SondeWorker(@NonNull Context contexte, @NonNull WorkerParameters parametres) {
        super(contexte, parametres);
    }

    // Le sondage est programmé une fois ; relancée, l'app garde le sien.
    static void programmer(Context contexte) {
        PeriodicWorkRequest demande = new PeriodicWorkRequest.Builder(SondeWorker.class, MINUTES, TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(contexte).enqueueUniquePeriodicWork(NOM, ExistingPeriodicWorkPolicy.KEEP, demande);
    }

    @NonNull
    @Override
    public Result doWork() {
        final Context contexte = getApplicationContext();
        // Pas connecté à GitHub : rien à lire.
        if (Coffre.jeton(contexte) == null) return Result.success();
        final CountDownLatch fin = new CountDownLatch(1);
        final String[] raison = {null};
        final WebView[] vue = {null};
        new Handler(Looper.getMainLooper()).post(() -> {
            WebView webView = new WebView(contexte);
            vue[0] = webView;
            webView.getSettings().setJavaScriptEnabled(true);
            webView.addJavascriptInterface(new Page(contexte, raison, fin), "BrigadeSonde");
            final WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(contexte)).build();
            webView.setWebViewClient(new WebViewClientCompat() {
                @Override
                public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, android.webkit.WebResourceRequest demande) {
                    return assets.shouldInterceptRequest(demande.getUrl());
                }
            });
            webView.loadUrl(PAGE);
        });
        boolean fini;
        try {
            fini = fin.await(PATIENCE_S, TimeUnit.SECONDS);
        } catch (InterruptedException erreur) {
            Thread.currentThread().interrupt();
            fini = false;
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            if (vue[0] != null) vue[0].destroy();
        });
        if (!fini || raison[0] != null) {
            Logger.error("Brigade", "the cards poll did not complete: " + (fini ? raison[0] : "no answer in " + PATIENCE_S + " s"), null);
            return Result.retry();
        }
        return Result.success();
    }

    // Ce que la page du sondage reçoit du téléphone.
    static final class Page {
        private final Context contexte;
        private final String[] raison;
        private final CountDownLatch fin;

        Page(Context contexte, String[] raison, CountDownLatch fin) {
            this.contexte = contexte;
            this.raison = raison;
            this.fin = fin;
        }

        @JavascriptInterface
        public String jeton() {
            String jeton = Coffre.jeton(contexte);
            return jeton == null ? "" : jeton;
        }

        @JavascriptInterface
        public String gardees() {
            return Notifications.gardees(contexte);
        }

        @JavascriptInterface
        public void garder(String json) {
            Notifications.garder(contexte, json);
        }

        @JavascriptInterface
        public void montrer(int id, String titre, String texte, String projet, int ticket) {
            Notifications.montrer(contexte, id, titre, texte, projet, ticket);
        }

        @JavascriptInterface
        public void retirer(int id) {
            Notifications.retirer(contexte, id);
        }

        // La page a fini : `dit` est vide si tout s'est lu, sinon pourquoi non.
        @JavascriptInterface
        public void fini(String dit) {
            if (dit != null && !dit.isEmpty()) raison[0] = dit;
            fin.countDown();
        }
    }
}
