# sombra_jobmanager

Panel de administración con NUI para gestionar jobs en caliente, sin necesidad de reiniciar el servidor.

[![Watch the video](https://img.youtube.com/vi/GAeKr7WKaFA/maxresdefault.jpg)](https://youtu.be/GAeKr7WKaFA)

## Compatibilidad

| Framework | Estado |
|-----------|--------|
| QBX Core (`qbx_core`) | ✅ Soportado |
| QBCore (`qb-core`) | ✅ Soportado |
| ESX (`es_extended`) | ✅ Soportado |

El framework se detecta automáticamente al iniciar el recurso.

## Dependencias

- **QBX / QBCore** — ninguna adicional, los jobs se guardan en `shared/jobs.lua`
- **ESX** — requiere `oxmysql` (tablas `jobs` y `job_grades` en la base de datos)

## Instalación

1. Copia la carpeta `agp_jobmanager` dentro de tu carpeta `[standalone]`
2. Asegúrate de que `[standalone]` esté en tu `server.cfg` con `ensure [standalone]`
3. Añade los permisos de administrador (ver abajo)

## Permisos

El recurso usa el sistema de ACE de FiveM. Añade esto en tu `server.cfg`:

```
add_principal identifier.discord:TU_DISCORD_ID group.admin
add_ace group.admin command allow
add_ace group.admin group.admin allow
```

> Para obtener tu Discord ID, entra al juego y escribe `/id` en el chat.

## Comandos

| Comando | Descripción | Permiso |
|---------|-------------|---------|
| `/jobmanager` | Abre/cierra el panel de gestión | `group.admin` |
| `/closejobmanager` | Fuerza el cierre del panel (emergencia) | Cualquiera |

## Funcionalidades

### Gestión de jobs
- **Crear** un nuevo job con nombre, label, tipo, defaultDuty y offDutyPay
- **Editar** los datos de un job existente en tiempo real
- **Eliminar** un job (con confirmación, el job `unemployed` está protegido)
- Los cambios se propagan a todos los clientes conectados automáticamente

### Gestión de grados
- **Añadir** grados con número, nombre, pago, flag de jefe (isboss) y acceso a banco (bankAuth)
- **Editar** grados existentes
- **Eliminar** grados individualmente

### Filtros y búsqueda
- Búsqueda por nombre o label en tiempo real
- Filtro multiselect por tipo de job (leo, ems, mechanic, custom...)
- Los tipos disponibles se generan dinámicamente desde los jobs existentes

### Autocomplete de tipos
- El campo "Tipo" sugiere tipos base (leo, ems, mechanic, taxi, judge, lawyer)
- También sugiere tipos custom ya usados en otros jobs
- Permite escribir cualquier valor libre

## Estructura de archivos

```
sombra_jobmanager/
├── fxmanifest.lua
├── client.lua          # Lógica NUI, callbacks, eventos cliente
├── server.lua          # Abstracción de framework, lógica servidor
└── ui/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

## Persistencia

- **QBX / QBCore** — los cambios se escriben en el archivo `shared/jobs.lua` del framework correspondiente. Al crear/editar/borrar se guarda automáticamente.
- **ESX** — los cambios se hacen directamente en la base de datos (`jobs` y `job_grades`).

## ESX — Schema de base de datos

Si usas ESX, necesitas las siguientes tablas (normalmente ya existen):

```sql
CREATE TABLE IF NOT EXISTS `jobs` (
  `name`  varchar(50) NOT NULL,
  `label` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`name`)
);

CREATE TABLE IF NOT EXISTS `job_grades` (
  `id`       int(11) NOT NULL AUTO_INCREMENT,
  `job_name` varchar(50) DEFAULT NULL,
  `grade`    int(11) DEFAULT 0,
  `name`     varchar(50) DEFAULT NULL,
  `salary`   int(11) DEFAULT 0,
  PRIMARY KEY (`id`)
);
```

## Notas

- El panel solo es accesible para jugadores con permiso `group.admin`
- El job `unemployed` no puede ser eliminado (es el job por defecto del framework)
- Los nombres de job se normalizan automáticamente a minúsculas y sin espacios
- Si el NUI se queda bloqueado, usa `/closejobmanager` o `restart sombra_jobmanager` desde la consola F8
