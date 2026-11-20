import 'server-only'

const XENDIT_BASE_URL = 'https://api.xendit.co'
const REQUEST_TIMEOUT_MS = 20_000

/** Xendit menjawab dengan error (4xx/5xx). Kegagalan jaringan/timeout TIDAK memakai kelas ini. */
export class XenditApiError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode: string | null) {
    super(message)
    this.name = 'XenditApiError'
  }
}

export async function xenditRequest<T>(
  secretKey: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const auth = Buffer.from(`${secretKey}:`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  }
  if (options.idempotencyKey) {
    headers['Idempotency-key'] = options.idempotencyKey
  }

  const res = await fetch(`${XENDIT_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    // ignore non-json
  }

  if (!res.ok) {
    const msg =
      typeof parsed.message === 'string'
        ? parsed.message
        : `Xendit API error (${res.status})`
    throw new XenditApiError(msg, res.status, typeof parsed.error_code === 'string' ? parsed.error_code : null)
  }

  return parsed as T
}
