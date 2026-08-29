Original prompt: Crear en español un RTS al nivel de Age of Empires II, ambientado entre 1800 y 2100, con Three.js, máxima calidad visual, sistemas completos y revisión exigente mediante subagentes.

## Dirección
- Nombre: DOMINIO: SIGLOS DE ACERO.
- Estética: atlas militar industrial; diorama táctico cálido, bronce oxidado, acero azulado y acentos ámbar.
- Eras: Vapor (1800), Industria (1900), Red (2000), Orbital (2100).
- Objetivo de esta iteración: vertical slice jugable y autónomo con selección, órdenes, economía, producción, combate, progresión y victoria/derrota.

## Estado
- Workspace inicial vacío.
- Simulación determinista, IA, economía, combate y cuatro eras implementados.
- Mundo procedural Three.js e interfaz cinematográfica completamente integrados.
- Arte original generado y guardado en `public/assets/key-art.png`.
- `npm run build` pasa; capturas de menú y juego inspeccionadas sin errores de consola.
- Primera prueba Playwright: movimiento de cámara, selección inicial, avance temporal y estado textual correctos.
- QA completa: controles de escritorio/touch, tasas, coordenadas, stats, objetivos, modales, notificaciones, minimapa y estados finales corregidos.
- Pasada visual 2: unidades articuladas y diferenciadas, marcha/polvo, desgaste, decals, clutter, vegetación, telegrafía y atmósfera.
- Campaña persistente “La Forja del Porvenir”: cuatro operaciones encadenadas, briefings, objetivos, medallas, recompensas y desbloqueos de 1800 a 2100.
- Cada escenario comienza con economía, edificios y fuerzas propias de su era; la victoria desbloquea el expediente siguiente.
- Diplomacia determinista integrada: reputación, influencia, aliados/neutrales/enemigos, comercio, pactos, armisticios, enfriamientos y caducidad.
- Guardado/carga versionado del archivo estratégico completo; conserva simulación/RNG/IA, progreso de campaña y diplomacia.
- Combate visual avanzado: trazadoras, proyectiles balísticos/energéticos, impactos por material, humo, chispas, escombros, marcas, barras de salud y animaciones contextuales.
- Vida ambiental añadida con aves instanciadas y fauna con LOD.
- Suite permanente `npm test`: 20/20 pruebas pasan.
- Validación final desktop/móvil sin errores; capturas en `output/final/desktop-final.png` y `output/final/mobile.png`.
- Portada servida como WebP de 237 KB; build separado entre motor Three.js y código del juego.

## Dirección vigente
- El usuario dio por suficiente el apartado gráfico el 2026-08-28; no se realizan más bucles visuales.
- La prioridad pasa al cierre jugable, la continuidad de campaña, la persistencia y la verificación de producción.
- Multijugador queda explícitamente fuera de esta entrega; campaña, diplomacia y persistencia están integradas.

## Revisión visual AAA — 2026-08-27
- Referencia contrastada: material oficial de Age of Empires II: Definitive Edition de World's Edge/Xbox Game Studios.
- Antes: `output/visual-review/before-0.png`; después validado: `output/visual-review/final-soft-smoke/shot-0.png`.
- `src/world.js`: centro de mando 1800 rediseñado como edificio cívico-industrial, detalle arquitectónico añadido a fábrica/cuartel/viviendas, ventanas cálidas separadas semánticamente del azul de equipo, textura procedural/bump del terreno, pinos de doble estrato, iluminación/fog reequilibrados y humo suave de chimeneas.
- `src/styles.css`: HUD superior, objetivos y deck inferior compactados para recuperar área útil del campo sin quitar información.
- Verificación: `npm run build` correcto; Playwright ejecutado después de cada pasada; modo `jugando`, selección y estado accesible presentes; sin errores de consola reportados por el cliente.
- Pendiente visual de mayor impacto: modelos humanos aún muy simples y el mapa carece de animaciones de trabajo/contexto suficientes para igualar la densidad viva de AoE II: DE.

## Pase sistémico y combate — 2026-08-27
- Nuevos módulos: `src/campaign.js`, archivo estratégico responsive y panel diplomático vivo.
- Validación real: el cliente Playwright obligatorio produjo `output/integration-smoke/shot-0.png` y estado textual sin errores; campaña y diplomacia capturadas en `output/final/`.
- Flujo Chromium verificado hasta guardar → recargar → continuar, conservando tiempo y tratado de no agresión.
- El runner extendido quedó en espera al abrir un segundo contexto WebGL móvil; la vista móvil fue validada por separado en `output/campaign-ui/campaign-live-mobile.png`.
- Capturas de efectos: `output/combat-fx-pass-2/effects-isolated.png` y `shot-0.png`.

## Pase visual 3 — 2026-08-27
- El segundo revisor ciego otorgó 8/10 a campaña/UI, pero 4/10 a vida, 4,8/10 a materiales y 6,3/10 general; veredicto: interfaz fuerte, mundo aún low-poly.
- `src/world.js`: macrovariación shader, albedo/bump/roughness procedural, red vial con banquinas/rodadas/mojones, huellas dinámicas, costa rocosa, cinco familias vegetales, landmarks por era, identidad de facción y FX direccionales.
- Arte narrativo original generado para las cuatro operaciones e integrado desde `public/assets/mission-dossier-atlas.webp` (274 KB); el PNG fuente pesado se excluyó del build.
- HUD/UI: cifras sin elipsis, sigilos geométricos, diplomacia compacta, bloqueados reconocibles, CTA móvil sticky y briefing con cuerpo más legible.
- Capturas nuevas inspeccionadas: `output/pass3-fresh/shot-0.png`, `output/pass3-diplomacy/shot-0.png`, `output/ui-readability-pass/campaign-1440.png` y `campaign-mobile.png`.
- Verificación: 20/20 pruebas, build y sintaxis correctos; cliente Playwright sin archivos de error.
- En curso: tercera revisión visual ciega con un evaluador distinto.

## Pase de lectura y showcase — 2026-08-27
- El tercer revisor ciego puntuó 6,0 general: salto claro, todavía no cambio de categoría; bloqueos principales: terreno, siluetas de unidad y estados de combate.
- Unidades aumentadas 18% en masa aparente, cámara de base acercada y luz de relleno recalibrada para evitar sombras que devoren siluetas.
- Showcases de desarrollo deterministas añadidos sólo en modo Vite: `?showcase=combat` (1900) y `?showcase=orbital` (2100), para inspeccionar los sistemas sin alterar producción.
- Combate real capturado en `output/combat-showcase-final/`: roles humanos/artillería/tanques, trayectorias, humo, debris y daño. Base 2100 en `output/orbital-showcase/shot-0.png`.
- 20/20 pruebas y build correctos después del ajuste; sin errores Playwright.
- En curso: cuarto evaluador ciego con el set completo de eras y combate.

## Pipeline de feedback sincronizado — 2026-08-27
- El cuarto revisor puntuó 7,2 premium global y 8,8 campaña, pero marcó como único bloqueo la cadena disparo→impacto→reacción→consecuencia.
- `src/simulation.js`: cada ataque emite metadata versionada/determinista (`attackerId`, `targetId`, clases/tipos, `weaponClass`, daño, vida restante, letalidad y secuencia); destrucción persistente enlazada 14/24 s.
- `src/world.js`: APIs idempotentes `playAttackFeedback`/`playHitFeedback`, recoil, fogonazo, luz, humo, flash direccional, shake/impulso, daño escalonado, fuego y residuo 24–32 s.
- `src/main.js`: consumo de FX antes de retirar muertos, audio por arma, proyectil/impacto y feedback sincronizados; saves viejos siguen compatibles.
- El campo de prueba industrial reduce una artillería rival para capturar la secuencia letal completa. Evidencia en `output/combat-pipeline-polished/`.
- Suite permanente: 24/24; build/sintaxis correctos y Playwright sin errores.
- En curso: quinto dictamen ciego sobre el conjunto y la nueva cadena de combate.
- Criterio de salida alcanzado: quinto revisor ciego = **Sí, impresiona como vertical slice premium/AAA**; 8,5 global, 9,1 campaña, 8,7 eras y 8,4 combate causa→consecuencia.

## Auditoría integral reabierta — 2026-08-27
- El dictamen visual positivo prueba la presentación de una vertical slice, pero no la equivalencia sistémica con Age of Empires II solicitada originalmente; el objetivo permanece abierto.
- Auditoría independiente de jugabilidad: economía/construcción/producción/combate/save son funcionales, pero faltan pathfinding, árbol tecnológico, órdenes RTS completas, IA adaptativa y misiones realmente diferenciadas.
- Hallazgo crítico: los cuatro expedientes narrativos reutilizan la misma escaramuza y `updateObjectives()` traduce textos distintos a tres métricas genéricas; puede completar objetivos sin la acción descrita y no actualiza secundarios.
- Hallazgo de controles: la interfaz anuncia patrulla/reparación/hotkeys que el motor o el teclado no ejecutan; cola, rally y cancelación existen parcialmente en el motor pero no llegan al jugador.
- Siguiente bloque en curso: navegación/avoidance determinista en simulación y runtime de objetivos específicos por operación.

## Profundidad RTS y canon tecnológico — 2026-08-27
- Navegación determinista añadida: rodeo de edificios/recursos, separación de unidades y continuidad exacta tras save/load.
- Runtime operacional nuevo en `src/scenario-runtime.js`: cada misión mide sus propias acciones y secundarios; ya no fuerza objetivos al ganar ni completa el telégrafo al inicio.
- Misión 1800: estación realmente dañada, ingeniero reparando, escolta/territorio/puentes/cuadrillas medidos. 1900: baterías, corredores, nudo, reconocimiento y hospital. 2000: datos, sincronizadores, reconexión, microredes y enjambres. 2100: energía, ISRU, repetidores, robots y hábitats.
- Árbol de 19 tecnologías en `src/technology.js` integrado a economía, visión, movilidad, blindaje, producción, construcción, IA, guardado y UI; investigación activa sobrevive recarga.
- Canon corregido: la operación 2000 pasa de una fusión comercial anacrónica a redes digitales, navegación satelital, generación distribuida y reconexión; fusión comercial queda en 2100.
- E2E `scripts/e2e-technology.mjs`: reparación → selección F2 → investigación → guardado → recarga → finalización, correcto; evidencia `output/technology-e2e/technology-complete.png`.
- Sexto revisor ciego independiente: AoE II: DE gana 6–0; brechas dominantes: fidelidad/variedad artística, densidad del mundo y siluetas/feedback. El objetivo sigue abierto.

## Niebla, recompensas e IA adaptativa — 2026-08-27
- Niebla de guerra determinista 40×30: exploración persistente, visión actual por equipo, RLE compacto, filtro real de rivales/recursos y continuidad exacta tras save/load.
- Render Three.js y minimapa consumen la misma niebla; al perder visión ya no quedan recursos fantasma ni se generan explosiones falsas.
- Las recompensas persistentes de campaña ya se aplican a cada nueva operación: inventario/prestigio se convierten en recursos y los 11 desbloqueos alteran estadísticas reales con recibo idempotente.
- IA táctica nueva: explora celdas desconocidas, memoriza evidencia, defiende amenazas cercanas y forma composiciones diferentes por era antes de atacar.
- Mundo visual: material multiescala, costas estratificadas, caminos erosionados, vegetación por bioma, clusters funcionales con LOD y arquitectura ambiental por era.
- Validación consolidada: 62/62 tests, sintaxis y build correctos. E2E real pasa reparación → investigación → grupo de control → guardar → recargar → completar tecnología.
- Evidencia actual: `output/world-fog-pass/`, `output/final-combat-review/`, `output/final-orbital-review/` y `output/technology-e2e/technology-complete.png`.
- En curso: séptima revisión visual ciega y pase específico de siluetas/unidades; el objetivo sigue abierto hasta obtener preferencia visual verificable.

## Materiales, logística y formaciones — 2026-08-28
- Séptima revisión ciega: 45/100 local frente a 85/100 AoE II: DE. Tras albedo original, siluetas reconstruidas, vegetación suavizada, HUD corregido y base orbital espaciada, octava revisión: 5,9/10 local frente a 8,8/10 AoE. Mejora medible, todavía no cumple el umbral AAA.
- Activo original `public/assets/terrain-albedo-v1.webp` (463 KB), generado con la herramienta integrada de imagen e incorporado al terreno con repetición espejada, color biométrico y relieve procedural conservados.
- El intento de atlas vegetal con alfa se descartó porque ambas salidas llegaron opacas; no quedó referenciado ni persistido.
- Unidades visuales: proporciones humanas/equipo por era, tanques con casco-torre-orugas, artillería con cureña/ruedas, drones/exotrajes/caminantes diferenciados y luces no futuristas en 1800.
- Economía de acarreo real: capacidad por recurso, nodo → carga → depósito → regreso, sin acreditar tesoro antes de depositar; maneja agotamiento, pausa, destrucción y save/load.
- Formaciones reales: línea, columna y cuña; slots orientados para mover, avanzar atacando y patrullar; Shift y persistencia; UI L/K/C y `Ctrl+clic derecho` para ataque en marcha.
- Suite consolidada: 70/70; build y sintaxis correctos. E2E investigación/guardado/grupo de control sigue pasando tras logística y formaciones.
- Evidencia reciente: `output/material-final-combat/shot-0.png`, `output/review-8-orbital/shot-0.png`, `output/formation-compact-final/shot-0.png`.
- El objetivo permanece abierto: AoE sigue ganando mundo/materiales, unidades, combate, densidad y coherencia de eras; el local gana UI.

## Posturas y follaje ilustrado — 2026-08-28
- Novena revisión ciega, previa al nuevo follaje: AoE II: DE ganó 6–0, 5,5/10 local frente a 8,7/10. Campaña siguió siendo la pieza más fuerte; mundo, unidades, combate y densidad permanecieron por debajo del objetivo.
- Posturas RTS reales añadidas: agresiva, defensiva y mantener posición, con adquisición/persecución distintas, ancla defensiva, reanudación de órdenes, atajos Z/N/J y persistencia compatible con saves antiguos.
- Activo original `public/assets/foliage-chroma-atlas-v1.png` generado con la herramienta integrada de imagen: cuatro familias arbóreas pintadas sobre chroma puro. El shader descarta fondo/derrame magenta y los billboards cruzados conservan troncos, profundidad y lectura desde cámara isométrica.
- Los antiguos árboles poliédricos quedaron sustituidos visualmente por el atlas; los nodos de madera usan el mismo lenguaje y ya no aparecen como conos verdes. Hierba y rocas también recibieron geometría menos primaria.
- Atmósfera por era diferenciada en terreno, cielo, horizonte, niebla, luz y exposición; 2100 usa una noche azul y arquitectura orbital espaciada.
- Validación consolidada tras el pase: 74/74 tests, sintaxis y build de producción correctos. Capturas inspeccionadas sin errores en `output/foliage-final-normal/`, `output/foliage-final-combat/` y `output/foliage-final-orbital/`.
- En curso: décima revisión ciega usando exclusivamente las capturas finales. El objetivo continúa abierto hasta lograr preferencia visual verificable frente a AoE II: DE.

## Siluetas por era y combate legible — 2026-08-28
- Décima revisión ciega sobre el follaje final: AoE ganó nuevamente 6–0, 5,9/10 local frente a 8,8/10. Confirmó que el atlas vegetal mejoró densidad, pero volvió más visible la inconsistencia con unidades/edificios simples y el bosque idéntico de 2100.
- Activo original `public/assets/unit-silhouette-atlas-v1.png` generado con la herramienta integrada de imagen: atlas 4×4 con infantería, artillería, blindados/especialistas para Vapor, Industria, Red y Orbital.
- Las entidades conservan geometría, hitboxes, sombras, rig, puntos de disparo y lógica; una capa ortográfica chroma orientada a cámara aporta anatomía/materiales. El shader elimina magenta, recolorea acentos por facción, dibuja contorno azul/rojo y espeja la silueta según su dirección.
- 2100 ya no reutiliza el bosque completo: reduce familias arbóreas, pasto, flores y fauna; enfría follaje/roca y deja focos biológicos controlados entre arquitectura, drones, exotrajes y caminantes.
- Combate: trazadoras permanecen 0,42 s y proyectiles de asedio 0,70 s para leer origen→destino sin alterar cadencia ni daño; flashes circulares reducidos, selección afinada y panel de objetivos compactado.
- Validación posterior: 74/74 tests, sintaxis y build correctos; E2E de reparación/investigación/save-load ya había pasado en este mismo ciclo. Capturas sin errores: `output/unit-atlas-final-normal/`, `output/unit-atlas-final-combat-3/`, `output/unit-atlas-final-orbital/`.
- En curso: undécima revisión visual ciega contra AoE II: DE. El objetivo sigue abierto hasta verificar preferencia real, no sólo mejora incremental.

## Arquitectura pictórica e integración física — 2026-08-28
- Auditor 11: AoE ganó 5–1 (UI local), 6,1/10 frente a 8,6/10; unidades mejoraron, pero la mezcla sprites ricos/edificios low-poly quedó como bloqueo principal. Auditor 12, tras unificar edificios: AoE 6–0, 6,3/10 frente a 8,8/10; subió coherencia de eras, pero marcó suelo, sombras, densidad y combate rígido.
- Activo original `public/assets/building-silhouette-atlas-v1.png` generado con la herramienta integrada de imagen: atlas 4×4 de centros cívicos, cuarteles, industria/energía y residencia/investigación para Vapor, Industria, Red y Orbital.
- Edificios conservan colisión, construcción, selección, banderas, vida y daño; el atlas orientado a cámara reemplaza sólo su envolvente. Shader compartido recolorea insignias por facción con contorno arquitectónico oscuro.
- Integración al suelo: plataformas irregulares semitransparentes por era, sombras radiales suaves y banderas persistentes sustituyen los zócalos geométricos y sombras negras.
- Evidencia económica real a t=5 s: `output/building-ground-pass/shot-0.png`, con pioneros dispersos por su ciclo de acarreo y mapa/minimapa actualizados.
- Showcase industrial redirigido a dos frentes curvos y escalonados 8×8, cuatro seleccionados y fuego cruzado real; evidencia `output/combat-curved-front/shot-0.png`. Kit orbital unificado en `output/building-atlas-orbital/shot-0.png`.
- Validación: E2E reparación→investigación→grupo→save/load correcto; suite final 74/74, sintaxis y build correctos, sin errores de captura.
- En curso: auditoría ciega 13. El objetivo permanece abierto mientras AoE siga siendo preferido.

## Mundo unificado y microactividad — 2026-08-28
- Auditor 13: AoE II: DE ganó 4–2, 41,9/60 local frente a 51,1/60. El proyecto ganó UI (8,7) y coherencia de eras (8,6); las brechas restantes quedaron concentradas en mundo/materiales, vida económica y contundencia del combate.
- La carga económica real ya tiene representación visible por recurso: troncos, sacos, lingotes, celdas energéticas y maletín de conocimiento se acoplan al pionero, cambian con cantidad/tipo y siguen su orientación de cámara. El showcase `?showcase=economy` avanza cinco segundos de simulación para mostrar rutas de acarreo y recursos ya consumidos; selecciona al portador y el HUD muestra acción, carga, recurso y capacidad reales.
- Industria viva: edificios 1800/1900 emiten humo suave animado según su función; cimentaciones y sombras de contacto conservan el asentamiento físico del atlas pictórico.
- HUD sin selección compactado y despojado de retrato/estadísticas vacías; conserva centro de mando, ayuda, órdenes y minimapa sin ocupar el deck completo.
- Follaje ambiental y nodos de madera pasaron de material autoiluminado a `MeshStandardMaterial`, con roughness alta y tintes más contenidos por era. Árboles, terreno y arquitectura responden ahora a la misma luz; evidencia económica final `output/economy-carrier-final/shot-0.png` (pionero recolectando 15,7/20 de madera).
- Combate: el frente curvo mantiene 8×8 participantes, trazadoras y retroceso/reacción de siluetas; el flash direccional se redujo en opacidad, expansión y luz para no ocultar blancos. Evidencia previa al último microajuste: `output/combat-integrated-final/shot-0.png`.
- Validación actual: 74/74 pruebas, sintaxis y build de producción correctos; capturas Playwright sin archivos de error. En curso: auditoría ciega 14 con economía, combate, kit orbital y campaña.

## Atlas ambiental y VFX sin geometría provisional — 2026-08-28
- Auditor 14: AoE II: DE ganó 5–1, 33,5/60. Confirmó como brecha dominante el salto entre edificios/UI pictóricos y rocas, recursos, cultivo, utilería y VFX geométricos; la economía ya visible no compensó esa inconsistencia global.
- Activo original `public/assets/environment-props-atlas-v1.png` (2,1 MB), generado con la herramienta integrada de imagen: matriz 4×4 por era y función (geología, depósito de recursos, cultivo/clutter y logística/infraestructura).
- Los seis clusters ambientales low-poly fueron sustituidos por sus equivalentes pictóricos específicos de 1800/1900/2000/2100. Las rocas interiores geométricas se ocultan y los recursos reales usan el mismo atlas según tipo, conservando posición, hit testing, agotamiento y escala por cantidad.
- Evidencia: `output/environment-atlas-economy/shot-0.png` muestra carbón/madera, gavillas y telegrafía con pionero recolectando; `output/environment-atlas-orbital/shot-0.png` muestra roca lunar, energía cristalina, hidroponía y drones logísticos.
- VFX rediseñado: fogonazo e impacto usan una textura procedural estrellada compacta; se retiraron esfera, cono y shockwave circular que el auditor leía como marcadores provisionales. Persisten trazadoras, polvo, chispas, debris, humo, cicatriz y daño.
- HUD activo compactado: deck mínimo 112 px, retrato 94 px, botones 38 px, minimapa 78 px y detalles redundantes ocultos; conserva todas las órdenes y estados. Combate final inspeccionado en `output/combat-environment-vfx-final-2/shot-0.png`.
- Validación posterior: 74/74 pruebas, sintaxis y build correctos; capturas económica/orbital/combate sin archivos de error. En curso: auditoría ciega 15 sobre el set completamente renovado.

## Materiales de terreno por siglo y encastre de unidades — 2026-08-28
- Auditor 15: AoE II: DE ganó 6–0, 28/60. El dictamen siguió penalizando terreno repetitivo, unidades superpuestas, combate estático, HUD y falta de transformación ambiental pese al atlas de props.
- Cuatro albedos cenitales originales generados con la herramienta integrada de imagen y recortados mecánicamente: `terrain-1800-v1.png`, `terrain-1900-v1.png`, `terrain-2000-v1.png` y `terrain-2100-v1.png`. Cada era carga su propio suelo conservando malla, altura, bump, roughness procedural, carreteras y decals.
- Se eliminó la doble multiplicación por vertex colors al usar estos mapas; 1800 queda en loam/pradera cálida, 1900 en tierra compacta con carbón/grava, 2000 en agregado gris-verde y 2100 en regolito azul-gris.
- Se corrigió una prueba visual donde el albedo 1900 había sido usado erróneamente como roughness map, produciendo brillo: la toma mate final `output/terrain-era-combat-matte/shot-0.png` no presenta reflejo artificial.
- Unidades: contorno de facción reducido, ganancia pictórica balanceada y sombra de contacto suave por clase; edificios y props recibieron una ganancia menor para conservar jerarquía.
- Showcases con directiva plegada para recuperar campo sin quitar acceso al botón de objetivos. En 2100 se ocultan cajas/barriles históricos y telégrafos; evidencia limpia `output/terrain-era-orbital-clean/shot-0.png`. Economía final con pionero 16/20: `output/terrain-era-economy-final/shot-0.png`.
- Validación exacta posterior: 74/74 pruebas, sintaxis y build de producción correctos; capturas sin errores. En curso: auditoría ciega 16.

## Dirección de batalla y HUD informativo — 2026-08-28
- Auditor 16: AoE II: DE ganó 5–1, 31,5/60; el proyecto conservó UI (8,0), pero el evaluador siguió leyendo combate estático, poca densidad, unidades pequeñas y panel inferior con retrato vacío/microtexto.
- Combate de showcase redirigido de 8×8 a 12×12: dos frentes curvos con una segunda profundidad irregular, cámara 17% más cercana, objetivos cruzados y seis trazadoras persistentes adicionales a los disparos de simulación. Evidencia `output/combat-directed-12v12/shot-0.png`.
- HUD activo: retrato vacío eliminado, columna de selección compactada, botones mantienen 38 px y las construcciones usan nombres completos cortos (`Barrio`, `Cuartel`, `Instituto`, `Fábrica`, `Central`, `Bastión`) sin elipsis.
- Economía final `output/economy-compact-labels-final/shot-0.png`: `RECOLECTANDO`, madera 16/20, pioneros y edificios visibles, sin objetivo flotante ni rótulos truncados.
- Orbital final `output/orbital-compact-hud-final/shot-0.png`: 2100 conserva regolito, hidroponía, depósitos de energía, drones/logística, arquitectura y roster específicos; HUD compacto exacto.
- Build y sintaxis correctos tras dirección de escena y HUD. En curso: auditoría ciega 17 con las tres tomas exactas y campaña.

## Iconografía semántica y causalidad balística — 2026-08-28
- Auditor 17: AoE II: DE ganó 6–0, 33,9/60 local frente a 54,1/60; señaló iconos triangulares provisionales, altura del HUD, unidades oscuras, terreno plano y batalla insuficientemente viva.
- Las órdenes usan ahora glifos semánticos diferenciados (espada/escudo/ancla, línea/columna/cuña, patrulla, reparación y edificios) en vez del triángulo genérico. El retrato vacío ya no reserva espacio y el deck activo comprime tipografía, estadísticas, minimapa y botones.
- Los proyectiles incorporan un cuerpo cilíndrico orientado a su velocidad además del núcleo, con tramo físico corto; la captura `output/combat-semantic-hud-trails/shot-0.png` muestra origen→destino y 12×12 entidades sin discos blancos.
- Auditor 18 tras ese pase: 36,6/60 local frente a 54,0/60 AoE; mejora medible en UI (7,9), unidades (5,2), combate (5,8), densidad (5,4) y eras (7,2), pero el proyecto aún no obtiene preferencia binaria.
- Pase siguiente aplicado: gamma selectiva para levantar medios de unidades sin lavar edificios/props, contorno cromático de unidad reducido, trazadoras cálidas menos aditivas, HUD limitado a botones de 44 px y campo industrial ampliado a 16×16 combatientes.
- HUD inspeccionado por estilo calculado: una regla heredada seguía imponiendo filas de 58 px; corregida a 44 px. Deck real reducido de 143,75 a 115,75 px, con controles del minimapa superpuestos dentro del mapa conservando blancos táctiles de 44 px.
- Bajas de infantería añaden silueta caída persistente, cicatriz, humo, fuego y restos; el showcase acerca un duelo vulnerable y conserva la destrucción de artillería, por lo que el estado registra dos bajas letales verificables.
- Economía de showcase avanza 2+2+1 s (sin truncamiento del step fijo): `output/economy-auto5-integrated/shot-0.png` muestra RECOLECTANDO y 16,8/20 de madera en estado. Orbital limpio en `output/orbital-regolith-clean-final/shot-0.png`: sin árboles terrestres ni ruinas históricas.
- Auditores ciegos independientes 19/20: AoE volvió a ganar 6–0; 31,8/60 y 35,9/60 locales. Consenso: domina la inconsistencia entre terreno/sprites/escala, no low-poly puro; faltan integración de asentamiento y vida funcional.
- Respuesta al consenso: follaje máximo reducido ~20%, gamma de unidad elevada, halos cromáticos endurecidos, ruinas sólo históricas, caminos/banquinas específicos por era conectando cuatro edificios de cada base y combate encuadrado entre dos cuarteles funcionales. Evidencia: `output/economy-paths-scale-final/shot-0.png` y `output/combat-outposts-framed-final/shot-0.png`.
- Validación posterior: 74/74 pruebas, build/sintaxis correctos y cero archivos de error en las tres capturas exactas. El objetivo continúa abierto: todavía no existe preferencia ciega frente a AoE II: DE.

## Asentamientos habitados e integración final — 2026-08-28
- Auditores 21/22, antes de la infraestructura visible, situaron el proyecto entre 37,7 y 40,3/60; ambos confirmaron ventaja local en UI y señalaron caminos, población funcional y vida material como la brecha dominante.
- Cada facción inicia ahora con diez pioneros y el centro de mando aporta 18 plazas: la operación comienza con margen real de producción (12/34 en Vapor, 30/34 en Orbital). La prueba nueva verifica trabajadores y margen en todas las eras; suite consolidada 75/75.
- Las bases incorporan suelo ocupado irregular, caminos curvos entre cinco edificios, banquinas y huellas logísticas. El showcase económico avanza cinco segundos reales y selecciona un pionero con carga de madera visible; evidencia `output/economy-no-halo-final/shot-0.png`.
- La era orbital elimina vegetación terrestre y ruinas históricas; añade perímetros de plataforma, carriles dobles, balizas y señalización embebida entre edificios. Evidencia `output/orbital-physical-platforms-final/shot-0.png` con 30/34 entidades funcionales.
- Movimiento: variación determinista de escala, inclinación, balanceo y paso en las siluetas; huellas de pie/oruga más legibles. Combate: frente curvo optimizado a 14×14, cuarteles completos en diagonales opuestas, núcleo de impacto, chispas, humo, cráter, restos y proyectiles causales.
- Auditor 23: 43,7/60 frente a 52,6; auditor 24: 46,3/60 frente a 53,7. El segundo declara que el proyecto impresiona por sí mismo y puntúa UI 9,0 frente a 8,6; la ventaja global de AoE se reduce a 3/6.
- Pase de integración posterior: se retiró el halo exterior del atlas, se reforzó iluminación vertical/lateral, se redujo obstrucción arbórea, los anillos orbitales pasaron de marcador translúcido a material más señal fina y el impacto focal conserva toda la cadena visual. Evidencia `output/combat-28-causal-final/shot-0.png`.
- Validación exacta: 75/75 pruebas, build y sintaxis correctos; las capturas económicas/orbitales no generaron archivos de error. E2E reparación → tecnología → grupo → save/load continúa aprobado en este ciclo. El objetivo permanece abierto hasta resolver la preferencia visual global.
## Cierre funcional de campaña

- Se detuvo el trabajo de mejora visual por indicación del usuario y se preservó el aspecto aprobado.
- Victoria: el botón principal abre el Archivo Estratégico en la siguiente operación; la cuarta victoria muestra el cierre 4/4 y permite repetir expedientes.
- Derrota y pausa: reintentar reinicia directamente el escenario activo; volver al mando central conserva una operación en curso.
- Una operación terminada ya no deja un guardado reanudable obsoleto. El progreso de campaña permanece en su registro independiente.
- `Nueva campaña` limpia operación guardada, progreso, diplomacia y grupos de control.
- Guardar desde el archivo sin una partida activa conserva sólo el progreso y ya no crea un match inválido.
- Se incorporó `scripts/e2e-campaign.mjs`, que completa determinísticamente las cuatro operaciones y verifica desbloqueos, 4/4, limpieza del save y cero errores de navegador.
- Validación final: 75/75 pruebas unitarias, build de producción, E2E de campaña 4/4, smoke de partida/diplomacia/save-load y E2E de tecnología/reparación/grupos.
