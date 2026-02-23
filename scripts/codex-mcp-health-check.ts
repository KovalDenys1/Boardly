#!/usr/bin/env tsx

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  assertCommand,
  assertFileExists,
  expectedMcpEntries,
  mcpScriptPath,
  mcpShellCommandForScript,
  normalizeText,
  printStep,
  resolveScriptPath,
  runChecked,
  runSync,
  sleep,
  workspaceDir,
} from './codex-mcp-common'

type HealthCheckOptions = {
  startupTimeoutSeconds: number
  help: boolean
}

type LivenessResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): HealthCheckOptions {
  const options: HealthCheckOptions = {
    startupTimeoutSeconds: 3,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--help' || arg === '-h' || arg === '/?') {
      options.help = true
      continue
    }

    if (arg === '--startup-timeout-seconds' || arg === '-StartupTimeoutSeconds') {
      const raw = argv[i + 1]
      if (!raw) {
        throw new Error(`Missing value for ${arg}`)
      }
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid timeout value: ${raw}`)
      }
      options.startupTimeoutSeconds = parsed
      i += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printUsage() {
  console.log('Boardly MCP Health Check')
  console.log('')
  console.log('Usage:')
  console.log('  node --import tsx scripts/codex-mcp-health-check.ts [--startup-timeout-seconds N]')
  console.log('')
  console.log('Options:')
  console.log('  --startup-timeout-seconds, -StartupTimeoutSeconds   Liveness wait time (default: 3)')
}

function assertCodexMcpEntry(name: string) {
  const result = runSync('codex', ['mcp', 'get', name, '--json'], { stdio: 'ignore' })
  if (result.status !== 0) {
    throw new Error(`Missing Codex MCP entry: ${name}`)
  }
}

async function terminateChild(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) {
    return
  }

  try {
    child.kill()
  } catch {
    return
  }

  await sleep(200)

  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
}

async function runLivenessCheck(name: string, scriptPath: string, timeoutSeconds: number) {
  printStep(`Liveness: ${name}`)

  const { command, args } = mcpShellCommandForScript(scriptPath)
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  let exited = false
  let spawnError: Error | null = null

  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout += chunk
  })

  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
  })

  const exitPromise = new Promise<LivenessResult>((resolve, reject) => {
    child.once('error', (err) => {
      spawnError = err
      reject(err)
    })
    child.on('exit', () => {
      exited = true
    })
    child.on('close', (code) => {
      exited = true
      resolve({
        exitCode: code,
        stdout: normalizeText(stdout),
        stderr: normalizeText(stderr),
      })
    })
  })

  await sleep(Math.max(500, timeoutSeconds * 1000))

  if (spawnError) {
    throw spawnError
  }

  if (!exited && child.exitCode === null) {
    console.log('    OK (process is running on stdio)')
    await terminateChild(child)
    await exitPromise.catch(() => undefined)
    return
  }

  const result = await exitPromise
  const combinedOutput = `${result.stdout}\n${result.stderr}`

  if (/running on stdio/i.test(combinedOutput)) {
    console.log('    OK (startup banner detected; stdio server exited after stdin closed)')
    if (result.stdout) {
      console.log(`    stdout: ${result.stdout}`)
    }
    if (result.stderr) {
      console.log(`    stderr: ${result.stderr}`)
    }
    return
  }

  if ((result.exitCode === 0 || result.exitCode === null) && !result.stderr) {
    if (result.stdout) {
      console.log('    OK (started and exited cleanly; stdin likely closed)')
      console.log(`    stdout: ${result.stdout}`)
    } else {
      console.log('    OK (exited cleanly; stdio server likely stopped after stdin closed)')
    }
    return
  }

  console.log(`    FAIL (exited with code ${String(result.exitCode)} before timeout)`)
  if (result.stdout) {
    console.log(`    stdout: ${result.stdout}`)
  }
  if (result.stderr) {
    console.log(`    stderr: ${result.stderr}`)
  }

  throw new Error(`MCP liveness check failed for ${name}`)
}

function invokePostgresDriverSmoke() {
  const smokeScript = mcpScriptPath('test-mcp-postgres-driver')
  assertFileExists(smokeScript, 'Missing Postgres driver smoke script')

  printStep('Postgres driver smoke (same pg stack as MCP server)')
  const { command, args } = mcpShellCommandForScript(smokeScript)
  runChecked(command, args, { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log('    OK')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printUsage()
    return
  }

  assertCommand('codex', 'Install Codex CLI and ensure it is available in your PATH.')
  assertCommand(
    process.platform === 'win32' ? 'powershell' : 'bash',
    process.platform === 'win32' ? 'Windows PowerShell is required.' : 'Bash is required.',
  )

  console.log('Boardly MCP Health Check')
  console.log(`Workspace: ${workspaceDir}`)

  printStep('Codex MCP list')
  runChecked('codex', ['mcp', 'list'], { stdio: 'inherit' })

  printStep('Codex MCP registrations')
  for (const entry of expectedMcpEntries) {
    assertCodexMcpEntry(entry)
    console.log(`    OK ${entry}`)
  }

  await runLivenessCheck('boardly-github', mcpScriptPath('mcp-github'), options.startupTimeoutSeconds)
  await runLivenessCheck('boardly-postgres', mcpScriptPath('mcp-postgres'), options.startupTimeoutSeconds)
  await runLivenessCheck('boardly-filesystem', mcpScriptPath('mcp-filesystem'), options.startupTimeoutSeconds)
  await runLivenessCheck('boardly-memory', mcpScriptPath('mcp-memory'), options.startupTimeoutSeconds)

  invokePostgresDriverSmoke()

  const memoryFilePath = resolveScriptPath('.codex-local/memory/boardly-memory.jsonl')
  printStep('Memory file path')
  if (!existsSync(memoryFilePath)) {
    throw new Error(`Memory file not found: ${memoryFilePath}`)
  }
  console.log(`    OK ${memoryFilePath}`)

  console.log('')
  console.log('Health check completed (registrations + liveness + Postgres TLS/query smoke).')
  console.log('Tip: If a live Codex session still shows old Postgres TLS errors, restart the session to reload the MCP process.')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  if (process.env.DEBUG) {
    console.error(error)
  }
  process.exit(1)
})
