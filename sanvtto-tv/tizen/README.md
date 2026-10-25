# Sanvtto TV para Samsung (Tizen)

Versão para TVs Samsung com Tizen, feita para a **Crystal UHD BU8000** (Tizen 6.5) e testada num navegador com a API da TV simulada. Inclui:

- **Visual de vidro** (Liquid Glass, como no macOS 26/27): cards, botões e menus translúcidos com bordas de luz, e a obra do quadro aparecendo
  desfocada atrás. Em **Ajustes → Transparência** dá para escolher **Vidro**, **Média** ou **Reduzida** (para quando a leitura ficar difícil).
- **Tela inicial** no estilo Apple TV e **tema que escurece sozinho** com o pôr do sol.
- **Modo quadro** no estilo do Modo Arte da The Frame: passe-partout **Moderno** ou **Shadowbox**, moldura de madeira ou preta, 7 cores
  (Polar, Quente, Neutro, Sálvia, Areia, Vinho, Preto). Aperte **↓** no quadro para abrir a **galeria**, com as obras, os estilos e as cores.
- **Modo seguro** se der erro.
- **Ajustes › Diagnóstico** mostra quantos apps a TV entregou e se as obras baixaram (com o erro, se houver).
  Se a TV não liberar a lista de apps, o app usa uma lista reserva (Netflix, YouTube, Prime Video, Disney+, Spotify, Apple TV, Plex).
  As obras vêm do Wikimedia Commons, do Art Institute of Chicago ou do Met (o que funcionar), e aparecem direto da internet se a TV não deixar guardar.
- A grade esconde as peças internas do sistema e apps repetidos (filtro baseado no do [Free My TV](https://github.com/simbasjungles/free-my-tv)).
  Se ainda sobrar algum app que você não quer: segure OK nele → **Ocultar este app**. Para trazer de volta: Ajustes → **Mostrar apps ocultos**.
- **Entradas HDMI** (PS4, Xbox...) aparecem como atalhos: segure OK → **Renomear** para escolher o aparelho (nome e ícone).
  A HDMI 1 já vem como PS4 e entra nos favoritos. Ícones de YouTube, Prime Video, Netflix etc. vêm do [Simple Icons](https://simpleicons.org) (CC0).
- O quadro guarda pelo menos 20 obras e troca a cada 10 segundos (ajustável em Ajustes → Trocar obra a cada).

## O que a Samsung permite e o que não permite

| Recurso | Na BU8000 |
|---|---|
| Tela inicial com favoritos e todos os apps | ✅ (lista os apps pela API oficial `tizen.application`) |
| Abrir Netflix, YouTube etc. | ✅ |
| Tema automático, modo quadro, obras de museus offline | ✅ |
| Quadro sem a proteção de tela da Samsung por cima | ✅ (`webapis.appcommon.setScreenSaver`) |
| **Substituir o Smart Hub / ficar sempre por cima** | ❌ A Samsung não permite. O botão Home sempre abre o Smart Hub. |
| Abrir sozinho ao ligar a TV | ⚠️ Só com "Executar último app" (veja abaixo) |

## Instalar pelo Wi-Fi (sem cabo)

1. **IP da TV**: Configurações → Geral → Rede → Status da rede → Configurações de IP. Anote (ex.: `192.168.0.25`).
2. **IP do computador**: no Windows, rode `ipconfig` e procure "Endereço IPv4".
3. **Modo desenvolvedor na TV**: abra **Apps**, aperte `1 2 3 4 5` no controle (se o controle não tiver números, use o teclado virtual
   que aparece), ligue **Developer mode** e digite o IP do computador. Depois desligue a TV segurando o botão de energia por 5 s
   e ligue de novo.
4. No computador, instale o **[Jellyfin2Samsung](https://github.com/Jellyfin2Samsung/Samsung-Jellyfin-Installer/releases)**. Ele não serve
   só para o Jellyfin: instala qualquer `.wgt`, acha a TV na rede e cria o certificado Samsung (pede login na sua conta Samsung uma vez).
5. Escolha a TV, selecione **arquivo .wgt personalizado** → `release/SanvttoTV.wgt` → instalar.
6. O "Sanvtto TV" aparece em **Apps**. Para deixá-lo no começo da barra do Smart Hub: Apps → segure OK no ícone → **Mover**.

### Para abrir sozinho ao ligar
Configurações → Todas as configurações → Geral e Privacidade → **Opções da tela inicial** → **Executar último app** (ligado)
e **Iniciar com a tela inicial do Smart Hub** (desligado). Se o último app usado for o Sanvtto TV, a TV já liga nele.
Parado por 5 minutos em qualquer tela do Sanvtto TV, ele vira quadro sozinho.

### Para desfazer
Apps → Sanvtto TV → segure OK → **Excluir**. Nada no sistema da TV é alterado.

## Teclas
- **Setas / OK**: navegar e abrir. **Segurar OK**: menu do app (favoritar, mover, remover).
- **Voltar**: fecha menus. Na tela inicial, só volta ao topo, sem nunca fechar o app.
- No **quadro**: ← → trocam a obra, OK mostra título e autor, **↓ abre a galeria** e Voltar sai.
- Na **galeria**: OK escolhe, ↑ na primeira fileira fecha.

## Desenvolvimento

```bash
./build-wgt.sh                      # gera release/SanvttoTV.wgt
cd tests && npm install && npm test # 40 testes no Chromium com a API da TV simulada (prints em test-output/)
```
