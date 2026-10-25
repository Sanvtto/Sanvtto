# Sanvtto TV

Tela inicial leve para **Android TV / Google TV** (APK de ~50 KB, sem bibliotecas e sem anúncios), no estilo da Apple TV:

- **Tela inicial**: relógio, fileira de favoritos e grade com todos os apps. O foco anima como na Apple TV. Para abrir o menu de um app (favoritar, mover, desinstalar), segure OK ou aperte MENU.
- **Tema que escurece sozinho**: calcula o nascer e o pôr do sol do dia e alterna entre claro e escuro.
- **Modo quadro** (inspirado na Samsung The Frame): obras em domínio público do Art Institute of Chicago e do Met, guardadas para funcionar offline, mais as suas fotos. Tem passe-partout ou moldura e escurece aos poucos à noite. Abre sozinho depois de um tempo sem uso e também funciona como protetor de tela do sistema.
- **Modo seguro**: se o app fechar sozinho 2 vezes, a tela inicial vira uma lista simples de apps, para a TV nunca ficar sem tela inicial.

> 📺 **TV Samsung (Tizen)?** Use a versão em [`tizen/`](tizen/README.md). TVs LG (webOS) ainda não são suportadas.

## Compilar

```bash
sudo apt install openjdk-17-jdk aapt apksigner zipalign zip curl
./build.sh            # gera build/sanvtto-tv.apk
```

## Testes

Robolectric, com 20 cenários rodando em 7 versões do Android (5.0 a 14): tela inicial, controle remoto, favoritos, modo quadro, modo seguro, ajustes e tema.

```bash
./build.sh && (cd test && mvn test)
```

Na primeira compilação, o `build.sh` cria uma chave de assinatura em `keystore/`. Ela fica fora do git: guarde-a, porque as atualizações só instalam por cima (sem perder os favoritos) se forem assinadas com a mesma chave.
