import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const certificateFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship.pem')
const certificateKeyFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship-key.pem')
const localHttps = existsSync(certificateFile) && existsSync(certificateKeyFile)
  ? { cert: readFileSync(certificateFile), key: readFileSync(certificateKeyFile) }
  : undefined
const localDataDirectory = path.resolve(globalThis.process.cwd(), '.sola-data')
const songLibraryFile = path.join(localDataDirectory, 'songs.json')

const installLocalApi = (server) => {
  server.middlewares.use('/__sola/network-info', (_request, response) => {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ addresses, secure: Boolean(localHttps) }))
  })
  server.middlewares.use('/__sola/song-library', (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET') {
      try {
        response.end(existsSync(songLibraryFile) ? readFileSync(songLibraryFile, 'utf8') : '[]')
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error.message }))
      }
      return
    }
    if (request.method !== 'PUT') {
      response.statusCode = 405
      response.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 20 * 1024 * 1024) request.destroy()
    })
    request.on('end', () => {
      try {
        const songs = JSON.parse(body)
        if (!Array.isArray(songs)) throw new Error('Song library must be an array')
        mkdirSync(localDataDirectory, { recursive: true })
        const temporaryFile = `${songLibraryFile}.tmp`
        writeFileSync(temporaryFile, JSON.stringify(songs, null, 2), 'utf8')
        renameSync(temporaryFile, songLibraryFile)
        response.end(JSON.stringify({ saved: songs.length }))
      } catch (error) {
        response.statusCode = 400
        response.end(JSON.stringify({ error: error.message }))
      }
    })
  })
}

const lyricsProxy = {
  '/__sola/camera-signal': {
    target: `${localHttps ? 'wss' : 'ws'}://127.0.0.1:3001`,
    ws: true,
    secure: false,
    changeOrigin: true,
  },
  '/__sola/lyrics/lrclib': {
    target: 'https://lrclib.net',
    changeOrigin: true,
    headers: { 'Lrclib-Client': 'Sola Worship/0.0.0 (local worship presentation app)' },
    rewrite: (requestPath) => requestPath.replace(/^\/__sola\/lyrics\/lrclib/, ''),
  },
  '/__sola/lyrics/ovh': {
    target: 'https://api.lyrics.ovh',
    changeOrigin: true,
    rewrite: (requestPath) => requestPath.replace(/^\/__sola\/lyrics\/ovh/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    https: localHttps,
    proxy: lyricsProxy,
  },
  preview: {
    host: '0.0.0.0',
    https: localHttps,
    proxy: lyricsProxy,
  },
  plugins: [
    react(),
    {
      name: 'sola-camera-signaling',
      configureServer(server) {
        import('./camera-signaling-server.js').catch((error) => {
          console.warn(`Camera signaling server could not start: ${error.message}`)
        })
        if (localHttps) {
          import('./certificate-bootstrap-server.js').catch((error) => {
            console.warn(`Certificate bootstrap server could not start: ${error.message}`)
          })
        }
        installLocalApi(server)
      },
      configurePreviewServer(server) {
        import('./camera-signaling-server.js').catch((error) => {
          console.warn(`Camera signaling server could not start: ${error.message}`)
        })
        if (localHttps) {
          import('./certificate-bootstrap-server.js').catch((error) => {
            console.warn(`Certificate bootstrap server could not start: ${error.message}`)
          })
        }
        installLocalApi(server)
      },
    },
  ],
})
