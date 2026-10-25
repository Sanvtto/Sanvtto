package androidx.test.internal.runner.lifecycle;

import android.app.Activity;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitor;
import androidx.test.runner.lifecycle.Stage;

import java.util.WeakHashMap;

public final class ActivityLifecycleMonitorImpl implements ActivityLifecycleMonitor {
    private final WeakHashMap<Activity, Stage> stages = new WeakHashMap<>();

    public void signalLifecycleChange(Stage stage, Activity activity) {
        stages.put(activity, stage);
    }

    @Override
    public Stage getLifecycleStageOf(Activity activity) {
        return stages.get(activity);
    }
}
