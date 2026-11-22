// Sensores e atuador simulados.
// Para usar o ESP32 de verdade depois, troque estas classes por uma versão
// que receba as leituras por MQTT (ou HTTP) e mantenha os mesmos métodos.

// Sensor de umidade do solo (capacitivo). Valor em %, de 0 a 100.
export class SoilMoistureSensor {
  constructor({ initial = 55, evaporationPerSec = 1.2 } = {}) {
    this.value = initial;
    this.evaporationPerSec = evaporationPerSec;
  }

  // A terra seca sozinha com o tempo.
  update(dt) {
    this.value = Math.max(0, this.value - this.evaporationPerSec * dt);
  }

  addWater(percent) {
    this.value = Math.min(100, this.value + percent);
  }

  read() {
    return this.value;
  }
}

// Sensor de proximidade: "dispara" quando um ponto (a mão/controle) entra no raio.
export class ProximitySensor {
  constructor(position, range = 0.22) {
    this.position = position.clone();
    this.range = range;
  }

  isTriggered(point) {
    return point.distanceTo(this.position) <= this.range;
  }
}

// Controle da bomba: modo automático com histerese e modo manual.
export class IrrigationController {
  constructor({
    lowThreshold = 35,     // liga a bomba abaixo disso
    targetLevel = 70,      // desliga quando chega aqui
    pumpRatePerSec = 14,   // % de umidade que a bomba adiciona por segundo
    manualDurationSec = 3, // tempo de rega ao acionar manualmente
  } = {}) {
    this.lowThreshold = lowThreshold;
    this.targetLevel = targetLevel;
    this.pumpRatePerSec = pumpRatePerSec;
    this.manualDurationSec = manualDurationSec;

    this.mode = 'auto'; // 'auto' | 'manual'
    this.pumpOn = false;
    this.manualTimer = 0;
    this.log = [];
  }

  toggleMode() {
    this.mode = this.mode === 'auto' ? 'manual' : 'auto';
    this.pumpOn = false;
    this.manualTimer = 0;
    this.event(`Modo alterado para ${this.mode === 'auto' ? 'automático' : 'manual'}`);
  }

  requestManualWater() {
    if (this.manualTimer <= 0) this.event('Rega manual iniciada');
    this.manualTimer = this.manualDurationSec;
  }

  // Retorna quanta umidade (em %) a bomba adiciona neste frame.
  update(dt, moisture) {
    if (this.mode === 'auto') {
      if (!this.pumpOn && moisture < this.lowThreshold) {
        this.pumpOn = true;
        this.event(`Solo com ${moisture.toFixed(0)}%: bomba ligada`);
      } else if (this.pumpOn && moisture >= this.targetLevel) {
        this.pumpOn = false;
        this.event(`Meta de ${this.targetLevel}% atingida: bomba desligada`);
      }
    } else {
      this.pumpOn = this.manualTimer > 0;
      if (this.manualTimer > 0) this.manualTimer -= dt;
    }

    return this.pumpOn ? this.pumpRatePerSec * dt : 0;
  }

  event(message) {
    this.log.unshift(message);
    if (this.log.length > 4) this.log.pop();
  }
}
