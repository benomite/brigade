package com.github.benomite.brigade;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// L'activité de l'app : la WebView de Capacitor, qui ouvre la vue d'app/src/vue/ — celle de l'app
// desktop. Le pont d'attente s'enregistre avant que le pont de Capacitor ne se construise.
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(Pont.class);
        super.onCreate(savedInstanceState);
    }
}
