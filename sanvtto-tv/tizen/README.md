# Sanvtto TV para Samsung (Tizen)

Versão para TVs Samsung com Tizen (testada para a **Crystal UHD BU8000**, Tizen 6.5). Tem o mesmo visual e a mesma lógica do app Android:
tela inicial no estilo Apple TV, tema que escurece sozinho com o pôr do sol, modo quadro no estilo The Frame e modo seguro.

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
Configurações → Geral → Recursos Inteligentes → **Executar último app** (ligado). Se o último app usado for o Sanvtto TV, a TV já liga nele.

### Para desfazer
Apps → Sanvtto TV → segure OK → **Excluir**. Nada no sistema da TV é alterado.

## Teclas
- **Setas / OK**: navegar e abrir. **Segurar OK**: menu do app (favoritar, mover, remover).
- **Voltar**: fecha menus. Na tela inicial, só volta ao topo, sem nunca fechar o app.
- No **quadro**: ← → trocam a obra, OK mostra título e autor, qualquer outra tecla volta.

## Desenvolvimento

```bash
./build-wgt.sh                      # gera release/SanvttoTV.wgt
cd tests && npm install && npm test # 21 testes no Chromium com a API da TV simulada (prints em test-output/)
```
