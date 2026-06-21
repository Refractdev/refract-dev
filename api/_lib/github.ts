const GITHUB_API_BASE = 'https://api.github.com'

export async function githubRequest(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(errorPayload?.message ?? `GitHub request failed (${response.status})`)
  }

  return response.json()
}
