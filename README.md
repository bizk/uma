# AutoRondas 9-9

Extensión de Chrome para automatizar el flujo de trabajo de consultas en consultas medicas virtuales

## Funcionalidades

- **Auto-clic** en botones "Comenzar" o "Retomar" consulta
- **Conteo automático** de pacientes atendidos (rondas de 11 pacientes)
- **Anti-duplicados**: no cuenta el mismo paciente dos veces
- **Diferencia "Comenzar" vs "Retomar"**: retomar no suma al contador
- **Sonidos de notificación**: beeps al completar paciente o ronda
- **Panel flotante** arrastrable con controles

## Instalación

1. Descarga o clona este repositorio
2. Abre Chrome y ve a `chrome://extensions/`
3. Activa el **Modo desarrollador** (esquina superior derecha)
4. Click en **Cargar extensión sin empaquetar**
5. Selecciona la carpeta del proyecto

## Uso

1. Ve a `https://profesionales.umasalud.com/appointments`
2. Aparecerá el panel "AutoRondas 9-9" en la esquina superior derecha
3. Click en **▶️ Iniciar** para comenzar el auto-clic
4. La extensión buscará y clickeará automáticamente los botones de consulta

### Controles

| Botón | Acción |
|-------|--------|
| ▶️ Iniciar | Comienza el auto-clic |
| ⏸️ Pausar | Detiene el auto-clic |
| ➖ -1 | Resta 1 paciente del contador |
| 🗑️ Reset | Reinicia contadores y memoria |

## Estructura

```
├── manifest.json    # Configuración de la extensión
├── content.js       # Lógica principal
└── icons/           # Iconos de la extensión
    ├── icon_16.png
    ├── icon_48.png
    └── icon_128.png
```

## Notas

- Solo funciona en `profesionales.umasalud.com`
- Los datos se guardan localmente en el navegador
- El historial de pacientes se mantiene por 14 días (máx. 800 registros)
