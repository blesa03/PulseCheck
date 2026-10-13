import { useSyncExternalStore } from 'react'

export type Language = 'en' | 'es'

const STORAGE_KEY = 'pulsecheck.language'

const spanish: Record<string, string> = {
  'Language': 'Idioma',
  'English': 'Inglés',
  'Spanish': 'Español',
  'Sign in': 'Iniciar sesión',
  'Signing in…': 'Iniciando sesión…',
  'Sign out': 'Cerrar sesión',
  'Create account': 'Crear cuenta',
  'Creating account…': 'Creando cuenta…',
  'Create one': 'Crear una',
  'No account yet?': '¿Todavía no tienes cuenta?',
  'Already registered?': '¿Ya tienes cuenta?',
  'Access your monitoring dashboard.': 'Accede a tu panel de monitorización.',
  'Start monitoring your services.': 'Empieza a monitorizar tus servicios.',
  'Email': 'Correo electrónico',
  'Password': 'Contraseña',
  'Confirm password': 'Confirmar contraseña',
  'Passwords do not match.': 'Las contraseñas no coinciden.',
  'Unable to sign in.': 'No se pudo iniciar sesión.',
  'Unable to create the account.': 'No se pudo crear la cuenta.',
  'Restoring session…': 'Restaurando sesión…',
  'Signed in as': 'Sesión iniciada como',
  'Dashboard': 'Panel',
  'Back to dashboard': 'Volver al panel',
  'Back to monitors': 'Volver a los monitores',
  'Status page': 'Página de estado',
  'Public status page': 'Página pública de estado',
  'Public status': 'Estado público',
  'Add monitor': 'Añadir monitor',
  'Edit monitor': 'Editar monitor',
  'Create monitor': 'Crear monitor',
  'Save changes': 'Guardar cambios',
  'Save settings': 'Guardar configuración',
  'Saving…': 'Guardando…',
  'Cancel': 'Cancelar',
  'Close edit': 'Cerrar edición',
  'Details': 'Detalles',
  'Edit': 'Editar',
  'Pause': 'Pausar',
  'Resume': 'Reanudar',
  'Delete': 'Eliminar',
  'Check now': 'Comprobar ahora',
  'Checking…': 'Comprobando…',
  'Delete "{name}"?': '¿Eliminar "{name}"?',
  'Up': 'Operativo',
  'Degraded': 'Degradado',
  'Down': 'Caído',
  'Paused': 'Pausado',
  'Pending': 'Pendiente',
  'SUCCESS': 'CORRECTO',
  'FAILURE': 'FALLO',
  'UP': 'OPERATIVO',
  'DEGRADED': 'DEGRADADO',
  'DOWN': 'CAÍDO',
  'PAUSED': 'PAUSADO',
  'PENDING': 'PENDIENTE',
  'NO_DATA': 'SIN DATOS',
  'Open': 'Abierta',
  'Resolved': 'Resuelta',
  'TIMEOUT': 'Tiempo de espera agotado',
  'DNS_ERROR': 'Error de DNS',
  'CONNECTION_ERROR': 'Error de conexión',
  'SSL_ERROR': 'Error de SSL',
  'TOO_MANY_REDIRECTS': 'Demasiadas redirecciones',
  'UNSAFE_TARGET': 'Destino no seguro',
  'Transport error': 'Error de transporte',
  'Unknown': 'Desconocido',
  'Never checked': 'Nunca comprobado',
  'Overview': 'Resumen',
  'Monitoring': 'Monitorización',
  'Monitoring health': 'Estado de la monitorización',
  'Your monitors': 'Tus monitores',
  'Monitors': 'Monitores',
  'Uptime · 24h': 'Disponibilidad · 24 h',
  'Avg response · 24h': 'Respuesta media · 24 h',
  'Avg response': 'Respuesta media',
  'Checks · 24h': 'Comprobaciones · 24 h',
  'Check success': 'Comprobaciones correctas',
  'Open incidents': 'Incidencias abiertas',
  'Weighted across active monitored services':
    'Ponderada entre los servicios activos',
  'Confirmed outages currently unresolved':
    'Caídas confirmadas todavía sin resolver',
  'Live monitor state and trailing 24-hour metrics. Updates automatically every 30 seconds.':
    'Estado actual y métricas de las últimas 24 horas. Se actualiza automáticamente cada 30 segundos.',
  'Current health, 24-hour performance and monitor controls.':
    'Estado actual, rendimiento de las últimas 24 horas y controles de los monitores.',
  'Loading monitoring data…': 'Cargando datos de monitorización…',
  'No monitors yet': 'Todavía no hay monitores',
  'Add your first HTTP service to start monitoring availability and response time.':
    'Añade tu primer servicio HTTP para monitorizar su disponibilidad y tiempo de respuesta.',
  'active': 'activos',
  'paused': 'pausados',
  'up': 'operativos',
  'degraded': 'degradados',
  'down': 'caídos',
  'pending': 'pendientes',
  'checks observed': 'comprobaciones registradas',
  'open incident': 'incidencia abierta',
  'open incidents': 'incidencias abiertas',
  'Last checked': 'Última comprobación',
  'Next check': 'Próxima comprobación',
  'Interval': 'Intervalo',
  'Timeout': 'Tiempo de espera',
  'Thresholds': 'Umbrales',
  'Metrics are temporarily unavailable for this monitor.':
    'Las métricas de este monitor no están disponibles temporalmente.',
  'Metrics will appear after the next dashboard refresh.':
    'Las métricas aparecerán tras la próxima actualización del panel.',
  'Latest manual check': 'Última comprobación manual',
  'Some monitoring metrics could not be refreshed. Current monitor states are still available.':
    'No se pudieron actualizar algunas métricas. Los estados actuales siguen disponibles.',
  'Unable to load dashboard.': 'No se pudo cargar el panel.',
  'Unable to update monitor.': 'No se pudo actualizar el monitor.',
  'Unable to check monitor.': 'No se pudo comprobar el monitor.',
  'Unable to delete monitor.': 'No se pudo eliminar el monitor.',
  'Unable to save monitor.': 'No se pudo guardar el monitor.',
  'Invalid check response.': 'Respuesta de comprobación no válida.',
  'Monitor configuration': 'Configuración del monitor',
  'Name': 'Nombre',
  'URL': 'URL',
  'Check interval': 'Intervalo de comprobación',
  'Custom': 'Personalizado',
  'Interval in seconds': 'Intervalo en segundos',
  'Timeout in seconds': 'Tiempo de espera en segundos',
  'Failure threshold': 'Umbral de fallos',
  'Recovery threshold': 'Umbral de recuperación',
  'Raw check retention': 'Conservación de comprobaciones',
  'Raw retention': 'Conservación de datos',
  'Accepted HTTP statuses': 'Estados HTTP aceptados',
  'Accepted statuses': 'Estados aceptados',
  'Examples: 200-399 or 200-204, 301, 404':
    'Ejemplos: 200-399 o 200-204, 301, 404',
  'Follow HTTP redirects': 'Seguir redirecciones HTTP',
  'Redirects': 'Redirecciones',
  'Follow': 'Seguir',
  'Do not follow': 'No seguir',
  'Forever': 'Siempre',
  '30 seconds': '30 segundos',
  '1 minute': '1 minuto',
  '5 minutes': '5 minutos',
  '15 minutes': '15 minutos',
  '30 minutes': '30 minutos',
  '1 hour': '1 hora',
  '6 hours': '6 horas',
  '24 hours': '24 horas',
  '48 hours': '48 horas',
  '7 days': '7 días',
  '14 days': '14 días',
  '30 days': '30 días',
  'All time': 'Todo el período',
  'Enter at least one HTTP status or range.':
    'Introduce al menos un estado HTTP o rango.',
  'Use no more than 20 status ranges.':
    'Utiliza como máximo 20 rangos de estados.',
  'HTTP status codes must be between 100 and 599.':
    'Los códigos HTTP deben estar entre 100 y 599.',
  'HTTP status ranges cannot overlap.':
    'Los rangos de estados HTTP no pueden solaparse.',
  'Monitor unavailable': 'Monitor no disponible',
  'Invalid monitor identifier.': 'Identificador de monitor no válido.',
  'This monitor could not be loaded.': 'No se pudo cargar este monitor.',
  'Loading monitor details…': 'Cargando detalles del monitor…',
  'Unable to load monitor details.': 'No se pudieron cargar los detalles del monitor.',
  'Performance': 'Rendimiento',
  'Monitor health': 'Estado del monitor',
  'Metrics period': 'Período de métricas',
  'Uptime': 'Disponibilidad',
  'downtime': 'de inactividad',
  'No metrics': 'Sin métricas',
  'successful': 'correctas',
  'failed': 'fallidas',
  'currently open': 'abiertas actualmente',
  'Incidents': 'Incidencias',
  'History': 'Historial',
  'Historical performance': 'Rendimiento histórico',
  'Daily availability and response-time aggregates for the selected period.':
    'Disponibilidad y tiempos de respuesta diarios para el período seleccionado.',
  'Historical data will appear after checks have been collected.':
    'Los datos históricos aparecerán cuando se registren comprobaciones.',
  'Daily uptime': 'Disponibilidad diaria',
  'Confirmed incident downtime only.':
    'Solo se cuenta la inactividad de incidencias confirmadas.',
  'Average response': 'Respuesta media',
  'Daily mean response latency.': 'Latencia media diaria de respuesta.',
  'Chart shows the latest 30 daily buckets in the selected period. Summary metrics still cover the complete period.':
    'El gráfico muestra los últimos 30 días del período. Las métricas generales siguen cubriendo todo el período.',
  'Configuration': 'Configuración',
  'Monitor settings': 'Configuración del monitor',
  'checks': 'comprobaciones',
  'Checks': 'Comprobaciones',
  'Recent raw checks': 'Últimas comprobaciones',
  'The latest retained HTTP observations for this monitor.':
    'Las últimas observaciones HTTP conservadas de este monitor.',
  'No retained checks yet.': 'Todavía no hay comprobaciones conservadas.',
  'Result': 'Resultado',
  'Outcome': 'Respuesta obtenida',
  'Response': 'Tiempo de respuesta',
  'Checked': 'Fecha',
  'Incident history': 'Historial de incidencias',
  'Confirmed downtime created by the monitor state engine.':
    'Caídas confirmadas por el motor de estados.',
  'No incidents recorded.': 'No hay incidencias registradas.',
  'Ongoing outage': 'Caída en curso',
  'Resolved outage': 'Caída resuelta',
  'Started': 'Inicio',
  'Resolved at': 'Resolución',
  'Duration': 'Duración',
  'Showing the 20 most recent incidents.':
    'Se muestran las 20 incidencias más recientes.',
  'Loading status page settings…':
    'Cargando configuración de la página de estado…',
  'Unable to load status page settings.':
    'No se pudo cargar la configuración de la página de estado.',
  'Unable to save status page settings.':
    'No se pudo guardar la configuración de la página de estado.',
  'Status page settings saved.':
    'Configuración de la página de estado guardada.',
  'Publish selected service health without exposing private monitor configuration.':
    'Publica el estado de los servicios seleccionados sin mostrar su configuración privada.',
  'Page title': 'Título de la página',
  'Description': 'Descripción',
  'Public slug': 'Identificador público',
  'Publish status page': 'Publicar página de estado',
  'Disabled pages return 404 publicly.':
    'Las páginas desactivadas devuelven un error 404.',
  'Published monitors': 'Monitores publicados',
  'Choose which services visitors can see.':
    'Elige qué servicios podrán ver los visitantes.',
  'Create a monitor before publishing a status page.':
    'Crea un monitor antes de publicar una página de estado.',
  'Open public page': 'Abrir página pública',
  'Services': 'Servicios',
  'Current status': 'Estado actual',
  'All systems operational': 'Todos los sistemas operativos',
  'Some systems are degraded': 'Algunos sistemas están degradados',
  'Service disruption detected': 'Se ha detectado una interrupción',
  'Monitoring data pending': 'Pendiente de datos de monitorización',
  'Monitoring is paused': 'La monitorización está pausada',
  'No services published': 'No hay servicios publicados',
  'Updated': 'Actualizado',
  '30-day uptime': 'Disponibilidad en 30 días',
  'Awaiting historical data': 'Esperando datos históricos',
  'No services have been published.': 'No se han publicado servicios.',
  'No incidents reported.': 'No hay incidencias registradas.',
  'Last checked:': 'Última comprobación:',
  'Powered by PulseCheck': 'Desarrollado con PulseCheck',
  'Status page unavailable': 'Página de estado no disponible',
  'This status page is unavailable.':
    'Esta página de estado no está disponible.',
  'Unable to load service status.':
    'No se pudo cargar el estado del servicio.',
  'Loading service status…': 'Cargando estado de los servicios…',
  'Page not found': 'Página no encontrada',
  'The address you requested does not exist.':
    'La dirección solicitada no existe.',
  'Return to dashboard': 'Volver al panel',
  'Request failed.': 'La solicitud ha fallado.',
  'Invalid request.': 'Comprueba los datos introducidos.',
  'Authentication required.': 'Es necesario iniciar sesión.',
  'Access denied.': 'Acceso denegado.',
  'Resource not found.': 'No se ha encontrado el recurso.',
  'Request conflict.': 'La operación entra en conflicto con el estado actual.',
  'Too many requests.': 'Demasiadas solicitudes. Inténtalo más tarde.',
  'Server error.': 'Se ha producido un error del servidor.',
}

const listeners = new Set<() => void>()

function loadLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'es' ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

let currentLanguage: Language =
  typeof window === 'undefined' ? 'en' : loadLanguage()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLanguage(): Language {
  return currentLanguage
}

export function setLanguage(next: Language): void {
  if (next === currentLanguage) return

  currentLanguage = next

  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The interface still works when browser storage is unavailable.
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
  }

  listeners.forEach((listener) => listener())
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en')
}

export function t(
  key: string,
  params: Record<string, string | number> = {},
): string {
  let result =
    currentLanguage === 'es'
      ? spanish[key] ?? key
      : key

  for (const [name, value] of Object.entries(params)) {
    result = result.replaceAll(`{${name}}`, String(value))
  }

  return result
}

export function formatDateTime(
  value: string | null,
  empty = '—',
): string {
  if (!value) return t(empty)

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('Unknown')

  return new Intl.DateTimeFormat(
    currentLanguage === 'es' ? 'es-ES' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date)
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(
    currentLanguage === 'es' ? 'es-ES' : 'en-US',
    { month: 'short', day: 'numeric' },
  ).format(date)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(
    currentLanguage === 'es' ? 'es-ES' : 'en-US',
  ).format(value)
}

export function formatPercentage(value: number | null): string {
  if (value === null) return '—'
  return `${new Intl.NumberFormat(
    currentLanguage === 'es' ? 'es-ES' : 'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(value)}%`
}

export function formatLatency(value: number | null): string {
  return value === null ? '—' : `${formatNumber(Math.round(value))} ms`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    const suffix = currentLanguage === 'es' ? 'min' : 'm'
    return remaining ? `${minutes}${suffix} ${remaining}s` : `${minutes}${suffix}`
  }

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return hours ? `${days}d ${hours}h` : `${days}d`
}

export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return t(fallback)

  if (currentLanguage === 'en') return error.message

  if (error.message.startsWith('Invalid HTTP status range: ')) {
    return `Rango HTTP no válido: ${error.message.slice(27)}`
  }

  if (spanish[error.message]) return t(error.message)

  const status = 'status' in error ? error.status : undefined

  if (typeof status === 'number') {
    if (status === 400) return t('Invalid request.')
    if (status === 401) return t('Authentication required.')
    if (status === 403) return t('Access denied.')
    if (status === 404) return t('Resource not found.')
    if (status === 409) return t('Request conflict.')
    if (status === 429) return t('Too many requests.')
    if (status >= 500) return t('Server error.')
  }

  return t(fallback)
}