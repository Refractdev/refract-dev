const DEFAULT_HOST = 'https://app.posthog.com'

type AnalyticsProps = Record<string, unknown>

let clientInstance: any = null
let clientInitPromise: Promise<void> | null = null

function readEnv(key: string): string | undefined {
  const viteEnv = (import.meta as any).env?.[key] as string | undefined
  const nodeEnv = typeof process !== 'undefined' ? process.env?.[key] : undefined
  return viteEnv ?? nodeEnv
}

function getConfig() {
  const key = readEnv('VITE_POSTHOG_KEY')?.trim()
  const host = readEnv('VITE_POSTHOG_HOST')?.trim() || DEFAULT_HOST
  return { key, host }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

async function ensureClient(): Promise<any | null> {
  if (!isBrowser()) return null

  const { key, host } = getConfig()
  if (!key) return null

  if (clientInstance) return clientInstance
  if (!clientInitPromise) {
    clientInitPromise = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(key, {
          api_host: host,
          capture_pageview: false,
        })
        clientInstance = posthog
      })
      .catch((error) => {
        console.warn('[analytics] Failed to initialize PostHog:', error)
        clientInstance = null
      })
      .finally(() => {
        clientInitPromise = null
      })
  }

  await clientInitPromise
  return clientInstance
}

function resolveDistinctId(event: string, props: AnalyticsProps): string {
  if (typeof props.project_id === 'string' && props.project_id.trim()) {
    return props.project_id
  }
  if (typeof props.repo_url === 'string' && props.repo_url.trim()) {
    return props.repo_url
  }
  if (typeof props.user_id === 'string' && props.user_id.trim()) {
    return props.user_id
  }
  return `server:${event}`
}

async function captureServerEvent(event: string, props: AnalyticsProps): Promise<void> {
  const { key, host } = getConfig()
  if (!key) return

  try {
    const response = await fetch(new URL('/capture/', host).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: resolveDistinctId(event, props),
        properties: props,
      }),
    })

    if (!response.ok) {
      console.warn('[analytics] PostHog capture failed:', response.status)
    }
  } catch (error) {
    console.warn('[analytics] PostHog capture error:', error)
  }
}

export async function trackEvent(event: string, props: AnalyticsProps = {}): Promise<void> {
  if (isBrowser()) {
    const posthog = await ensureClient()
    posthog?.capture(event, props)
    return
  }

  await captureServerEvent(event, props)
}

export async function identifyUser(userId: string, traits: AnalyticsProps = {}): Promise<void> {
  if (!isBrowser()) return

  const posthog = await ensureClient()
  posthog?.identify(userId, traits)
}

export async function resetUser(): Promise<void> {
  if (!isBrowser()) return

  const posthog = await ensureClient()
  posthog?.reset()
}
