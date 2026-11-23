// Opção do PC: "andar ao clicar no chão" (a câmera caminha até o ponto clicado).
// Começa DESLIGADA; liga/desliga pelo botão no canto ou pela tecla C.
// A escolha fica salva no navegador (se o navegador permitir).

const KEY = 'salaVR.andarAoClicar';

function load() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function save(on) {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // armazenamento bloqueado: a opção só não fica salva
  }
}

export function createClickWalkOption() {
  const state = { enabled: load() };

  const css = document.createElement('style');
  css.textContent = `
    #walk-btn { position: absolute; left: 16px; bottom: 70px; transform: none; padding: 8px 14px; border: 1px solid #fff;
      border-radius: 6px; background: rgba(0,0,0,0.6); color: #fff; font: 14px sans-serif; cursor: pointer; z-index: 10; }
    #walk-btn.on { background: rgba(34,197,94,0.75); }
  `;
  document.head.appendChild(css);
  const btn = document.createElement('button');
  btn.id = 'walk-btn';
  btn.title = 'Clicar no chão faz a câmera caminhar até lá (tecla C)';
  document.body.appendChild(btn);

  const render = () => {
    btn.textContent = `🚶 Andar ao clicar: ${state.enabled ? 'ligado' : 'desligado'} (C)`;
    btn.classList.toggle('on', state.enabled);
  };
  const toggle = () => {
    state.enabled = !state.enabled;
    save(state.enabled);
    render();
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
    btn.blur(); // para as teclas (Espaço, M) continuarem indo para a sala
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat && !document.pointerLockElement) toggle();
  });
  // Some durante o modo FPS (mouse preso), onde o clique serve para usar objetos.
  document.addEventListener('pointerlockchange', () => {
    btn.style.display = document.pointerLockElement ? 'none' : '';
  });

  render();
  return state;
}
