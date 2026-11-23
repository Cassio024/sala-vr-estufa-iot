// Lógica da irrigação das bancadas (sem three.js, testável).
//
// Cada bancada tem várias VÁLVULAS SOLENOIDES (uma por posição de vaso), cada uma
// ligada a um RELÉ que a placa (ESP32) liga e desliga. Cada VASO tem o seu próprio
// sensor de umidade. A válvula decide pelo vaso que está embaixo do bico dela —
// se o vaso for tirado do lugar, ela fica sem leitura e não rega.
// BALANÇA DE SEGURANÇA: embaixo de cada vaso há uma balança; sem vaso em cima dela
// a válvula nunca abre (nem no automático, nem no "Regar agora").
//
// Modos por bancada (escolhidos no painel de controle):
//   automático: terra abaixo de 35% -> válvula abre; chega a 70% -> fecha
//   manual:     só abre quando alguém aperta "Regar agora" (por alguns segundos)
// Uma válvula BLOQUEADA nunca abre ("não regar este vaso").
// O motor de cada bancada liga quando pelo menos uma válvula dela está aberta.
import { SoilMoistureSensor, IrrigationController } from './sensors.js';

export const MANUAL_SECONDS = 4;
// Quanto a terra de cada vaso seca por segundo (%/s): entre 0,3 e 0,6.
export const EVAPORATION_MIN = 0.3;

export class ValveNetwork {
  /**
   * @param {number[]} groups bancada de cada válvula, ex.: [0,0,0,...,1,1,1]
   * @param {object} [o]
   * @param {() => number} [o.random] gerador aleatório (para testes previsíveis)
   * @param {number} [o.flowPerSec] % de umidade que a válvula aberta adiciona por segundo
   * @param {number} [o.potCount] quantos vasos existem (padrão: um por válvula)
   */
  constructor(groups, { random = Math.random, flowPerSec = 10, potCount = groups.length } = {}) {
    this.groups = groups;
    this.valves = groups.map((group, i) => ({
      group,
      relay: new IrrigationController({ pumpRatePerSec: flowPerSec, manualDurationSec: MANUAL_SECONDS }),
      open: false,
      enabled: true, // false = bloqueada pelo painel
      pot: i < potCount ? i : null, // vaso embaixo do bico (começa: vaso i sob a válvula i)
    }));
    // Cada vaso começa com uma umidade e seca num ritmo diferente: assim as
    // válvulas abrem em momentos diferentes, como numa estufa real.
    this.pots = Array.from({ length: potCount }, () => ({
      sensor: new SoilMoistureSensor({ initial: 40 + random() * 45, evaporationPerSec: EVAPORATION_MIN + random() * EVAPORATION_MIN }),
    }));
    const groupCount = Math.max(-1, ...groups) + 1;
    this.motors = Array.from({ length: groupCount }, () => false);
    this.modes = Array.from({ length: groupCount }, () => 'auto');
    // Limites do automático por bancada (ajustáveis no painel): rega abaixo de "low"
    // e para ao chegar em "target".
    this.limits = Array.from({ length: groupCount }, () => ({ low: 35, target: 70 }));
  }

  /**
   * Muda os limites do automático de uma bancada. Valores em %, ajustados para
   * ficarem válidos: low entre 10 e target - 10; target entre low + 10 e 85
   * (acima disso o solo já conta como encharcado). Retorna os limites aplicados.
   */
  setLimits(group, { low = this.limits[group].low, target = this.limits[group].target } = {}) {
    target = Math.min(85, Math.max(20, target));
    low = Math.min(target - 10, Math.max(10, low));
    this.limits[group] = { low, target };
    for (const v of this.valves) {
      if (v.group !== group) continue;
      v.relay.lowThreshold = low;
      v.relay.targetLevel = target;
    }
    return this.limits[group];
  }

  /** Diz qual vaso está embaixo da válvula (null = nenhum). */
  setPot(valveIndex, potIndex) {
    this.valves[valveIndex].pot = potIndex;
  }

  /** Umidade do vaso embaixo da válvula, ou null se não houver vaso. */
  moistureAt(valveIndex) {
    const p = this.valves[valveIndex].pot;
    return p === null ? null : this.pots[p].sensor.read();
  }

  /** Bloqueia (false) ou libera (true) a rega de uma válvula. */
  setEnabled(valveIndex, enabled) {
    this.valves[valveIndex].enabled = enabled;
  }

  toggleEnabled(valveIndex) {
    this.setEnabled(valveIndex, !this.valves[valveIndex].enabled);
    return this.valves[valveIndex].enabled;
  }

  /** Muda o modo de uma bancada: 'auto' ou 'manual'. */
  setMode(group, mode) {
    if (this.modes[group] === mode) return;
    this.modes[group] = mode;
    for (const v of this.valves) {
      if (v.group === group && v.relay.mode !== mode) v.relay.toggleMode(); // fecha a válvula ao trocar
    }
  }

  /** "Regar agora" (modo manual): abre as válvulas liberadas da bancada. Retorna quantas abriram. */
  waterNow(group) {
    if (this.modes[group] !== 'manual') return 0;
    let n = 0;
    for (const v of this.valves) {
      if (v.group === group && v.enabled && v.pot !== null) { // balança vazia: não abre
        v.relay.requestManualWater();
        n++;
      }
    }
    return n;
  }

  /** Avança a simulação. Retorna os índices das válvulas que ABRIRAM neste passo (para o bipe). */
  update(dt) {
    for (const p of this.pots) p.sensor.update(dt);
    const opened = [];
    this.motors.fill(false);
    this.valves.forEach((v, i) => {
      const wasOpen = v.open;
      if (!v.enabled || v.pot === null) {
        // Bloqueada pelo painel, ou balança de segurança vazia (sem vaso):
        // o relé fica desligado, a válvula não abre.
        v.relay.pumpOn = false;
        v.relay.manualTimer = 0;
        v.open = false;
        return;
      }
      const water = v.relay.update(dt, this.moistureAt(i));
      if (v.pot !== null) this.pots[v.pot].sensor.addWater(water);
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
