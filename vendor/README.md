# vendor/

Cópia local do [three.js](https://threejs.org/) **0.170.0** (licença MIT, ver `three/LICENSE`),
para a sala funcionar sem internet e sem depender de CDN.

Só estão aqui os arquivos que o projeto usa:

- `three/build/three.module.min.js`
- `three/examples/jsm/` → `OrbitControls`, `RoomEnvironment`, `VRButton`, `GLTFLoader`,
  `DRACOLoader`, `RGBELoader`, `BufferGeometryUtils`, `meshopt_decoder` e o decodificador Draco.

Para atualizar a versão, baixe os mesmos caminhos de
`https://cdn.jsdelivr.net/npm/three@<versão>/` e troque os arquivos.
