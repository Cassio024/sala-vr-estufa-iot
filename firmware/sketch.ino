#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// --- Configurações de Rede e MQTT ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "broker.hivemq.com"; // Suporta WebSockets na sala VR (ws://broker.hivemq.com:8000/mqtt)
const int mqtt_port = 1883;

// Tópicos MQTT (Ajuste conforme o projeto Estufa Inteligente)
const char* TOPIC_TELEMETRIA = "estufa/vr/telemetria";
const char* TOPIC_CMD_BOMBA  = "estufa/vr/bomba/cmd";
const char* TOPIC_CONFIG     = "estufa/vr/config";

// --- Pinos dos Sensores e Atuadores ---
#define PIN_SOLO 34
#define PIN_LDR  35
#define PIN_RELE 26
#define PIN_TRIG 5
#define PIN_ECHO 18
#define PIN_DHT  15

DHT dht(PIN_DHT, DHT22);
WiFiClient espClient;
PubSubClient client(espClient);

// --- Variáveis de Estado e Histerese ---
float limiarLigar = 35.0;     // Liga abaixo de 35%
float limiarDesligar = 70.0;  // Desliga em 70%
bool bombaLigada = false;
bool modoManual = false;
unsigned long ultimoEnvio = 0;

void setup_wifi() {
  delay(10);
  Serial.print("Conectando ao Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi conectado!");
}

// Recebe comandos da Sala VR (Ligar/Desligar bomba ou alterar limites)
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.printf("Mensagem recebida [%s]: %s\n", topic, msg.c_str());

  // Comando direto para a bomba vindo da Sala VR
  if (String(topic) == TOPIC_CMD_BOMBA) {
    if (msg == "ON") {
      modoManual = true;
      bombaLigada = true;
    } else if (msg == "OFF") {
      modoManual = true;
      bombaLigada = false;
    } else if (msg == "AUTO") {
      modoManual = false;
    }
    digitalWrite(PIN_RELE, bombaLigada ? HIGH : LOW);
  }

  // Atualização dinâmica dos limites de histerese via painel VR
  if (String(topic) == TOPIC_CONFIG) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, msg);
    if (!error) {
      if (doc.containsKey("min")) limiarLigar = doc["min"];
      if (doc.containsKey("max")) limiarDesligar = doc["max"];
      Serial.printf("Novos limites: Ligar < %.1f%% | Desligar >= %.1f%%\n", limiarLigar, limiarDesligar);
    }
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Conectando ao Broker MQTT...");
    String clientId = "ESP32-EstufaVR-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println("Conectado!");
      client.subscribe(TOPIC_CMD_BOMBA);
      client.subscribe(TOPIC_CONFIG);
    } else {
      Serial.print("Falha, rc=");
      Serial.print(client.state());
      Serial.println(" Tentando novamente em 3s...");
      delay(3000);
    }
  }
}

// Leitura do sensor de proximidade HC-SR04 (em cm)
float lerDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracao = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracao == 0) return 999.0;
  return duracao * 0.034 / 2.0;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELE, OUTPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_RELE, LOW);

  dht.begin();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Envia telemetria a cada 1 segundo (para alimentar o gráfico e detectar timeout na sala)
  if (millis() - ultimoEnvio > 1000) {
    ultimoEnvio = millis();

    // 1. Leitura dos sensores
    int rawSolo = analogRead(PIN_SOLO);
    float umidadeSolo = map(rawSolo, 0, 4095, 0, 100);

    int rawLdr = analogRead(PIN_LDR);
    // No módulo LDR do Wokwi, menor valor analógico = mais luz
    float luminosidade = map(rawLdr, 4095, 0, 0, 100);

    float tempAr = dht.readTemperature();
    float umidAr = dht.readHumidity();
    if (isnan(tempAr)) tempAr = 24.0;
    if (isnan(umidAr)) umidAr = 60.0;

    float distancia = lerDistancia();
    bool proximidadeDetectada = (distancia < 50.0); // Alerta se alguém chegar a menos de 50cm

    // 2. Lógica automática da bomba com Histerese
    if (!modoManual) {
      if (!bombaLigada && umidadeSolo < limiarLigar) {
        bombaLigada = true;
      } else if (bombaLigada && umidadeSolo >= limiarDesligar) {
        bombaLigada = false;
      }
      digitalWrite(PIN_RELE, bombaLigada ? HIGH : LOW);
    }

    // 3. Monta o JSON para a Sala VR
    StaticJsonDocument<256> doc;
    doc["umidadeSolo"] = umidadeSolo;
    doc["temperatura"] = tempAr;
    doc["umidadeAr"]   = umidAr;
    doc["luz"]         = luminosidade;
    doc["distancia"]   = distancia;
    doc["proximidade"] = proximidadeDetectada;
    doc["bomba"]       = bombaLigada;
    doc["modoManual"]  = modoManual;

    char buffer[256];
    serializeJson(doc, buffer);

    client.publish(TOPIC_TELEMETRIA, buffer);
    Serial.println(buffer);
  }
}
