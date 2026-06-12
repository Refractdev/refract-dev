import { buildGitHubOAuthUrl } from './api'

export const GITHUB_APP_URL = buildGitHubOAuthUrl()

export function buildGitHubAppInstallUrl(state?: string): string {
  return buildGitHubOAuthUrl(state)
}