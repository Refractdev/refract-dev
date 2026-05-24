import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const port = Number(process.env.PORT ?? 3000)

function buildQuery(searchParams) {
  const query = {}

  for (const [key, value] of searchParams.entries()) {
    if (key in query) {
      const current = query[key]
      query[key] = Array.isArray(current) ? [...current, value] : [current, value]
    } else {
      query[key] = value
    }
  }

  return query
}

async function readJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  const contentType = req.headers['content-type'] ?? ''

  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody)
  }

  return rawBody
}

function decorateResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode
    return res
  }

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(payload))
    return res
  }

  res.send = (payload) => {
    if (typeof payload === 'object' && payload !== null && !Buffer.isBuffer(payload)) {
      return res.json(payload)
    }

    if (!res.headersSent && typeof payload === 'string') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
    }

    res.end(payload)
    return res
  }

  res.redirect = (location) => {
    res.statusCode = res.statusCode >= 300 && res.statusCode < 400 ? res.statusCode : 302
    res.setHeader('Location', location)
    res.end()
    return res
  }

  return res
}

async function serveApi(vite, req, res, url) {
  const routePath = url.pathname.replace(/^\/api\//, '')
  const modulePath = `/api/${routePath}.ts`

  const handlerModule = await vite.ssrLoadModule(modulePath)
  const handler = handlerModule?.default

  if (typeof handler !== 'function') {
    res.statusCode = 404
    res.end(`No API handler for ${url.pathname}`)
    return
  }

  req.query = buildQuery(url.searchParams)
  req.body = await readJsonBody(req)

  await handler(req, decorateResponse(res))
}

async function serveSpaIndex(vite, req, res, url) {
  const template = await readFile(path.resolve(root, 'index.html'), 'utf8')
  const html = await vite.transformIndexHtml(url.pathname, template)
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

const vite = await createViteServer({
  root,
  appType: 'custom',
  server: {
    middlewareMode: true,
    port,
  },
})

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`)

  try {
    if (url.pathname.startsWith('/api/')) {
      await serveApi(vite, req, res, url)
      return
    }

    vite.middlewares(req, res, async () => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        await serveSpaIndex(vite, req, res, url)
        return
      }

      res.statusCode = 404
      res.end('Not found')
    })
  } catch (error) {
    vite.ssrFixStacktrace(error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(error instanceof Error ? error.stack ?? error.message : String(error))
  }
})

server.listen(port, () => {
  console.log(`Refract dev server ready at http://localhost:${port}`)
})

const shutdown = async () => {
  await vite.close()
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
