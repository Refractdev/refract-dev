import type { VercelRequest, VercelResponse } from '@vercel/node'

// GitHub OAuth callback — troca code por access_token
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { code, state } = req.query
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Missing code parameter' })
    }

    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        console.error('[auth/github] Missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET')
        return res.status(500).json({ error: 'OAuth not configured' })
    }

    try {
        // 1. Troca code por access_token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        })

        const tokenData = await tokenRes.json()
        const accessToken = tokenData.access_token

        if (!accessToken) {
            console.error('[auth/github] Failed to get access token:', tokenData)
            return res.status(400).json({ error: tokenData.error_description || 'Failed to get access token' })
        }

        // 2. Fetch user info to confirm
        const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        const user = await userRes.json()

        // 3. Redirect back to app with token
        const returnTo = typeof state === 'string' && state.startsWith('/') ? state : '/repos'
        const redirectUrl = `${returnTo}?github_token=${encodeURIComponent(accessToken)}&github_user=${encodeURIComponent(user.login || '')}`

        return res.redirect(redirectUrl)
    } catch (err: any) {
        console.error('[auth/github] OAuth error:', err)
        return res.status(500).json({ error: err.message || 'OAuth failed' })
    }
}