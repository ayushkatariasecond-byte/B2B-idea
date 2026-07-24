/**
 * Minimal structured logging — every line is a single JSON object (event, fields,
 * timestamp), not an ad-hoc string, so it's greppable/parseable by whatever log
 * aggregator this ends up running under (Railway's log viewer, or anything downstream of
 * it). Deliberately not a new dependency (pino/winston): at this app's current scale, a
 * ~15-line wrapper over console.log/console.error covers the one thing actually asked
 * for (structured event logs around the feed's city-lock logic) without taking on a new
 * library's config surface for a single call site.
 */
type LogFields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
