# Issues do projeto (para colar no GitHub)

Como usar:
1. No repositório: **Issues → New issue**. Copie o título (linha `###`) e o texto abaixo dele.
2. Em **Labels**, use a área indicada (crie as labels `visual`, `interacao`, `iot`, `qualidade`, `bug` na primeira vez).
3. Em **Projects → New project → Board**, crie as colunas **A fazer**, **Fazendo** e **Feito**
   e coloque cada issue na coluna indicada. As que já estão "Feito" podem ser fechadas logo depois de criar,
   citando o commit (ex.: "Feito em 7c6aba0").

Situação conferida no código em 23/11/2026.

---

## Visual — Pessoa 1 (label `visual`)

### HDRI, tons de cor e sombras suaves
Trocar a luz simples por HDRI (`RGBELoader` + `scene.environment`), ACES Filmic, sRGB e `PCFSoftShadowMap`.
**Coluna:** Feito (`js/environment.js`)

### Texturas PBR na madeira, no piso e na parede
Texturas com cor, normal e rugosidade (ambientCG / Poly Haven).
**Coluna:** Feito (`assets/textures/`)

### Modelos glTF no lugar das formas simples
Vaso, planta, bomba e plantas do jardim em glTF.
**Coluna:** Feito. A planta agora é a versão comprimida da Poly Haven (~8 mil triângulos); só a bomba (150 mil) ainda é pesada demais para o Quest.

### Ambiente completo de estufa
Estrutura de vidro, bancadas com várias plantas, reservatório ligado à bomba, jardim e entrada.
**Coluna:** Feito

### Bloom e efeitos só no PC
`UnrealBloomPass` nos LEDs e no painel, desligado na VR.
**Coluna:** Feito (`js/postfx.js`)

### Névoa e poeira no ar
`scene.fog` e partículas de poeira.
**Coluna:** Feito (`js/effects.js`)

### Água com partículas (InstancedMesh), respingo e poça
Hoje cada gota é um Mesh separado. Trocar por `InstancedMesh`, respingo ao tocar o solo e poça que cresce na terra.
**Coluna:** A fazer

### Planta que cresce por estágios e folhas que murcham animadas
Muda → adulta → florida conforme o tempo com umidade saudável; folhas balançando com um shader simples.
**Coluna:** A fazer

### Ciclo dia/noite e sensor de luz (LDR)
Mudar a cor da luz e do céu com o tempo e mostrar a leitura do LDR.
**Coluna:** A fazer

### [bug] shrub_02.glb está vazio
`assets/models/polyhaven/shrub_02.glb` tem 132 bytes e nenhum objeto: os 7 arbustos desse tipo não aparecem no jardim. Exportar de novo ou remover a linha em `js/props.js`.
**Coluna:** Feito — arquivo removido; shrub_03 e shrub_04 ganharam mais cópias no lugar · label `bug`

### [bug] Vaso flutuando em cima do vaso da mesa (modo completo)
O `planta.glb` já vem com um vaso próprio, que aparece em cima do vaso da mesa. Usar um modelo sem vaso ou esconder o vaso simples.
**Coluna:** Feito — trocado por `polyhaven/potted_plant_01.glb` (sem vaso, ~8 mil triângulos) · label `bug`

---

## Interação — Pessoa 2 (label `interacao`)

### Pegar objetos com o gatilho lateral
Regador e sensor de umidade podem ser pegos e soltos; o sensor pode ser espetado no vaso.
**Coluna:** Feito (`js/interaction.js`)

### Teletransporte e giro pelo analógico
**Coluna:** Feito

### Vibração (haptics) no controle
Ao regar, ao ligar a bomba e quando o sensor de proximidade dispara.
**Coluna:** Feito

### Som espacial (bomba, água, alerta de solo seco)
`THREE.PositionalAudio` com sons gerados por código; libera após o primeiro gesto.
**Coluna:** Feito (`js/audio.js`)

### Raio apontador para os botões na VR
Hoje o gatilho só funciona encostando o controle no botão cinza ou na esfera azul (12 cm). O README diz "aponte o controle".
Adicionar um raio (laser) que muda de cor sobre objetos clicáveis e funciona de longe. Também facilita testar no Immersive Web Emulator.
**Coluna:** A fazer

### Rastreamento de mãos
`XRHandModelFactory` para o sensor de proximidade reagir à mão real, sem controle.
**Coluna:** A fazer

### Tutorial na primeira entrada e botão de reiniciar
O caminho com placas explicativas (`js/intro.js`) já apresenta a estufa. Falta um painel com 3 passos e um botão para reiniciar a simulação.
**Coluna:** Fazendo

---

## IoT — Pessoa 3 (label `iot`)

### Firmware do ESP32 no Wokwi
Sensores de solo, LDR, DHT22 e HC-SR04 e relé da bomba com histerese, publicando por MQTT.
**Coluna:** Feito (`firmware/`)

### Sala recebe a umidade do ESP32 por MQTT (WebSocket)
Hoje a sala ainda usa sensores **simulados**: não existe código MQTT em `js/`. Usar mqtt.js com o broker HiveMQ (WebSocket) e trocar o `read()` do `SoilMoistureSensor` pelo último valor recebido.
**Coluna:** A fazer

### Comando de volta: bomba da sala aciona o relé real
Ao ligar a bomba na sala, publicar no tópico de comando ("gêmeo digital").
**Coluna:** A fazer

### Sensor de proximidade físico mostra aviso na sala
HC-SR04 / VL53L0X: quando alguém chega perto do vaso real, aparece um aviso na sala.
**Coluna:** A fazer

### Mostrar temperatura, umidade do ar e luz no painel
Mesmos tópicos do projeto Estufa Inteligente.
**Coluna:** A fazer

### Gráfico de histórico da umidade e limites configuráveis
Gráfico no painel e botões na sala para mudar os limites (35% / 70%).
**Coluna:** A fazer

### Indicar dado simulado ou real e aviso de timeout
Mostrar no painel se o dado é simulado ou do ESP32, e avisar quando o ESP32 parar de enviar.
**Coluna:** A fazer

---

## Qualidade — Pessoa 4 (label `qualidade`)

### Modo leve para headset standalone
Detecta Quest/Pico: sem modelos pesados, sem jardim, nuvens, poeira e bloom; sombra 1024; `setFoveation(1)`; pixel ratio ≤ 1,5.
Medido: ~61 draw calls no modo leve.
**Coluna:** Feito (`js/quality.js`)

### Diagnóstico ?debug (FPS, draw calls, triângulos, suporte a VR)
**Coluna:** Feito

### Medir FPS num Quest real
Abrir `https://cassio024.github.io/sala-vr-estufa-iot/?debug` no navegador do Quest e confirmar 72–90 FPS. Preencher o checklist de VR do README.
**Coluna:** A fazer (precisa do headset)

### Simplificar bomba.glb
Blender → Decimate para ~10 mil triângulos e texturas de até 1024 px, para aparecer também no Quest. (A planta já foi resolvida com a versão comprimida da Poly Haven.)
**Coluna:** A fazer

### Testes unitários da lógica (sensors.js)
9 testes com `node --test`, sem dependências: histerese, limites 0–100%, sensor fora do solo, modo manual.
**Coluna:** Feito (`tests/`)

### Dividir main.js em módulos
`scene/room.js`, `scene/plant.js`, `scene/devices.js`, `ui/panel.js`, `input.js`...
**Coluna:** Feito (7c6aba0)

### Funcionar offline (three.js local)
three.js 0.170.0 em `vendor/`, sem CDN. (No lugar do Vite: mesmo resultado, sem etapa de build.)
**Coluna:** Feito (1d387e6)

### README com prints, GIF, instruções para o Quest e créditos
**Coluna:** Feito

### Publicação no GitHub Pages
https://cassio024.github.io/sala-vr-estufa-iot/
**Coluna:** Feito
