# Avisos de Agente Personal en el iPhone

Objetivo: que los avisos de 3 h (180 min) y 1 h (60 min) lleguen al iPhone, una sola vez.

Requisitos: iPhone con iOS 26, cuenta de Google, un ordenador para el paso 1.

## 1. Avisos por defecto en Google Calendar (escritorio)

Hazlo en el ordenador, en https://calendar.google.com.

1. Engranaje → Configuración.
2. En "Configuración de mis calendarios", abre el calendario principal.
3. Sección "Notificaciones de eventos": añade "Ventana emergente, 3 horas" y "Ventana emergente, 1 hora".
4. Repite el paso 2 y 3 con el calendario "Tareas".

Así también los eventos creados fuera de la app tendrán avisos.

## 2. Añadir la cuenta de Google a Calendario de iOS

Verificado el 2026-10-21 (Apple Support, "Change your Calendar settings on iPhone").

1. Ajustes → Apps → Calendario → Cuentas de calendario → Añadir cuenta → Google.
2. Inicia sesión con tu cuenta de Google.
3. Activa "Calendarios".

## 3. Sincronizar "Tareas" con iOS

1. Abre https://calendar.google.com/calendar/syncselect.
   No verificado: no encontré documentación oficial de esa página. Si no existe, consulta la ayuda de Google para iPhone: https://support.google.com/calendar/answer/151674
2. Marca "Tareas" y guarda.
3. En la app Calendario del iPhone, pulsa "Calendarios" (abajo). "Tareas" debe aparecer bajo la cuenta de Google y estar marcado (visible).

## 4. Notificaciones en una sola app

Para evitar duplicados, avisos solo desde una app.

1. Recomendado: Calendario de Apple. Ajustes → Notificaciones → Calendario → Permitir notificaciones: activado.
2. Si instalas también la app Google Calendar: Ajustes → Notificaciones → Google Calendar → Permitir notificaciones: desactivado.

## 5. Instalar la PWA

1. Abre https://mini-marc-personal.vercel.app en Safari.
2. Compartir → Añadir a pantalla de inicio → Añadir.
3. Abre la app desde su icono, no desde Safari.

Requisito: iOS 16.4 o superior (iOS 26 cumple). Las notificaciones del resumen matutino se activarán más adelante desde Ajustes dentro de la app.

## 6. Prueba final

1. Anota la hora actual y crea en la app una cita para dentro de unos 65 minutos.
2. El aviso de 1 h debe llegar unos 5 minutos después de crear la cita (65 - 60).
3. El aviso de 3 h no llegará, porque ya ha pasado. Es lo esperado.
4. Confirma que el aviso llega una sola vez. Si llega dos veces, revisa el paso 4.
