// Contenido de la GUÍA (preguntas frecuentes y novedades).
// Lo usan la app (src/SistemaCalificaciones.jsx) y Areco Bot (netlify/functions/areco-bot.mjs).
// Para cambiar o agregar preguntas, se edita solo este archivo.

// Cada pregunta: c = categoría, rol = 'admin' (solo Dirección) | 'docente' (solo docentes) | sin rol (todos)
export const CATEGORIAS_AYUDA = ['Notas', 'Alumnos', 'Inasistencias', 'Observaciones', 'PDF y escala', 'Cuenta y sistema'];

export const PREGUNTAS_AYUDA = [
  // ───────── NOTAS ─────────
  { c: 'Notas', k: 'bloqueado bloqueo candado cerrado desbloquear completo fecha', p: 'No puedo cargar notas: el bimestre tiene un candado o dice "Completo".',
    r: 'El bimestre está cerrado, ya sea porque se marcó como completo o porque venció la fecha de cierre.\n1. Pedile a la Dirección que lo habilite, indicando materia, grado y bimestre.\n2. Cuando te avisen, salí de la materia y volvé a entrar (o recargá la página).' },
  { c: 'Notas', k: 'criterio criterios vacio desaparecieron', p: 'Dice "Sin criterios aún" y no puedo cargar notas.',
    r: 'Cada bimestre necesita sus criterios antes de cargar notas.\n1. Entrá a la materia y abrí el bimestre.\n2. Tocá el botón para agregar un criterio y escribí su nombre (por ejemplo "Evaluación escrita").\nSi antes tenías criterios y desaparecieron, no vuelvas a cargarlos: avisá con "Reportar un problema" para que se recuperen las notas.' },
  { c: 'Notas', p: '¿Puedo cambiar el nombre de un criterio?',
    r: 'Sí. Cambiar el nombre no modifica las notas ya cargadas, y el promedio se calcula siempre con las notas que hay cargadas en el bimestre, sin importar cómo se llamen los criterios.' },
  { c: 'Notas', p: '¿Cómo marco un bimestre como completo?',
    r: 'Tocá "✓ Marcar" en el bimestre. Para poder marcarlo tiene que haber criterios cargados y todos los alumnos con todas sus notas. Al marcarlo queda cerrado y se avisa a la Dirección. Si te equivocás, pedí que lo reabran.' },
  { c: 'Notas', k: 'sincronizar sincronizacion guardar guardado nube internet offline conexion', p: '¿Cómo sé si mis notas se guardaron?',
    r: 'Cada cambio se guarda solo, sin botón de guardar. Tras cargar una nota esperá a ver el aviso "Guardado en la nube".\nSi no tenés internet, el cambio queda en tu dispositivo y se envía cuando vuelve la conexión: no cierres sesión ni borres los datos del navegador hasta entonces.\nPara estar seguro, recargá la página y comprobá que la nota sigue ahí.' },
  { c: 'Notas', k: 'sincronizar sincronizacion actualizar celular computadora diferente', p: 'Veo cosas distintas en el celular y en la computadora.',
    r: 'Recargá la página en el dispositivo que muestra datos viejos (Ctrl + F5 en la compu; en el celular, cerrá la app y volvé a abrirla) y esperá unos segundos a que se actualice.\nRecomendación: no cargues notas de la misma materia en dos dispositivos al mismo tiempo; terminá en uno y recién después abrí el otro.' },
  { c: 'Notas', p: 'Me apareció un cartel de que los datos no se cargaron bien o que NO se guardó un cambio.',
    r: 'Es una protección: el sistema no pudo leer los datos y por eso no deja guardar, para no pisar notas.\n1. Revisá tu conexión y esperá unos segundos.\n2. Recargá la página.\n3. No sigas cargando notas hasta que desaparezca el aviso.\nSi el cartel persiste, usá "Reportar un problema".' },
  { c: 'Notas', p: 'La pantalla de la materia aparece vacía (sin alumnos o sin notas).',
    r: 'Casi siempre es un problema de conexión al abrir. Tus notas no se borran por esto.\n1. Esperá unos segundos.\n2. Si sigue vacía, cerrá la app por completo (o recargá con Ctrl + F5) y volvé a entrar.\n3. No cargues nada hasta que se vean los datos.\nSi persiste, usá "Reportar un problema" indicando materia y grado.' },
  { c: 'Notas', rol: 'admin', p: 'Una materia perdió notas o criterios: ¿cómo las recupero?',
    r: 'Entrá a esa materia y grado y tocá "♻️ Recuperar notas". El sistema busca en el registro de cambios y te muestra un resumen antes de aplicar. Solo completa casilleros vacíos: nunca pisa una nota que ya está cargada. Hay que hacerlo materia por materia y grado por grado. Si un bimestre no tiene registros en el historial, esas notas no se pueden recuperar por este medio.' },
  { c: 'Notas', rol: 'admin', p: '¿Cómo desbloqueo un bimestre para un docente?',
    r: 'Desde el panel de bimestres del menú de Dirección podés desbloquear de forma individual (una materia y grado) o masiva (todas las de un docente o un grupo). Después de desbloquear, el docente debe salir de la materia y volver a entrar. Si el cierre es por fecha, revisá también las fechas de bloqueo, para que no se vuelva a cerrar solo.' },

  // ───────── ALUMNOS ─────────
  { c: 'Alumnos', k: 'falta faltan lista baja agregar', p: 'No veo a un alumno en mi lista.',
    r: 'Puede que no esté agregado todavía o que haya sido dado de baja.\n1. Recargá la página por si lo agregaron hace un momento.\n2. Pedile al docente de grado que lo agregue en la lista de alumnos del grado.\n3. Si fue una baja por error, la Dirección o el docente de grado pueden usar "Reincorporar" en el Registro de Bajas.' },
  { c: 'Alumnos', k: 'sincronizar sincronizacion alta baja grado', p: 'Agregué o di de baja a un alumno: ¿se ve en todas las materias?',
    r: 'Sí. El alta y la baja se aplican al grado completo, así que el alumno aparece (o desaparece) en todas las materias. Los docentes de especiales lo ven al abrir la materia o al recargar la página. Estas acciones necesitan conexión: si no hay, el sistema avisa y no cambia nada.' },
  { c: 'Alumnos', k: 'baja reincorporar egreso pase notas', p: 'Un alumno se fue de la escuela: ¿qué pasa con sus notas?',
    r: 'Al darlo de baja se quita de todas las materias del grado, pero sus notas quedan guardadas aparte. Si vuelve, usá "Reincorporar" en el Registro de Bajas: se restauran sus notas, sin pisar nada que ya se haya cargado.' },
  { c: 'Alumnos', k: 'alta pase nuevo ingreso', p: 'Un alumno llegó de otra escuela con notas.',
    r: 'Agregalo en la lista de alumnos del grado. Las notas de especiales las carga quien tenga asignada cada materia. Si ningún docente tiene acceso a una materia, pedile a la Dirección que habilite a alguien para cargarla.' },

  // ───────── INASISTENCIAS ─────────
  { c: 'Inasistencias', rol: 'docente', k: 'falta faltar licencia certificado ausencia', p: '¿Cómo cargo una inasistencia?',
    r: '1. En el menú principal tocá "📋 Inasistencias" y elegí "➕ Nueva inasistencia".\n2. Elegí el motivo. Si es Licencia médica, escribí el N° o tipo de licencia; si es "Otro", describí el motivo.\n3. Completá las fechas desde y hasta (son obligatorias). Si es un solo día, tildá "Inasistencia de un solo día".\n4. Si querés, agregá una observación y adjuntá el certificado.\n5. Tocá "Enviar inasistencia a Dirección".' },
  { c: 'Inasistencias', rol: 'docente', k: 'pdf certificado foto adjunto subir', p: '¿Qué archivos puedo adjuntar a una inasistencia?',
    r: 'Solo archivos PDF, hasta 5 por inasistencia. Si tenés el certificado como foto, convertilo a PDF antes de subirlo (por ejemplo con un escáner en el celular). Esperá a que termine de subir: con archivos grandes puede tardar.' },
  { c: 'Inasistencias', rol: 'docente', p: '¿Cómo sé que la Dirección recibió mi inasistencia?',
    r: 'Después de enviarla aparece el aviso "Inasistencia enviada" y queda en "Mis inasistencias" como "📨 Enviada". Cuando la Dirección la revisa pasa a "✓ Revisada por dirección".' },
  { c: 'Inasistencias', rol: 'docente', k: 'corregir editar modificar borrar eliminar', p: 'Me equivoqué en una inasistencia que ya envié.',
    r: 'Las inasistencias enviadas no se pueden editar. Avisá a la Dirección por el medio habitual, o cargá una nueva con la fecha o los datos correctos y aclarala en la observación.' },
  { c: 'Inasistencias', rol: 'docente', p: 'No me deja enviar la inasistencia.',
    r: 'Revisá que hayas elegido un motivo, que hayas completado el detalle (si es Licencia u Otro), que las fechas estén cargadas y que la fecha de inicio no sea posterior al fin. Si todo está bien y falla, puede ser la conexión (sobre todo con adjuntos): probá de nuevo con mejor señal.' },
  { c: 'Inasistencias', rol: 'admin', p: '¿Cómo reviso las inasistencias de los docentes?',
    r: 'Entrá a "📋 Inasistencias" desde el menú de Dirección. El número en rojo indica cuántas hay sin revisar. Al abrir la lista se marcan como vistas, y el docente lo ve reflejado como "Revisada por dirección". Podés filtrar por nombre o por fecha y abrir los certificados adjuntos.' },

  // ───────── OBSERVACIONES ─────────
  { c: 'Observaciones', k: 'observacion anotar novedades texto', p: '¿Para qué sirve el cuadro de "Observaciones Generales"?',
    r: 'Está al final de cada materia, debajo de la lista de alumnos. Sirve para anotar novedades del grupo: situaciones grupales, recuperatorios, acuerdos con la familia o cualquier dato útil. Es un texto por materia y grado, y no se incluye en el PDF.' },
  { c: 'Observaciones', k: 'observacion guardar automatico perdio', p: '¿Cómo se guardan las observaciones?',
    r: 'Se guardan solas unos instantes después de que dejás de escribir; debajo del cuadro figura la "Última modificación". Antes de salir de la pantalla esperá a que actualice esa fecha. Con mala conexión, comprobá al volver a entrar que el texto sigue.' },
  { c: 'Observaciones', p: 'No veo el cuadro de Observaciones.',
    r: 'El cuadro aparece al final de la pantalla de la materia y solo si el grado tiene alumnos cargados. Bajá hasta el final de la lista; si no está, recargá la página.' },
  { c: 'Observaciones', p: 'Otro docente también escribe en las observaciones de la misma materia.',
    r: 'El texto es único por materia y grado: todos los que la tienen asignada ven y editan el mismo cuadro. Si dos personas escriben a la vez, gana lo último que se guardó. Conviene agregar al final del texto sin borrar lo anterior y recargar antes de escribir si otra persona pudo haber anotado algo.' },

  // ───────── PDF Y ESCALA ─────────
  { c: 'PDF y escala', k: 'pdf planilla descargar imprimir', p: '¿Cómo descargo el PDF?',
    r: '"PDF Individual" genera la planilla de la materia que tenés abierta. "PDF Unificado" junta todas tus materias del grado y te pregunta de qué bimestre lo querés (1, 2, 3 o 4; vacío usa el último bimestre cerrado).' },
  { c: 'PDF y escala', p: '¿Cómo funciona la escala de 1° a 3° grado?',
    r: 'En primer ciclo las notas se muestran como conceptos: NS (2-3), PS (4-5), SAT (6-7), MS (8), DIS (9) y SOB (10). Los promedios con decimales se redondean (por ejemplo 5,5 pasa a 6). SAT, MS, DIS y SOB se muestran en verde; NS y PS, en rojo.' },

  // ───────── CUENTA Y SISTEMA ─────────
  { c: 'Cuenta y sistema', k: 'bot asistente ia inteligencia artificial chat ayuda', p: '¿Qué es Areco Bot (IA)?',
    r: 'Es el asistente virtual de la guía, basado en inteligencia artificial. Podés escribirle tu consulta y te responde con los pasos de esta guía. Si no se resuelve, te ayuda a armar el reporte para la Dirección. No maneja ni modifica datos de los alumnos (nombres, DNI, notas) y, como toda IA, puede cometer errores: ante la duda, usá "Reportar un problema". Tiene un límite de consultas por día.' },
  { c: 'Cuenta y sistema', p: 'La app no muestra los últimos cambios.',
    r: 'Cerrá la app por completo (en el celular, sacala de las aplicaciones recientes) y volvé a abrirla. Si ves el aviso de "nueva versión", tocalo para actualizar. Mirá también la pestaña "🆕 Novedades" de esta ayuda.' },
  { c: 'Cuenta y sistema', k: 'clave password recuperar', p: 'Olvidé mi contraseña.',
    r: 'En la pantalla de ingreso tocá "¿Olvidaste tu contraseña?" y seguí los pasos: te llega un correo para crear una nueva. Revisá también la carpeta de spam.' },
  { c: 'Cuenta y sistema', k: 'activar activacion cuenta inactiva registro', p: 'Me registré y no puedo entrar.',
    r: 'Las cuentas nuevas quedan pendientes hasta que la Dirección las activa. Avisale a la Dirección que ya te registraste, con tu nombre y correo.' },
  { c: 'Cuenta y sistema', p: 'Necesito que me cambien el grado o las materias asignadas.',
    r: 'Lo hace la Dirección desde la gestión de usuarios. Pedíselo indicando qué grado o materias necesitás; después cerrá sesión y volvé a entrar.' },
];

export const NOVEDADES_AYUDA = [
  { f: '25/10/2026', t: ['Guía ampliada: buscador, categorías y preguntas nuevas sobre sincronización, alumnos, inasistencias y observaciones.', 'Nueva pestaña "Novedades".', 'Areco Bot (IA): asistente virtual dentro de la GUÍA para consultar dudas y armar el reporte de un problema.', 'El reporte permite elegir el motivo con un toque y suma datos técnicos automáticos para que la Dirección resuelva más rápido.'] },
  { f: '24/10/2026', t: ['Dar de baja a un alumno ya no borra sus notas: se guardan y se restauran con "Reincorporar".', 'Botón "Reportar un problema" dentro de esta guía.', 'El PDF unificado permite elegir el bimestre.', 'Los colores de la escala de primer ciclo ahora coinciden con la escala (SAT en verde).', 'Desbloqueo de bimestres más rápido y confiable.', 'Las notas tienen una copia de seguridad automática todos los días.'] },
];
