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
    excessLevel = 90,      // a partir daqui o solo está ENCHARCADO (água em excesso)
    excessRelease = 85,    // abaixo disso o alerta de excesso termina (histerese)
  } = {}) {
    this.lowThreshold = lowThreshold;
    this.targetLevel = targetLevel;
    this.pumpRatePerSec = pumpRatePerSec;
    this.manualDurationSec = manualDurationSec;
    this.excessLevel = excessLevel;
    this.excessRelease = excessRelease;

    this.mode = 'auto'; // 'auto' | 'manual'
    this.pumpOn = false;
    this.manualTimer = 0;
    this.excess = false; // solo encharcado: bomba e rega manual bloqueadas
    this.manualEnded = false;
    this.log = [];
  }

  toggleMode() {
    this.mode = this.mode === 'auto' ? 'manual' : 'auto';
    this.pumpOn = false;
    this.manualTimer = 0;
    this.event(`Modo alterado para ${this.mode === 'auto' ? 'automático' : 'manual'}`);
  }

  // Rega manual (botão REGAR): funciona nos dois modos, por manualDurationSec.
  // Retorna false se foi bloqueada porque o solo está encharcado.
  requestManualWater() {
    if (this.excess) {
      this.event('Rega bloqueada: solo encharcado');
      return false;
    }
    if (this.manualTimer <= 0) this.event('Rega manual iniciada');
    this.manualTimer = this.manualDurationSec;
    return true;
  }

  // Retorna quanta umidade (em %) a bomba adiciona neste frame.
  // moisture = null significa "sensor fora do solo": o modo automático pausa.
  update(dt, moisture) {
    const hasReading = moisture !== null && moisture !== undefined;
    // Água em excesso: o sensor detecta o solo encharcado e o sistema para de regar.
    if (hasReading && !this.excess && moisture >= this.excessLevel) {
      this.excess = true;
      this.pumpOn = false;
      this.manualTimer = 0;
      this.event(`Água em excesso (${moisture.toFixed(0)}%): rega bloqueada`);
    } else if (this.excess && (!hasReading || moisture < this.excessRelease)) {
      this.excess = false;
      if (hasReading) this.event('Umidade normalizada: rega liberada');
    }
    if (this.excess) {
      this.pumpOn = false;
      return 0;
    }

    if (this.manualTimer > 0) {
      // Rega manual pedida (vale também no automático).
      this.pumpOn = true;
      this.manualTimer -= dt;
      this.manualEnded = this.manualTimer <= 0;
      return this.pumpRatePerSec * dt;
    }
    if (this.manualEnded) {
      // Acabou o tempo da rega manual: desliga e devolve o controle ao modo atual.
      this.manualEnded = false;
      this.pumpOn = false;
    }
    if (this.mode === 'auto') {
      if (moisture === null || moisture === undefined) {
        if (this.pumpOn) {
          this.pumpOn = false;
          this.event('Sensor fora do solo: bomba desligada');
        }
      } else if (!this.pumpOn && moisture < this.lowThreshold) {
        this.pumpOn = true;
        this.event(`Solo com ${moisture.toFixed(0)}%: bomba ligada`);
      } else if (this.pumpOn && moisture >= this.targetLevel) {
        this.pumpOn = false;
        this.event(`Meta de ${this.targetLevel}% atingida: bomba desligada`);
      }
    } else {
      this.pumpOn = false; // manual sem pedido: bomba parada
    }

    return this.pumpOn ? this.pumpRatePerSec * dt : 0;
  }

  event(message) {
    this.log.unshift(message);
    if (this.log.length > 4) this.log.pop();
  }
}
