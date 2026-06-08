export const GITHUB_APP_URL = 'https://github.com/apps/refract-app-dev'

export function buildGitHubAppInstallUrl(state?: string): string {
  if (!state) return GITHUB_APP_URL

  return `${GITHUB_APP_URL}?state=${encodeURIComponent(state)}`
}

