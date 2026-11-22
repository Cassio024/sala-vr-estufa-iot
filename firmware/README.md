# Firmware — Estufa Inteligente (Wokwi)

Projeto Wokwi: **projeto_pra_vr**
Link: https://wokwi.com/projects/481428343946592257

## Hardware simulado
- Placa: ESP32 DevKit C v4
- Sensor de solo (umidade): pino 34 (analógico)
- LDR (luminosidade): pino 35 (analógico)
- DHT22 (temperatura/umidade do ar): pino 15
- HC-SR04 (proximidade): trig 5, echo 18
- Relé (bomba d'água): pino 26

## Bibliotecas
- WiFi (embutida no core ESP32)
- PubSubClient
- DHT sensor library
- ArduinoJson

## Contrato MQTT (integração com a Sala VR)
Broker: `broker.hivemq.com` (porta 1883 no ESP32; WebSocket `ws://broker.hivemq.com:8000/mqtt` no navegador)

| Tópico | Direção | Conteúdo |
|---|---|---|
| `estufa/vr/telemetria` | ESP32 → Sala VR | JSON: `umidadeSolo`, `temperatura`, `umidadeAr`, `luz`, `distancia`, `proximidade`, `bomba`, `modoManual` (a cada 1s) |
| `estufa/vr/bomba/cmd` | Sala VR → ESP32 | `ON`, `OFF` ou `AUTO` |
| `estufa/vr/config` | Sala VR → ESP32 | JSON: `{"min": <limiarLigar>, "max": <limiarDesligar>}` |

## Lógica da bomba
- Modo automático: liga quando `umidadeSolo < limiarLigar` (padrão 35%), desliga quando `umidadeSolo >= limiarDesligar` (padrão 70%).
- Modo manual: comandos via `estufa/vr/bomba/cmd`.
- Limites ajustáveis em tempo real pelo painel VR via `estufa/vr/config`.

## Como rodar
- **Wokwi web:** abra o link do projeto acima.
- **Wokwi for VS Code:** abra esta pasta (`firmware/`) no VS Code com a extensão Wokwi instalada e inicie a simulação.

## Arquivos
- `sketch.ino` — código do ESP32 (Arduino C++).
- `diagram.json` — circuito (exportado do Wokwi).
- `libraries.txt` — bibliotecas externas.
- `wokwi.toml` — configuração (se exportado).

> `diagram.json` e `wokwi.toml` devem ser adicionados a partir do **Download Project** do Wokwi (menu ⋯ → Download Project), se ainda não estiverem aqui.
