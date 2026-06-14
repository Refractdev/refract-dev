export const GITHUB_APP_URL = `https://github.com/login/oauth/authorize?client_id=Ov23liWreseZjhQPKzDp&redirect_uri=${encodeURIComponent('https://lkzuyveiyildfpgcxknx.supabase.co/auth/v1/callback')}&scope=repo,user`

export function buildGitHubAppInstallUrl(state?: string): string {
  return `${GITHUB_APP_URL}&state=${encodeURIComponent(state || '')}`
}
