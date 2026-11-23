// Lógica da irrigação das bancadas (sem three.js, testável).
// Cada vaso tem um sensor de umidade e uma VÁLVULA SOLENOIDE ligada a um RELÉ.
// A placa (ESP32) decide por vaso, com a mesma histerese da bomba principal:
//   terra abaixo de 35% -> liga o relé -> válvula abre (luz verde + bipe)
//   terra chega a 70%   -> desliga o relé -> válvula fecha (luz vermelha)
// O motor de cada bancada liga quando pelo menos uma válvula dela está aberta.
import { SoilMoistureSensor, IrrigationController } from './sensors.js';

export class ValveNetwork {
  /**
   * @param {number[]} groups grupo (bancada) de cada vaso, ex.: [0,0,0,...,1,1,1]
   * @param {object} [o]
   * @param {() => number} [o.random] gerador aleatório (para testes previsíveis)
   * @param {number} [o.flowPerSec] % de umidade que a válvula aberta adiciona por segundo
   */
  constructor(groups, { random = Math.random, flowPerSec = 10 } = {}) {
    this.groups = groups;
    this.valves = groups.map((group) => ({
      group,
      // Cada vaso começa com uma umidade e seca num ritmo diferente: assim as
      // válvulas abrem em momentos diferentes, como numa estufa real.
      sensor: new SoilMoistureSensor({ initial: 40 + random() * 45, evaporationPerSec: 0.8 + random() * 0.8 }),
      relay: new IrrigationController({ pumpRatePerSec: flowPerSec }),
      open: false,
    }));
    const groupCount = Math.max(-1, ...groups) + 1;
    this.motors = Array.from({ length: groupCount }, () => false);
  }

  /** Avança a simulação. Retorna os índices das válvulas que ABRIRAM neste passo (para o bipe). */
  update(dt) {
    const opened = [];
    this.motors.fill(false);
    this.valves.forEach((v, i) => {
      v.sensor.update(dt);
      const water = v.relay.update(dt, v.sensor.read());
      v.sensor.addWater(water);
      const wasOpen = v.open;
      v.open = v.relay.pumpOn;
      if (v.open && !wasOpen) opened.push(i);
      if (v.open) this.motors[v.group] = true;
    });
    return opened;
  }

  /** Quantas válvulas estão abertas agora. */
  openCount() {
    return this.valves.filter((v) => v.open).length;
  }
}
