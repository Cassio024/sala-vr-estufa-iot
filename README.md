# Sala VR - Estufa IoT

Sala de realidade virtual feita com **three.js** e **WebXR**, onde um sistema de irrigação IoT pode ser observado e controlado com o controle do headset.

## O que tem na sala

| Item | Função |
|---|---|
| Sensor de umidade (haste no vaso) | Lê a umidade do solo (0–100%). Com o tempo, a terra seca sozinha. |
| Bomba d'água + tubo | Liga sozinha quando a umidade cai abaixo de 35% e desliga ao chegar em 70% (modo automático). |
| Sensor de proximidade (esfera azul) | Dispara quando a mão/controle entra na área azul. Com o gatilho, faz uma rega manual. |
| Botão de modo (caixa cinza) | Alterna entre **automático** e **manual**. |
| Painel na parede | Mostra umidade, estado da bomba, modo, proximidade e últimos eventos. |

## Como jogar

**No headset (VR):**
- Clique em **Enter VR**.
- Aponte o controle para o **botão de modo** e aperte o gatilho para trocar entre automático e manual.
- No modo manual, aponte para a **esfera azul** e aperte o gatilho para regar.

**No computador (teste sem headset):**
- `M` troca o modo.
- `Espaço` faz a rega manual.

## Como rodar

WebXR só funciona em **HTTPS** ou em `localhost`. Por isso:

1. Clone o repositório e abra a pasta.
2. Suba um servidor local, por exemplo:
   ```bash
   python -m http.server 8080
   ```
   ou `npx serve .`
3. Abra `http://localhost:8080` no navegador.

Para usar no **Meta Quest** (ou outro headset), o jeito mais simples é publicar no **GitHub Pages** (veja abaixo) e abrir o link no navegador do headset.

## Publicar no GitHub Pages

1. No GitHub, vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Depois de alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Estrutura

```
index.html        -> página, import map do three.js e botão VR
js/main.js        -> cena, WebXR, controles, visual dos dispositivos
js/sensors.js     -> lógica dos sensores, da bomba e do modo automático
```

A lógica de irrigação fica separada em `sensors.js` para facilitar a troca por dados reais.

## Próximos passos (integração com o ESP32)

Hoje os sensores são **simulados** em `js/sensors.js`. Para ligar ao hardware real:

1. Trocar `SoilMoistureSensor.read()` por uma leitura vinda do ESP32 (MQTT via WebSocket ou uma API HTTP).
2. Enviar comandos de bomba de volta ao ESP32 em `IrrigationController`, no lugar de só mudar `pumpOn`.
3. Manter a mesma interface (`read`, `addWater`, `update`), e a sala continua funcionando.

## Tecnologias

- [three.js](https://threejs.org/) 0.170.0 (carregado pelo CDN jsDelivr)
- WebXR Device API (`VRButton` do three.js)
