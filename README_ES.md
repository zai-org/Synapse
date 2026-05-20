<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/synapse-full-logo.svg">
        <img src="docs/assets/synapse-full-logo-dark.svg" alt="Synapse" width="500">
    </picture>
</p>

<p align="center">
  <strong>Crea equipos de IA, no solo chatbots.</strong>
</p>

<p align="center">
  Un espacio de trabajo de IA autoalojado con compañeros de IA que pueden compartirse, conversaciones compartidas,
  memoria, acceso gobernado a plugins y herramientas MCP, ejecución local y automatización por eventos.
</p>

<p align="center">
  Convierte la IA en un equipo digital con roles, memoria, permisos y relaciones de trabajo.
</p>

<p align="center">
  <a href="./README.md">English (US)</a> ·
  <a href="./README_CN.md">简体中文</a> ·
  <strong>Español</strong>
</p>

<p align="center">
  <a href="#por-qué-synapse">Por qué Synapse</a> ·
  <a href="#resumen-de-arquitectura">Arquitectura</a> ·
  <a href="#flujos-típicos">Flujos típicos</a> ·
  <a href="#hoja-de-ruta">Hoja de ruta</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#qué-incluye-este-repositorio">Qué incluye este repositorio</a> ·
  <a href="./deploy.md">Despliegue</a>
</p>

<p align="center">
  <img
    src="docs/.images/gpt-image-2/synapse-framework-gpt-image-2-20260514-061731.png"
    alt="Vista general del framework de Synapse"
    width="100%"
  />
</p>

> [!WARNING]
> Synapse sigue en una fase temprana de diseño e implementación. El esquema de datos, los contratos de runtime y varias partes del producto pueden cambiar con rapidez. Por ahora no se garantiza compatibilidad con datos antiguos.

Synapse no gira alrededor de un bot aislado, sino de la conversación como unidad real de trabajo.

En una misma conversación pueden colaborar personas, Actors nativos de la plataforma y Remote Agents conectados por bridge. La memoria, los permisos, los plugins, las herramientas expuestas por MCP Relay y las fuentes de eventos se gobiernan a nivel de Workspace. Además, estos compañeros de IA pueden compartirse entre Workspaces, añadirse como contactos y recibir acceso únicamente a los recursos autorizados.

## Por qué Synapse

- **La conversación es el centro.** La conversación define el límite operativo: participantes, visibilidad del historial, activación de Actors, contexto de ejecución y continuidad de memoria.
- **Los compañeros de IA se pueden compartir.** Miembros del Workspace, Actors y Remote Agents pueden compartirse entre Workspaces y añadirse mediante una red de contactos.
- **El acceso a recursos está gobernado.** Plugins, skills, capacidades de MCP Relay y fuentes de eventos se modelan como recursos del Workspace con permisos, auditoría y revocación.
- **Coordinación en la nube, ejecución cerca del dispositivo.** El equipo colabora en la web, pero el trabajo puede aterrizar en navegadores locales, escritorios, sistemas de archivos, servicios internos o entornos externos de agentes.
- **Los eventos también disparan trabajo.** Tareas programadas, webhooks e integraciones como GitHub o GitLab pueden activar conversaciones y poner a trabajar a los roles correctos.
- **Agentes nativos y externos conviven.** Los Actors viven dentro de Synapse; los Remote Agents entran por bridge y conservan su propio entorno de ejecución.

## Modelo base

| Concepto         | Qué significa en Synapse                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Workspace`      | Frontera de propiedad y gobierno para compañeros de IA, plugins, dispositivos Relay y fuentes de eventos.                |
| `Conversation`   | El espacio compartido donde colaboran los participantes y queda persistido el trabajo.                                   |
| `Actor`          | Un compañero digital administrado de forma nativa por Synapse.                                                           |
| `Remote agent`   | Un runtime externo que entra a una conversación mediante bridge sin convertirse en Actor nativo.                         |
| `Resource layer` | La capa de plugins, skills, capacidades de MCP Relay y fuentes de eventos que puede otorgarse, auditarse y reutilizarse. |

## Resumen de arquitectura

Synapse adopta una arquitectura centrada en la conversación. A partir de ese núcleo, el sistema separa los runtimes de recursos, el control de acceso, la memoria, la integración de transportes externos y la gestión de contexto.

- **Runtime de conversación y sesión.** `conversation`, participantes, items de conversación, sesiones de Actor y `session_wakeups` definen el modelo principal de colaboración y ejecución. La web, los bridges de Remote Agents y los transportes IM reutilizan este modelo en lugar de implementar sistemas de chat separados.
- **Runtimes de recursos.** Plugins, skills instaladas, exposiciones de Relay, Actors y Remote Agents se modelan como recursos de runtime independientes, con estado, ciclo de vida y APIs propios. El catálogo del marketplace se almacena por separado del estado instalado en runtime.
- **Control de acceso.** La autorización se evalúa sobre tipos de recurso explícitos, entre ellos `workspace`, `conversation`, `actor`, `remote_agent`, `plugin_installation`, `installed_skill`, `relay_capability` y `memory_item`. Así, el uso compartido, la invocación y la gobernanza se apoyan en un único modelo de acceso.
- **Subsistema de memoria.** La memoria se particiona por alcance: `workspace_shared`, `conversation_shared`, `actor_private`, `participant_private` y `user_private`. La recuperación combina indexación léxica y embeddings para cubrir tanto memoria duradera como estado de trabajo por hilo.
- **Integración de transporte y automatización.** Los transportes IM vinculan endpoints externos de nuevo a conversaciones. Fuentes de eventos, tareas programadas, webhooks y disparadores de integraciones entran por el mismo runtime para despertar sesiones y producir eventos visibles en conversación.
- **Gestión de la ventana de contexto.** El contexto del modelo se compila a partir de canonical context items en cadenas de archivo shared/private y una ventana viva de cola. Archive points, compaction runs y per-event context policies limitan el tamaño del prompt sin perder semántica de alcance ni de evento.

## Flujos típicos

- Compartir un Actor de investigación con otro Workspace, darle acceso a los plugins adecuados y ponerlo a trabajar en la misma conversación que las personas.
- Emparejar un Relay de escritorio para habilitar navegador, sistema de archivos y línea de comandos sin abrir esos recursos a todo el mundo.
- Registrar fuentes de eventos de GitHub, GitLab o webhooks personalizados para abrir una conversación de incidente y convocar a los Actors correctos.
- Conectar un agente de programación que corre en otra máquina como Remote Agent, manteniendo sus propias herramientas y su entorno de ejecución externo.

## Capacidades experimentales

Esta sección resume direcciones de runtime que ya se están validando en código, pero que todavía no deben tratarse como contratos estables de la plataforma.

### Everything is a file model

Synapse está explorando un modelo de proyección sobre sistema de archivos virtual para ciertos runtimes locales, donde estado, estructura y acciones se expresan como rutas, archivos y nodos de control escribibles. Esta dirección encaja tanto con el modelo de autorización de la plataforma como con la fuerte base previa que los modelos tienen sobre flujos de línea de comandos, lo que facilita composición, pipes y encadenamiento con menos rondas de ejecución.

Lo implementado hoy incluye:

- **Exposiciones VFS por sesión.** Relay VFS proyecta hoy los runtimes builtin de browser y CUA bajo rutas por sesión, con controles basados en archivos para crear, inspeccionar y cerrar sesiones.
- **Proyección de browser.** La superficie de browser ya expone estado de páginas, listado de páginas, snapshots y screenshots de la página actual, una proyección en árbol con archivos por nodo, y archivos de acción escribibles para navegación e interacción.
- **Proyección de CUA.** La superficie de CUA ya expone displays, ventanas, apps, capturas, estado del teclado, resúmenes del elemento enfocado y un árbol semántico de accesibilidad cuando el backend de escritorio está disponible.
- **Archivos de acción.** Los nodos escribibles ya se traducen a acciones concretas del runtime. En browser esto incluye `navigate`, `new_page`, `select_page`, `click`, `fill`, `press_key` y `evaluate`; en CUA incluye `click`, `type_text`, `press_keys` y `scroll`, además de acciones semánticas por nodo cuando existen límites accionables.

## Hoja de ruta

Los elementos de la hoja de ruta describen capacidades planificadas de la plataforma. Son direccionales y pueden ajustarse a medida que evoluciona el modelo de runtime.

### Planeado: runtime de Sandbox

Incorporar un runtime de Sandbox gestionado como superficie de ejecución gobernada para agentes.

Objetivos previstos:

- Modelar entornos de ejecución aislados como recursos gobernados por el Workspace, en lugar de acceso directo al host.
- Soportar suspensión, reanudación y estado persistente para que el trabajo del agente continúe entre ejecuciones.
- Ofrecer perfiles de entorno estandarizados, con variantes opcionales con GUI e integraciones preconfiguradas.
- Soportar despliegues tanto en la nube como gestionados localmente.
- Evaluar interfaces de control compatibles con E2B cuando encajen con el modelo de conversaciones, recursos y autorización de Synapse.

Esta capacidad está planificada; todavía no forma parte de la funcionalidad entregada.

## Inicio rápido

### Web local + API

Requisitos previos:

- Node.js
- Docker y Docker Compose

Clona el repositorio y levanta la base local:

```bash
git clone https://github.com/zai-org/Synapse
cd Synapse

npm ci
./setup.sh
docker compose up -d postgres redis

# Crea el esquema actual
npm run db:bootstrap

# Inicia la API y la web de escritorio en terminales separadas
npm run dev:api
npm run dev:web
```

Luego abre:

- Web de escritorio: `http://localhost:3000`
- Health check de la API: `http://localhost:3001/api/v1/health`

Si tu entorno local de Docker requiere privilegios elevados, ejecuta `docker compose` con `sudo`.

Para que los flujos de chat y los Actors usen modelos reales, edita `.env` y configura `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL` y `AI_MODEL`.

### Opcional: reconstruir y sembrar un entorno de demo

Si quieres un entorno local con usuarios de demo, un Workspace inicial, Actors oficiales y entradas del catálogo de plugins:

```bash
npm run db:rebuild
```

Cuentas sembradas por defecto:

- `demo@synapse.dev` / `demo1234`
- `yihang@synapse.dev` / `demo1234`

### Opcional: ejecutar la app móvil con Expo

La app móvil vive en su propio paquete y mantiene su propio lockfile:

```bash
cd packages/mobile-app
npm ci
npm run web
```

Dentro de `packages/mobile-app` también puedes usar `npm run ios` o `npm run android`.

## Qué incluye este repositorio

- `packages/api`: API con Fastify y runtime de orquestación, chat, memoria, archivos, automatización, plugins, Relay, IM y auditoría
- `packages/web-next`: aplicación web de escritorio en Next.js y dashboard del Workspace
- `packages/mobile-app`: app móvil con Expo Router y versión web móvil exportable
- `packages/remote-agent-daemon`: daemon que se ejecuta en la máquina para conectar runtimes externos como Codex CLI o Claude Code
- `packages/shared`: tipos compartidos, contratos de protocolo, definiciones de automatización y constantes
- `subprojects/cli-anything`: paquete vendorizado de capacidades usado por las skills cargadas automáticamente vía Relay

## Despliegue

Hoy el repositorio trae una ruta de autoalojamiento pensada para una sola máquina Ubuntu:

- `systemd` para la API y la web de escritorio
- `nginx` como punto de entrada público
- PostgreSQL y Redis en Docker
- imágenes precompiladas en GHCR para ejecutar opcionalmente la API y la web de escritorio en contenedores
- la web de escritorio servida desde `packages/web-next`
- el mobile web exportado estáticamente desde `packages/mobile-app`

Consulta [`deploy.md`](deploy.md) para el flujo de despliegue en producción usado por este repositorio.
