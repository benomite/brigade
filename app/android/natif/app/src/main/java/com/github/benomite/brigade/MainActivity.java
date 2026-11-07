package com.github.benomite.brigade;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

// L'activité de l'app : la WebView de Capacitor, qui ouvre la vue d'app/src/vue/ — celle de l'app
// desktop. Le pont d'attente, et le coffre où l'app garde son jeton GitHub (Coffre.java),
// s'enregistrent avant que le pont de Capacitor ne se construise. Elle programme aussi le sondage d'arrière-plan des
// cartes de TODO (SondeWorker, le ticket 2747) et demande, une fois, le droit de notifier.
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Pont.class);
        registerPlugin(Coffre.class);
        super.onCreate(savedInstanceState);
        SondeWorker.programmer(getApplicationContext());
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }
}
