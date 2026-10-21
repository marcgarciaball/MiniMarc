# Atajos de Siri para Agente Personal

Objetivo: dictar a Siri y que el texto se guarde en Agente Personal (https://mini-marc-personal.vercel.app).

Requisitos: iPhone con iOS 26 y la app Atajos. Los nombres de acciones son los de la app en español.

## 1. Crear los tokens

1. En Agente Personal: Ajustes → Tokens de acceso → Nuevo token. Nombre: "Siri".
2. Copia el token en el momento. Solo se muestra una vez.
3. Repite con nombre "Siri trabajo".

## 2. Crear el atajo "Apunta"

1. En Atajos, pulsa + para crear un atajo. Ponle el nombre "Apunta".
2. Añade **Dictar texto** y elige el idioma Español.
3. Añade **Obtener contenido de URL**:
   - URL: `https://mini-marc-personal.vercel.app/api/capture`
   - Método: POST
   - Cabeceras: `Authorization` = `Bearer <TU_TOKEN>` y `Content-Type` = `application/json`
   - Cuerpo: JSON, con la clave `text` = variable **Texto dictado** y la clave `origin` = `siri`
4. Añade **Obtener valor del diccionario**: clave `message`, diccionario = **Contenido de URL**.
5. Añade **Leer texto** (o **Mostrar resultado**) con la variable **Valor del diccionario**.

## 3. Crear el atajo "Apunta en trabajo"

1. Pulsa ··· en "Apunta" → Duplicar. Renómbralo "Apunta en trabajo".
2. En **Obtener contenido de URL**, cambia el token de la cabecera `Authorization` por el de "Siri trabajo".
3. En el cuerpo JSON, añade la clave `area` = `trabajo`.

## 4. Sin conexión (fallback)

1. En Notas, crea una nota llamada "Agente pendiente".
2. En "Apunta", entre **Obtener contenido de URL** y **Obtener valor del diccionario**, añade **Si** → **Valor del diccionario** de `message` "no tiene ningún valor":
   - Dentro del Si: **Añadir a nota** → nota "Agente pendiente", contenido **Texto dictado**. Después, **Mostrar resultado** con "Sin conexión, guardado en Notas".
   - Cierra el bloque Si.
   - No verificado en iOS 26. Busqué documentación de Apple sobre errores en **Obtener contenido de URL** y no encontré nada oficial. Lo que hay es un patrón de la comunidad (Si sobre el resultado).
3. Pruébalo en modo avión (paso 5). Si el atajo se detiene con un error en vez de guardar en Notas, el Si no llega a ejecutarse. En ese caso, la alternativa es guardar primero el texto en "Agente pendiente" y después hacer la petición. Tendrás copias en Notas de todos los dictados.
4. Repite el fallback en "Apunta en trabajo" si lo quieres igual.

## 5. Activar por voz

- "Oye Siri, apunta" → atajo Apunta.
- "Oye Siri, apunta en trabajo" → atajo Apunta en trabajo.
- Si Siri no entiende el nombre, abre el atajo, pulsa ··· → Añadir a Siri y graba la frase.

## 6. Pruebas

Marca cada una tras probarla:

- [ ] Tarea personal: "Llamar al fontanero". Debe responder "Guardado en Tareas · Personal".
- [ ] Tarea de trabajo, con "Apunta en trabajo": "Enviar presupuesto a Ana". Debe responder con "Tareas · Trabajo".
- [ ] Cita: "el jueves a las 10 médico". Debe incluir día y hora y mencionar Calendar.
- [ ] Regalo: "regalo para mamá: pañuelo". Debe responder "Guardado en Regalos".
- [ ] Modo avión: "Apunta" → "Sin conexión, guardado en Notas", y el texto aparece en "Agente pendiente".

## 7. Solución de problemas

- Respuesta "No autorizado" (401): el token es incorrecto o se ha borrado. Crea un token nuevo y pégalo en la cabecera `Authorization` con el prefijo `Bearer `.
- "El texto está vacío" (400): no se ha dictado nada. Repite el dictado.
- Primera ejecución: iOS pide permiso para conectar con mini-marc-personal.vercel.app. Pulsa Permitir.
- Error 500 ("No se ha podido guardar"): reintenta en unos minutos.
- Si el atajo no responde nada, abre Atajos, ejecuta el atajo a mano y revisa qué respuesta aparece en **Obtener contenido de URL**.
