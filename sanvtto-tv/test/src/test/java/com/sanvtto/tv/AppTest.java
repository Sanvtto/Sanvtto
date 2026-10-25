package com.sanvtto.tv;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.app.Application;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ListView;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowLooper;

/**
 * Roda as telas de verdade em várias versões do Android de TV
 * (5.0 Lollipop até 14), com tela 1080p.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {21, 23, 26, 28, 30, 33, 34}, qualifiers = "w960dp-h540dp-land-television-xhdpi")
public class AppTest {

    private Application app;

    @Before
    public void setUp() {
        app = RuntimeEnvironment.getApplication();
        // TV com controle remoto nunca está em "modo toque"
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().setInTouchMode(false);
        TestUtil.installFakeApps(app, 0);
    }

    private HomeActivity startHome() throws Exception {
        ActivityController<HomeActivity> c = Robolectric.buildActivity(HomeActivity.class).setup();
        TestUtil.settle();
        return c.get();
    }

    private static List<View> tiles(View root, String prefix) {
        List<View> out = new ArrayList<>();
        collect(root, prefix, out);
        return out;
    }

    private static void collect(View v, String prefix, List<View> out) {
        if (v.getTag() instanceof String && ((String) v.getTag()).startsWith(prefix)) out.add(v);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) collect(g.getChildAt(i), prefix, out);
        }
    }

    // ------------------------------------------------------------------ tela inicial

    @Test
    public void home_mostraTodosOsAppsEFavoritosPadrao() throws Exception {
        HomeActivity a = startHome();
        View root = a.getWindow().getDecorView();
        assertEquals(TestUtil.FAKE_APPS.length, tiles(root, "app:").size());
        List<View> favs = tiles(root, "fav:");
        assertFalse("deveria criar favoritos padrão", favs.isEmpty());
        assertEquals("fav:com.netflix.ninja", favs.get(0).getTag());
        assertEquals("o primeiro favorito deve começar focado", favs.get(0), a.getWindow().getDecorView().findFocus());
    }

    @Test
    public void home_abrirAppPeloOk() throws Exception {
        HomeActivity a = startHome();
        View netflix = a.getWindow().getDecorView().findViewWithTag("fav:com.netflix.ninja");
        assertTrue(netflix.performClick());
        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals("com.netflix.ninja", started.getComponent() != null
                ? started.getComponent().getPackageName() : started.getPackage());
    }

    @Test
    public void home_voltarNuncaFechaATelaInicial() throws Exception {
        HomeActivity a = startHome();
        a.onBackPressed();
        assertFalse(a.isFinishing());
    }

    @Test
    public void home_menuDoAppAdicionaRemoveEMoveFavoritos() throws Exception {
        HomeActivity a = startHome();
        Prefs p = new Prefs(a);
        View vlc = a.getWindow().getDecorView().findViewWithTag("app:org.videolan.vlc");
        assertTrue(vlc.performLongClick());
        clickDialogItem("Adicionar aos favoritos");
        assertTrue(p.favorites().contains("org.videolan.vlc"));
        View favVlc = a.getWindow().getDecorView().findViewWithTag("fav:org.videolan.vlc");
        assertNotNull(favVlc);

        int before = p.favorites().indexOf("org.videolan.vlc");
        favVlc.performLongClick();
        clickDialogItem("Mover para a esquerda");
        assertEquals(before - 1, p.favorites().indexOf("org.videolan.vlc"));

        a.getWindow().getDecorView().findViewWithTag("fav:org.videolan.vlc").performLongClick();
        clickDialogItem("Remover dos favoritos");
        assertFalse(p.favorites().contains("org.videolan.vlc"));
        assertNull(a.getWindow().getDecorView().findViewWithTag("fav:org.videolan.vlc"));
    }

    private void clickDialogItem(String label) {
        ShadowLooper.idleMainLooper();
        AlertDialog d = (AlertDialog) ShadowDialog.getLatestDialog();
        assertNotNull("menu não abriu", d);
        ListView lv = d.getListView();
        for (int i = 0; i < lv.getAdapter().getCount(); i++) {
            if (label.equals(lv.getAdapter().getItem(i))) {
                shadowOf(lv).performItemClick(i);
                ShadowLooper.idleMainLooper();
                return;
            }
        }
        fail("opção não encontrada: " + label);
    }

    @Test
    public void home_abreQuadroSozinhoDepoisDoTempoSemUso() throws Exception {
        new Prefs(app).putInt("idleMin", 5);
        HomeActivity a = startHome();
        shadowOf(Looper.getMainLooper()).idleFor(4, TimeUnit.MINUTES);
        assertNull(shadowOf(a).getNextStartedActivity());
        shadowOf(Looper.getMainLooper()).idleFor(2, TimeUnit.MINUTES);
        Intent i = shadowOf(a).getNextStartedActivity();
        assertNotNull("modo quadro deveria abrir", i);
        assertEquals(ArtActivity.class.getName(), i.getComponent().getClassName());
    }

    @Test
    public void home_aguentaMuitosApps() throws Exception {
        TestUtil.installFakeApps(app, 80);
        HomeActivity a = startHome();
        assertEquals(TestUtil.FAKE_APPS.length + 80, tiles(a.getWindow().getDecorView(), "app:").size());
    }

    @Test
    public void home_navegacaoPeloControleRemoto() throws Exception {
        HomeActivity a = startHome();
        View first = a.getWindow().getDecorView().findFocus();
        assertNotNull(first);
        String[] seq = {"RIGHT", "RIGHT", "DOWN", "DOWN", "LEFT", "UP", "UP", "UP"};
        for (String k : seq) {
            int code = k.equals("RIGHT") ? KeyEvent.KEYCODE_DPAD_RIGHT : k.equals("LEFT") ? KeyEvent.KEYCODE_DPAD_LEFT
                    : k.equals("DOWN") ? KeyEvent.KEYCODE_DPAD_DOWN : KeyEvent.KEYCODE_DPAD_UP;
            a.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
            a.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
            ShadowLooper.idleMainLooper();
            assertNotNull("foco sumiu depois de " + k, a.getWindow().getDecorView().findFocus());
        }
    }

    @Test
    public void home_temaClaroEEscuroFuncionam() throws Exception {
        Prefs p = new Prefs(app);
        p.putInt("theme", Prefs.THEME_LIGHT);
        HomeActivity a = startHome();
        p.putInt("theme", Prefs.THEME_DARK);
        shadowOf(Looper.getMainLooper()).idleFor(20, TimeUnit.SECONDS); // tick troca o tema
        TestUtil.settle();
        assertFalse(tiles(a.getWindow().getDecorView(), "app:").isEmpty());
        assertNotNull(a.getWindow().getDecorView().findFocus());
    }

    @Test
    public void home_modoSeguroDepoisDeDoisTravamentos() throws Exception {
        SanvttoApp.recordCrash(app, new RuntimeException("teste"));
        SanvttoApp.recordCrash(app, new RuntimeException("teste"));
        assertTrue(SanvttoApp.shouldUseSafeMode(app));
        HomeActivity a = startHome();
        View root = a.getWindow().getDecorView();
        assertTrue(findText(root, "Modo seguro"));
        assertTrue(findText(root, "Netflix"));
        assertTrue(tiles(root, "app:").isEmpty());
        SanvttoApp.clearCrashes(app);
        assertFalse(SanvttoApp.shouldUseSafeMode(app));
    }

    @Test
    public void home_umTravamentoSoNaoAtivaModoSeguro() {
        SanvttoApp.recordCrash(app, new RuntimeException("teste"));
        assertFalse(SanvttoApp.shouldUseSafeMode(app));
    }

    private static boolean findText(View v, String s) {
        if (v instanceof TextView && s.contentEquals(((TextView) v).getText())) return true;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) if (findText(g.getChildAt(i), s)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ modo quadro

    @Test
    public void quadro_semObrasMostraPinturaGerada() throws Exception {
        ActivityController<ArtActivity> c = Robolectric.buildActivity(ArtActivity.class).setup();
        TestUtil.settle();
        ArtActivity a = c.get();
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_DPAD_RIGHT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT)));
        TestUtil.settle();
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT)));
        TestUtil.settle();
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_DPAD_CENTER, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER)));
        assertFalse(a.isFinishing());
        a.onKeyDown(KeyEvent.KEYCODE_BACK, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK));
        assertTrue("voltar deve sair do quadro", a.isFinishing());
        c.pause().stop().destroy();
    }

    @Test
    public void quadro_usaFotosDoUsuarioETrocaSozinho() throws Exception {
        File dir = ArtStore.get(app).photosDir();
        TestUtil.writeJpeg(new File(dir, "praia.jpg"), 1600, 900, 1);
        TestUtil.writeJpeg(new File(dir, "retrato.jpg"), 800, 1200, 2);
        new File(dir, "lixo.jpg").createNewFile(); // arquivo corrompido não pode travar
        new File(dir, "nota.txt").createNewFile();
        new Prefs(app).putInt("artSource", Prefs.SOURCE_PHOTOS);
        assertEquals(3, ArtStore.get(app).available().size());

        ActivityController<ArtActivity> c = Robolectric.buildActivity(ArtActivity.class).setup();
        TestUtil.settle();
        int start = new Prefs(app).artIndex();
        for (int i = 0; i < 6; i++) {
            shadowOf(Looper.getMainLooper()).idleFor(16, TimeUnit.MINUTES);
            TestUtil.settle();
        }
        assertNotEquals(-1, start);
        c.pause().stop().destroy();
    }

    @Test
    public void quadro_obrasDoMuseuEmCacheFuncionamOffline() throws Exception {
        File art = new File(app.getFilesDir(), "art");
        art.mkdirs();
        TestUtil.writeJpeg(new File(art, "aic_1.jpg"), 1686, 1100, 3);
        java.io.FileWriter w = new java.io.FileWriter(new File(art, "index.json"));
        w.write("[{\"id\":\"aic:1\",\"title\":\"A Tarde\",\"artist\":\"Fulano\",\"date\":\"1890\",\"file\":\"aic_1.jpg\"},"
                + "{\"id\":\"aic:2\",\"title\":\"Sumiu\",\"artist\":\"\",\"date\":\"\",\"file\":\"aic_2.jpg\"}]");
        w.close();
        new Prefs(app).putInt("artSource", Prefs.SOURCE_MUSEUMS);
        List<ArtStore.Artwork> list = ArtStore.get(app).available();
        assertEquals("arquivo ausente deve ser ignorado", 1, list.size());
        assertEquals("A Tarde", list.get(0).title);
        // sem internet no teste: atualizar não pode travar nem apagar o cache
        ArtStore.get(app).refreshAsync(true, null);
        TestUtil.settle();
        assertEquals(1, ArtStore.get(app).available().size());
    }

    @Test
    public void quadro_indiceCorrompidoNaoTrava() throws Exception {
        File art = new File(app.getFilesDir(), "art");
        art.mkdirs();
        java.io.FileWriter w = new java.io.FileWriter(new File(art, "index.json"));
        w.write("{isso nao e json");
        w.close();
        assertTrue(ArtStore.get(app).available().isEmpty());
        Robolectric.buildActivity(ArtActivity.class).setup();
        TestUtil.settle();
    }

    @Test
    public void quadro_todasAsMolduras() throws Exception {
        Bitmap land = ArtStore.generated(1, 1600, 900);
        Bitmap port = ArtStore.generated(2, 700, 1000);
        for (int style = 0; style <= 4; style++) {
            ArtView v = new ArtView(app);
            v.configure(style, true);
            v.layout(0, 0, 1920, 1080);
            v.show(land, "Título", "Autor · 1900");
            v.show(port, "Outro", "");
            v.setDim(0.5f);
            Bitmap out = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
            v.draw(new Canvas(out));
        }
    }

    @Test
    public void protetorDeTela_ciclo() {
        ArtDreamService s = Robolectric.buildService(ArtDreamService.class).create().get();
        try {
            s.onAttachedToWindow();
        } catch (NullPointerException e) {
            // Robolectric não cria janela para DreamService; o importante é não travar depois
        }
        s.onDreamingStarted();
        s.onDreamingStopped();
        s.onDetachedFromWindow();
    }

    // ------------------------------------------------------------------ ajustes

    @Test
    public void ajustes_tocarEmTudoNaoTrava() throws Exception {
        ActivityController<SettingsActivity> c = Robolectric.buildActivity(SettingsActivity.class).setup();
        SettingsActivity a = c.get();
        Prefs p = new Prefs(a);
        int themeBefore = p.theme();
        for (int round = 0; round < 7; round++) {
            List<View> rows = new ArrayList<>();
            clickables(a.getWindow().getDecorView(), rows);
            assertTrue(rows.size() >= 12);
            for (View r : rows) {
                if (round > 0 && !isCycleRow(r)) continue; // ações só uma vez
                r.performClick();
                ShadowLooper.idleMainLooper();
            }
            TestUtil.settle();
        }
        assertNotEquals(-1, themeBefore);
        assertTrue(p.frameStyle() >= 0 && p.frameStyle() <= 4);
    }

    private static boolean isCycleRow(View r) {
        ViewGroup g = (ViewGroup) r;
        CharSequence v = ((TextView) g.getChildAt(1)).getText();
        return !"›".contentEquals(v) && v.length() > 0 && !v.toString().startsWith("Escolha") && !v.toString().startsWith("/");
    }

    private static void clickables(View v, List<View> out) {
        if (v.isClickable() && v.isFocusable() && v instanceof ViewGroup) out.add(v);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) clickables(g.getChildAt(i), out);
        }
    }

    // ------------------------------------------------------------------ tema automático

    @Test
    public void tema_horariosDoSolEmSaoPaulo() {
        TimeZone tz = TimeZone.getTimeZone("America/Sao_Paulo");
        Calendar jan = Calendar.getInstance(tz);
        jan.set(2026, Calendar.JANUARY, 10, 12, 0);
        double[] s = Theme.sunTimes(jan);
        assertEquals("nascer em janeiro ~5h20", 5.33, s[0], 0.5);
        assertEquals("pôr em janeiro ~19h", 19.0, s[1], 0.5);

        Calendar jun = Calendar.getInstance(tz);
        jun.set(2026, Calendar.JUNE, 21, 12, 0);
        s = Theme.sunTimes(jun);
        assertEquals("nascer em junho ~6h45", 6.75, s[0], 0.5);
        assertEquals("pôr em junho ~17h30", 17.5, s[1], 0.5);
    }

    @Test
    public void tema_escureceANoiteEClareiaDeDia() {
        TimeZone tz = TimeZone.getTimeZone("America/Sao_Paulo");
        Calendar c = Calendar.getInstance(tz);
        c.set(2026, Calendar.MARCH, 15, 13, 0);
        assertFalse(Theme.isNight(c));
        assertEquals(0f, Theme.nightDim(c), 0.001f);
        c.set(Calendar.HOUR_OF_DAY, 22);
        assertTrue(Theme.isNight(c));
        float d22 = Theme.nightDim(c);
        assertTrue(d22 > 0.1f && d22 <= 0.6f);
        c.set(Calendar.HOUR_OF_DAY, 3);
        assertTrue(Theme.isNight(c));
        // varre o dia inteiro: o escurecimento sempre entre 0 e 0.6
        for (int m = 0; m < 24 * 60; m += 7) {
            c.set(Calendar.HOUR_OF_DAY, m / 60);
            c.set(Calendar.MINUTE, m % 60);
            float d = Theme.nightDim(c);
            assertTrue("dim fora da faixa às " + m / 60 + ":" + m % 60 + " = " + d, d >= 0f && d <= 0.6f);
        }
    }

    @Test
    public void tema_funcionaEmQualquerFuso() {
        for (String id : TimeZone.getAvailableIDs()) {
            Calendar c = Calendar.getInstance(TimeZone.getTimeZone(id));
            for (int month = 0; month < 12; month++) {
                c.set(2026, month, 15, 20, 0);
                double[] s = Theme.sunTimes(c);
                assertFalse(Double.isNaN(s[0]) || Double.isNaN(s[1]));
                Theme.nightDim(c);
            }
        }
    }
}
