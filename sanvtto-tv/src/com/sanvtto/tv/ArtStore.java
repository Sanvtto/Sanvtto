package com.sanvtto.tv;

import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Acervo do modo quadro: obras em domínio público de museus (Art Institute of Chicago,
 * com o Metropolitan Museum como reserva), guardadas em cache para funcionar offline,
 * mais as fotos do próprio usuário.
 */
final class ArtStore {

    static final class Artwork {
        String id, title, artist, date;
        File file;
    }

    private static final int MAX_CACHED = 60;
    private static final int PER_REFRESH = 10;
    private static final long REFRESH_EVERY_MS = 12L * 60 * 60 * 1000;
    private static final String UA = "SanvttoTV/1.0 (Android TV art mode; personal use)";

    static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private static ArtStore instance;
    private final Context ctx;
    private final File dir;
    private final File index;
    private final Prefs prefs;
    private volatile boolean refreshing;

    static synchronized ArtStore get(Context c) {
        Context app = c.getApplicationContext();
        if (instance == null || instance.ctx != app) instance = new ArtStore(app);
        return instance;
    }

    private ArtStore(Context c) {
        ctx = c;
        dir = new File(c.getFilesDir(), "art");
        dir.mkdirs();
        index = new File(dir, "index.json");
        prefs = new Prefs(c);
    }

    /** Pasta onde o usuário coloca as próprias fotos (via adb push, sem permissão extra). */
    File photosDir() {
        File f = ctx.getExternalFilesDir("Quadro");
        if (f != null) f.mkdirs();
        return f;
    }

    /** Todas as obras disponíveis agora, sem rede. */
    synchronized List<Artwork> available() {
        List<Artwork> out = new ArrayList<>();
        int source = prefs.artSource();
        if (source != Prefs.SOURCE_MUSEUMS) addPhotos(out);
        if (source != Prefs.SOURCE_PHOTOS || out.isEmpty()) out.addAll(readIndex());
        return out;
    }

    private void addPhotos(List<Artwork> out) {
        List<File> dirs = new ArrayList<>();
        File own = photosDir();
        if (own != null) dirs.add(own);
        if (canReadPictures()) {
            dirs.add(new File(Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_PICTURES), "Quadro"));
        }
        List<Artwork> photos = new ArrayList<>();
        for (File d : dirs) {
            File[] files = d.listFiles();
            if (files == null) continue;
            for (File f : files) {
                String n = f.getName().toLowerCase();
                if (!(n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp")))
                    continue;
                Artwork a = new Artwork();
                a.id = "photo:" + f.getAbsolutePath();
                a.title = f.getName().replaceFirst("\\.[^.]+$", "").replace('_', ' ');
                a.artist = "Minhas fotos";
                a.date = "";
                a.file = f;
                photos.add(a);
            }
        }
        Collections.sort(photos, (a, b) -> a.title.compareToIgnoreCase(b.title));
        out.addAll(photos);
    }

    private boolean canReadPictures() {
        String perm = Build.VERSION.SDK_INT >= 33
                ? "android.permission.READ_MEDIA_IMAGES"
                : "android.permission.READ_EXTERNAL_STORAGE";
        return ctx.checkPermission(perm, android.os.Process.myPid(), android.os.Process.myUid())
                == PackageManager.PERMISSION_GRANTED;
    }

    private List<Artwork> readIndex() {
        List<Artwork> out = new ArrayList<>();
        try {
            if (!index.exists()) return out;
            JSONArray arr = new JSONArray(new String(readAll(new java.io.FileInputStream(index)), "UTF-8"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                Artwork a = new Artwork();
                a.id = o.optString("id");
                a.title = o.optString("title");
                a.artist = o.optString("artist");
                a.date = o.optString("date");
                a.file = new File(dir, o.optString("file"));
                if (a.file.exists()) out.add(a);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private void writeIndex(List<Artwork> list) {
        try {
            JSONArray arr = new JSONArray();
            for (Artwork a : list) {
                JSONObject o = new JSONObject();
                o.put("id", a.id);
                o.put("title", a.title);
                o.put("artist", a.artist);
                o.put("date", a.date);
                o.put("file", a.file.getName());
                arr.put(o);
            }
            File tmp = new File(dir, "index.tmp");
            OutputStream os = new FileOutputStream(tmp);
            os.write(arr.toString().getBytes("UTF-8"));
            os.close();
            tmp.renameTo(index);
        } catch (Exception ignored) {
        }
    }

    /** Baixa obras novas em segundo plano, no máximo a cada 12 h (ou já, se force). */
    void refreshAsync(final boolean force, final Runnable done) {
        if (refreshing || prefs.artSource() == Prefs.SOURCE_PHOTOS) return;
        if (!force && System.currentTimeMillis() - prefs.lastArtFetch() < REFRESH_EVERY_MS
                && readIndex().size() >= 12) return;
        if (!online()) return;
        refreshing = true;
        IO.execute(() -> {
            try {
                List<Artwork> fresh = fetchArtInstitute();
                if (fresh.isEmpty()) fresh = fetchMet();
                if (!fresh.isEmpty()) {
                    synchronized (ArtStore.this) {
                        List<Artwork> all = readIndex();
                        all.addAll(0, fresh);
                        while (all.size() > MAX_CACHED) {
                            Artwork old = all.remove(all.size() - 1);
                            old.file.delete();
                        }
                        writeIndex(all);
                    }
                    prefs.setLastArtFetch(System.currentTimeMillis());
                }
            } catch (Throwable ignored) {
            } finally {
                refreshing = false;
                if (done != null) done.run();
            }
        });
    }

    private List<Artwork> fetchArtInstitute() {
        List<Artwork> out = new ArrayList<>();
        try {
            int page = 1 + new Random().nextInt(20);
            String url = "https://api.artic.edu/api/v1/artworks/search"
                    + "?query%5Bbool%5D%5Bmust%5D%5B0%5D%5Bterm%5D%5Bis_public_domain%5D=true"
                    + "&query%5Bbool%5D%5Bmust%5D%5B1%5D%5Bterm%5D%5Bartwork_type_id%5D=1"
                    + "&fields=id,title,image_id,artist_title,date_display,thumbnail"
                    + "&limit=40&page=" + page;
            JSONObject res = new JSONObject(new String(get(url), "UTF-8"));
            JSONArray data = res.getJSONArray("data");
            String iiif = res.optJSONObject("config") != null
                    ? res.getJSONObject("config").optString("iiif_url", "https://www.artic.edu/iiif/2")
                    : "https://www.artic.edu/iiif/2";
            List<JSONObject> items = new ArrayList<>();
            for (int i = 0; i < data.length(); i++) items.add(data.getJSONObject(i));
            Collections.shuffle(items);
            List<Artwork> known = readIndex();
            for (JSONObject o : items) {
                if (out.size() >= PER_REFRESH) break;
                String imageId = o.optString("image_id", "");
                if (imageId.isEmpty() || "null".equals(imageId)) continue;
                String id = "aic:" + o.optInt("id");
                if (contains(known, id)) continue;
                JSONObject th = o.optJSONObject("thumbnail");
                if (th != null && th.optInt("width") > 0 && th.optInt("height") > 0) {
                    float ratio = th.optInt("width") / (float) th.optInt("height");
                    if (ratio < 0.55f || ratio > 2.4f) continue; // muito estreita para a TV
                }
                Artwork a = new Artwork();
                a.id = id;
                a.title = o.optString("title", "Sem título");
                a.artist = cleanNull(o.optString("artist_title", ""));
                a.date = cleanNull(o.optString("date_display", ""));
                a.file = new File(dir, "aic_" + o.optInt("id") + ".jpg");
                if (download(iiif + "/" + imageId + "/full/1686,/0/default.jpg", a.file)) out.add(a);
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    private List<Artwork> fetchMet() {
        List<Artwork> out = new ArrayList<>();
        try {
            String url = "https://collectionapi.metmuseum.org/public/collection/v1/search"
                    + "?hasImages=true&isHighlight=true&medium=Paintings&q=painting";
            JSONArray ids = new JSONObject(new String(get(url), "UTF-8")).getJSONArray("objectIDs");
            List<Integer> list = new ArrayList<>();
            for (int i = 0; i < ids.length(); i++) list.add(ids.getInt(i));
            Collections.shuffle(list);
            List<Artwork> known = readIndex();
            int tries = 0;
            for (int objId : list) {
                if (out.size() >= PER_REFRESH || tries++ > 30) break;
                String id = "met:" + objId;
                if (contains(known, id)) continue;
                JSONObject o = new JSONObject(new String(get(
                        "https://collectionapi.metmuseum.org/public/collection/v1/objects/" + objId), "UTF-8"));
                if (!o.optBoolean("isPublicDomain")) continue;
                String img = o.optString("primaryImage", "");
                if (img.isEmpty()) continue;
                Artwork a = new Artwork();
                a.id = id;
                a.title = o.optString("title", "Sem título");
                a.artist = o.optString("artistDisplayName", "");
                a.date = o.optString("objectDate", "");
                a.file = new File(dir, "met_" + objId + ".jpg");
                if (download(img, a.file)) out.add(a);
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    private static boolean contains(List<Artwork> list, String id) {
        for (Artwork a : list) if (a.id.equals(id)) return true;
        return false;
    }

    private static String cleanNull(String s) {
        return s == null || "null".equals(s) ? "" : s;
    }

    private boolean online() {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Throwable t) {
            return true;
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("AIC-User-Agent", UA);
        c.setInstanceFollowRedirects(true);
        return c;
    }

    private static byte[] get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            return readAll(c.getInputStream());
        } finally {
            c.disconnect();
        }
    }

    private static boolean download(String url, File dest) {
        File tmp = new File(dest.getPath() + ".part");
        try {
            HttpURLConnection c = open(url);
            try {
                if (c.getResponseCode() != 200) return false;
                InputStream in = c.getInputStream();
                OutputStream os = new FileOutputStream(tmp);
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                os.close();
                in.close();
            } finally {
                c.disconnect();
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(tmp.getPath(), o);
            if (o.outWidth <= 0) {
                tmp.delete();
                return false;
            }
            return tmp.renameTo(dest);
        } catch (Throwable t) {
            tmp.delete();
            return false;
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    /** Decodifica no tamanho da tela, sem desperdiçar memória. */
    static Bitmap decode(File f, int maxW, int maxH) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            int sample = 1;
            while (o.outWidth / (sample * 2) >= maxW && o.outHeight / (sample * 2) >= maxH) sample *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeFile(f.getPath(), o);
        } catch (Throwable t) {
            return null;
        }
    }

    /** Pintura abstrata gerada na hora, para quando ainda não há nenhuma obra (TV offline). */
    static Bitmap generated(int seed, int w, int h) {
        Random r = new Random(seed);
        int[][] palettes = {
                {0xFF1B3A5B, 0xFFE8B04A, 0xFFD9653B, 0xFF6FA3BF},
                {0xFF2E2A24, 0xFFC9A66B, 0xFF8C3B2E, 0xFFE9E1D3},
                {0xFF0F2D2A, 0xFF5E9C76, 0xFFF0C987, 0xFFB65A3C},
                {0xFF241C35, 0xFFD87C8A, 0xFF5C7AB8, 0xFFF2D7B6},
        };
        int[] p = palettes[Math.abs(seed) % palettes.length];
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(p[0]);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 7; i++) {
            float cx = r.nextFloat() * w, cy = r.nextFloat() * h;
            float rad = (0.25f + r.nextFloat() * 0.45f) * w;
            int col = p[1 + r.nextInt(p.length - 1)];
            paint.setShader(new RadialGradient(cx, cy, rad,
                    new int[]{(col & 0x00FFFFFF) | 0xB0000000, col & 0x00FFFFFF},
                    null, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, rad, paint);
        }
        return b;
    }
}
