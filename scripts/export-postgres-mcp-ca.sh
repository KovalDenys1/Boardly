#!/usr/bin/env bash
set -euo pipefail

output_relative_path="${1:-.codex-local/certs/postgres-mcp-ca.pem}"
env_file_name="${2:-.env}"

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "node" "Install Node.js and ensure it is available in your PATH."
require_env_var "DATABASE_URL" "DATABASE_URL is not set in .env/.env.local."

env_file_path="${workspace_dir}/${env_file_name}"
if [[ ! -f "$env_file_path" ]]; then
  echo "Env file not found: ${env_file_path}" >&2
  exit 1
fi

node - "$workspace_dir" "$output_relative_path" "$env_file_name" <<'NODE'
const fs = require('fs')
const net = require('net')
const path = require('path')
const tls = require('tls')
const { URL } = require('url')
const { createHash } = require('crypto')

const [workspaceDir, outputRelativePath, envFileName] = process.argv.slice(2)
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in .env/.env.local.')
}

const endpoint = new URL(databaseUrl)
const host = endpoint.hostname
const port = endpoint.port ? Number.parseInt(endpoint.port, 10) : 5432

function toPem(raw) {
  const body = raw.toString('base64').match(/.{1,64}/g)?.join('\n') ?? ''
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`
}

function setOrAddEnvVar(filePath, name, value) {
  const line = `${name}=${value}`
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escaped}\\s*=.*$`, 'm')
  let content = fs.readFileSync(filePath, 'utf8')

  if (pattern.test(content)) {
    content = content.replace(pattern, line)
  } else {
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n'
    }
    content += `${line}\n`
  }

  fs.writeFileSync(filePath, content)
}

function collectChain(peerCertificate) {
  const result = []
  const seen = new Set()
  let current = peerCertificate

  while (current && current.raw) {
    const fingerprint = current.fingerprint256 || createHash('sha256').update(current.raw).digest('hex')
    if (seen.has(fingerprint)) {
      break
    }

    seen.add(fingerprint)
    result.push(current)

    if (!current.issuerCertificate || current.issuerCertificate === current) {
      break
    }

    current = current.issuerCertificate
  }

  return result
}

function connectRaw(hostname, portNumber) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: hostname, port: portNumber })

    const onError = (error) => {
      cleanup()
      reject(error)
    }

    const onConnect = () => {
      cleanup()
      resolve(socket)
    }

    const cleanup = () => {
      socket.off('error', onError)
      socket.off('connect', onConnect)
      socket.off('timeout', onTimeout)
    }

    const onTimeout = () => {
      cleanup()
      socket.destroy()
      reject(new Error('Timed out while connecting to Postgres server.'))
    }

    socket.setTimeout(10_000)
    socket.once('error', onError)
    socket.once('connect', onConnect)
    socket.once('timeout', onTimeout)
  })
}

function readSingleByte(socket) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      cleanup()
      resolve(chunk[0])
    }

    const onError = (error) => {
      cleanup()
      reject(error)
    }

    const onTimeout = () => {
      cleanup()
      reject(new Error('Timed out while waiting for Postgres SSL negotiation response.'))
    }

    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('timeout', onTimeout)
    }

    socket.once('data', onData)
    socket.once('error', onError)
    socket.once('timeout', onTimeout)
  })
}

function connectTls(socket, hostname) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket,
      rejectUnauthorized: false,
      servername: hostname,
    })

    const onError = (error) => {
      cleanup()
      tlsSocket.destroy()
      reject(error)
    }

    const onSecureConnect = () => {
      cleanup()
      resolve(tlsSocket)
    }

    const onTimeout = () => {
      cleanup()
      tlsSocket.destroy()
      reject(new Error('Timed out while negotiating Postgres TLS session.'))
    }

    const cleanup = () => {
      tlsSocket.off('error', onError)
      tlsSocket.off('secureConnect', onSecureConnect)
      tlsSocket.off('timeout', onTimeout)
    }

    tlsSocket.setTimeout(10_000)
    tlsSocket.once('error', onError)
    tlsSocket.once('secureConnect', onSecureConnect)
    tlsSocket.once('timeout', onTimeout)
  })
}

async function main() {
  const socket = await connectRaw(host, port)

  try {
    // PostgreSQL SSLRequest: length=8, code=80877103
    socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]))

    const response = await readSingleByte(socket)
    if (response !== 'S'.charCodeAt(0)) {
      throw new Error(`Postgres server rejected SSL negotiation (response '${String.fromCharCode(response)}').`)
    }

    const tlsSocket = await connectTls(socket, host)
    try {
      const peerCertificate = tlsSocket.getPeerCertificate(true)
      if (!peerCertificate || !peerCertificate.raw) {
        throw new Error('Could not capture remote TLS certificate from Postgres connection.')
      }

      const chain = collectChain(peerCertificate)
      const caCertificates = (chain.length > 1 ? chain.slice(1) : chain).map((certificate) => certificate.raw)

      if (caCertificates.length === 0) {
        throw new Error('No CA certificates found in captured TLS chain.')
      }

      const outputPath = path.isAbsolute(outputRelativePath)
        ? outputRelativePath
        : path.join(workspaceDir, outputRelativePath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, `${caCertificates.map(toPem).join('\n')}\n`)

      const envFilePath = path.join(workspaceDir, envFileName)
      const relativeForEnv = path.isAbsolute(outputRelativePath)
        ? outputRelativePath
        : outputRelativePath.replace(/\\/g, '/')
      setOrAddEnvVar(envFilePath, 'MCP_POSTGRES_CA_CERT_PATH', relativeForEnv)

      console.log('Exporting Postgres MCP CA bundle')
      console.log(`Host: ${host}`)
      console.log(`Port: ${port}`)
      console.log('')
      console.log('CA bundle exported:')
      console.log(`  ${outputPath}`)
      console.log(`Included CA certificates: ${caCertificates.length}`)
      console.log('')
      console.log('Updated env file:')
      console.log(`  ${envFilePath}`)
      console.log(`  MCP_POSTGRES_CA_CERT_PATH=${relativeForEnv}`)
    } finally {
      tlsSocket.end()
      tlsSocket.destroy()
    }
  } finally {
    socket.end()
    socket.destroy()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
NODE
