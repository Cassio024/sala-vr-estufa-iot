import * as THREE from 'three';

// Sons espaciais gerados por código (não precisa de arquivos .mp3).
// O navegador só libera áudio depois de um gesto do usuário: chame unlock().
export class SoundManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;

    let w = 0; // estado do filtro do ruído da água
    this.buffers = {
      // motor da bomba (frequências inteiras => loop sem estalo)
      hum: this._make(1, (t) =>
        0.35 * Math.sin(2 * Math.PI * 95 * t) +
        0.15 * Math.sin(2 * Math.PI * 190 * t) +
        0.08 * (Math.random() * 2 - 1)),
      // água caindo: ruído filtrado com leve oscilação
      water: this._make(2, (t) => {
        w += 0.3 * ((Math.random() * 2 - 1) - w);
        return w * (0.7 + 0.3 * Math.sin(2 * Math.PI * 6 * t)) * 1.5;
      }),
      // alerta de solo seco: dois bipes
      alert: this._make(0.5, (t) => {
        const k = t % 0.25;
        const env = k < 0.15 ? Math.sin((Math.PI * k) / 0.15) : 0;
        return 0.5 * env * Math.sin(2 * Math.PI * 880 * t);
      }),
      // clique do botão
      click: this._make(0.08, (t) => Math.exp(-t * 60) * Math.sin(2 * Math.PI * 700 * t) * 0.6),
    };
  }

  _make(duration, fn) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = fn(i / sr);
    return buf;
  }

  // Cria um som posicional preso a um objeto da cena.
  create(parent, buffer, { loop = false, volume = 1, refDistance = 0.5 } = {}) {
    const s = new THREE.PositionalAudio(this.listener);
    s.setBuffer(buffer);
    s.setLoop(loop);
    s.setVolume(volume);
    s.setRefDistance(refDistance);
    parent.add(s);
    return s;
  }

  unlock() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  // Liga/desliga um som em loop.
  setPlaying(sound, on) {
    if (this.ctx.state !== 'running') return;
    if (on && !sound.isPlaying) sound.play();
    else if (!on && sound.isPlaying) sound.stop();
  }

  // Toca um som curto do início.
  playOnce(sound) {
    if (this.ctx.state !== 'running') return;
    if (sound.isPlaying) sound.stop();
    sound.play();
  }
}
