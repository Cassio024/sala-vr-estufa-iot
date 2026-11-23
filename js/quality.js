// Qualidade gráfica: no headset standalone (Quest, Pico...) a GPU é de celular,
// então usamos uma configuração mais leve. Dá para forçar pela URL:
//   ?qualidade=baixa   -> sempre leve (sem modelos glTF pesados, sombra menor)
//   ?qualidade=alta    -> sempre completa (útil para testar no PC)
//   ?debug             -> mostra FPS, draw calls e triângulos no painel da sala

const params = new URLSearchParams(window.location.search);
const ua = navigator.userAgent || '';

// Navegadores de headset standalone.
export const isStandaloneHeadset = /OculusBrowser|Quest|Pico|Wolvic/i.test(ua);

const forced = (params.get('qualidade') || '').toLowerCase();
export const lowQuality = forced === 'baixa' || (forced !== 'alta' && isStandaloneHeadset);

export const quality = {
  low: lowQuality,
  // Modelos glTF atuais têm ~326 mil triângulos (bomba 150 mil + planta 176 mil).
  // A meta para Quest é < ~100 mil na cena toda, então no modo leve ficam as formas simples.
  loadHeavyModels: !lowQuality,
  pixelRatio: Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : 1.5),
  shadowMapSize: lowQuality ? 1024 : 2048,
  hdriBackground: true,
  debug: params.has('debug'),
};

// Medidor simples de FPS (funciona dentro e fora da VR).
export class FpsMeter {
  constructor() {
    this.frames = 0;
    this.time = 0;
    this.fps = 0;
  }

  update(dt) {
    this.frames++;
    this.time += dt;
    if (this.time >= 1) {
      this.fps = Math.round(this.frames / this.time);
      this.frames = 0;
      this.time = 0;
    }
    return this.fps;
  }
}

// Diagnóstico de suporte a VR (mostrado no painel quando ?debug).
export async function checkXRSupport() {
  const info = {
    secure: window.isSecureContext,
    webxr: 'xr' in navigator,
    immersiveVR: false,
    headset: isStandaloneHeadset,
  };
  if (info.webxr) {
    try {
      info.immersiveVR = await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      info.immersiveVR = false;
    }
  }
  return info;
}
