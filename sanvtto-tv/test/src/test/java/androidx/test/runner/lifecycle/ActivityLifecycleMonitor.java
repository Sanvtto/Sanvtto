package androidx.test.runner.lifecycle;

import android.app.Activity;

public interface ActivityLifecycleMonitor {
    Stage getLifecycleStageOf(Activity activity);
}
