/** Best-effort Expo push send — failures (including no network access to exp.host) never affect the caller. */
export async function sendExpoPush(token: string | null | undefined, title: string, body: string, data?: Record<string, unknown>) {
  if (!token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data }),
    });
  } catch {
    // best-effort only
  }
}
