// Faz o Node achar 'three' e 'three/addons/...' na cópia local (vendor/),
// como o import map faz no navegador.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return { url: new URL('../../vendor/three/build/three.module.min.js', import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith('three/addons/')) {
    const rest = specifier.slice('three/addons/'.length);
    return { url: new URL(`../../vendor/three/examples/jsm/${rest}`, import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
