import { signInWithGitHub } from './api'

export const GITHUB_APP_URL = 'github' // triggers signInWithGitHub

export function buildGitHubAppInstallUrl(): void {
  signInWithGitHub()
}