package com.sanvtto.tv;

import android.service.dreams.DreamService;

/** O mesmo modo quadro como protetor de tela do sistema (abre sozinho com a TV parada). */
public class ArtDreamService extends DreamService {
    private ArtController controller;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        ArtView view = new ArtView(this);
        setContentView(view);
        controller = new ArtController(this, view);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (controller != null) controller.start();
    }

    @Override
    public void onDreamingStopped() {
        if (controller != null) controller.stop();
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (controller != null) controller.stop();
        super.onDetachedFromWindow();
    }
}
