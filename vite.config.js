import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const certificateFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship.pem')
const certificateKeyFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship-key.pem')
const localHttps = existsSync(certificateFile) && existsSync(certificateKeyFile)
  ? { cert: readFileSync(certificateFile), key: readFileSync(certificateKeyFile) }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    https: localHttps,
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
        server.middlewares.use('/__sola/network-info', (_request, response) => {
          const addresses = Object.values(os.networkInterfaces())
            .flat()
            .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
            .map((entry) => entry.address)
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ addresses, secure: Boolean(localHttps) }))
        })
      },
    },
  ],
})
