# DOMINIO: SIGLOS DE ACERO

RTS 3D en español ambientado entre 1800 y 2100. Dirige la Confederación Aurora a través de cuatro operaciones encadenadas, construye una economía industrial, domina puntos estratégicos y evoluciona desde la Era del Vapor hasta la Era Orbital.

**Jugar:** [walopper.github.io/dominio-siglos-de-acero](https://walopper.github.io/dominio-siglos-de-acero/)

## Ejecutar

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre la dirección local indicada por Vite. Para probar el paquete optimizado:

```bash
npm run build
npm run preview
```

## Campaña

`La Forja del Porvenir` contiene cuatro operaciones con objetivos primarios y secundarios propios:

1. **Las líneas del alba (1800):** carbón, telégrafo y convoy ferroviario.
2. **Trueno coordinado (1900):** artillería, corredores blindados y nudo ferroviario.
3. **El pulso cautivo (2000):** centros de datos, sincronizadores y reconexión de red.
4. **El puente de Selene (2100):** energía lunar, recursos locales y repetidores orbitales.

Cada victoria desbloquea la operación siguiente. Los objetivos opcionales, el tiempo y las bajas determinan medallas y recompensas persistentes. Al completar Selene, el Archivo Estratégico conserva el registro 4/4 y permite repetir cualquier operación.

## Controles

- Clic: seleccionar una unidad o edificio.
- Arrastrar: selección múltiple.
- Clic derecho: mover, atacar, recolectar o fijar un punto de reunión según el objetivo.
- `Ctrl` + clic derecho: avanzar atacando.
- `Shift` + orden: encolar acciones.
- `WASD` o flechas: desplazar la cámara.
- `Q` / `E`: rotar la cámara; rueda: acercar o alejar.
- `H`: volver al centro de mando; `Espacio`: centrar la selección.
- `M`, `A`, `P`, `R`, `S`: mover, atacar, patrullar, reparar y detener.
- `Z`, `N`, `J`: postura agresiva, defensiva o mantener posición.
- `L`, `K`, `C`: formación en línea, columna o cuña.
- `B`: construcción; `T`: tecnologías; `X`: cancelar/detener.
- `F2`, `F3`, `F4`: ciclar edificios, pioneros o ejército. `Shift` invierte el recorrido.
- `Ctrl`/`Cmd` + `1–9`: asignar grupo; `1–9`: recuperarlo; doble pulsación: centrarlo.
- `G`: colocar una baliza; `O`: contraer objetivos.
- `Ctrl`/`Cmd` + `S`: guardar la operación completa.
- `Esc`: cancelar una orden dirigida o abrir la pausa; `F`: pantalla completa.

## Sistemas jugables

- Cinco recursos con acarreo y depósito real: provisiones, materiales, acero, energía y conocimiento.
- Diez pioneros iniciales por facción, construcción, reparación, colas de producción y límite poblacional.
- Cuatro eras consecutivas: Vapor, Industria, Red y Orbital.
- Ocho unidades y siete edificios con costes, requisitos, estadísticas y variantes por era.
- Árbol tecnológico con prerrequisitos, investigaciones temporizadas y efectos persistentes.
- Combate con proyectiles, clases de arma, posturas, formaciones, patrulla, avance ofensivo y evasión de obstáculos.
- IA rival económica, exploradora, tecnológica y militar que respeta la niebla de guerra.
- Diplomacia con influencia, reputación, tratados, alianzas, guerra, armisticios y enfriamientos.
- Victoria por aniquilación, dominación territorial o supremacía estratégica, condicionada por las directivas de campaña.
- Guardado local versionado de simulación, campaña, diplomacia, objetivos, tecnologías y grupos de control; autoguardado cada 30 segundos.
- Simulación determinista y estado accesible mediante `window.render_game_to_text()`.

## Verificación

Con `npm run preview` activo:

```bash
npm test
npm run build
npm run test:e2e:campaign -- http://127.0.0.1:4173/dominio-siglos-de-acero/
npm run test:e2e:smoke -- http://127.0.0.1:4173/dominio-siglos-de-acero/
npm run test:e2e:technology -- http://127.0.0.1:4173/dominio-siglos-de-acero/
```

Las pruebas cubren simulación determinista, economía, combate, IA, navegación, niebla, tecnología, formaciones, posturas, campaña, objetivos, diplomacia, persistencia y el recorrido completo de las cuatro operaciones en navegador.
