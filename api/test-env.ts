import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
    if (!privateKey) {
      return res.status(500).json({ error: 'GITHUB_APP_PRIVATE_KEY is not defined' })
    }

    const originalLength = privateKey.length
    const startsWithQuote = privateKey.startsWith('"')
    const endsWithQuote = privateKey.endsWith('"')

    let keyAfterReplace = privateKey.replace(/\\n/g, '\n')
    let keyAfterSlice = keyAfterReplace
    if (keyAfterSlice.startsWith('"')) {
      keyAfterSlice = keyAfterSlice.slice(1, -1)
    }

    const { createPrivateKey } = await import('node:crypto')
    let success = false
    let errMessage = ''
    let pkcs8pem = ''
    try {
      const keyObject = createPrivateKey({ key: keyAfterSlice, format: 'pem' })
      pkcs8pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string
      const { importPKCS8 } = await import('jose')
      await importPKCS8(pkcs8pem, 'RS256')
      success = true
    } catch (e: any) {
      errMessage = e.message
    }

    return res.status(200).json({
      originalLength,
      startsWithQuote,
      endsWithQuote,
      first50_orig: privateKey.substring(0, 50),
      last50_orig: privateKey.substring(privateKey.length - 50),
      first50_processed: keyAfterSlice.substring(0, 50),
      last50_processed: keyAfterSlice.substring(keyAfterSlice.length - 50),
      success,
      errMessage,
    })
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    })
  }
}
