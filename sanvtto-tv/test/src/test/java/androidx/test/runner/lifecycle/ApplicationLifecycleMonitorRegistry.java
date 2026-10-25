package androidx.test.runner.lifecycle;

public final class ApplicationLifecycleMonitorRegistry {
    private static ApplicationLifecycleMonitor instance;
    public static void registerInstance(ApplicationLifecycleMonitor m) { instance = m; }
    public static ApplicationLifecycleMonitor getInstance() { return instance; }
}
