#!/usr/bin/env tsx

import {
  assertCommand,
  assertFileExists,
  expectedMcpEntries,
  mcpScriptPath,
  mcpShellCommandForScript,
  resolveScriptPath,
  runChecked,
  runSync,
} from './codex-mcp-common'

type SetupOptions = {
  force: boolean
  help: boolean
}

function parseArgs(argv: string[]): SetupOptions {
  const options: SetupOptions = { force: false, help: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--force' || arg === '-f' || arg === '-Force') {
      options.force = true
      continue
    }

    if (arg === '--help' || arg === '-h' || arg === '/?') {
      options.help = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printUsage() {
  console.log('Boardly Codex MCP Setup')
  console.log('')
  console.log('Usage:')
  console.log('  node --import tsx scripts/codex-mcp-setup.ts [--force]')
  console.log('')
  console.log('Options:')
  console.log('  --force, -f, -Force   Replace existing MCP registrations')
}

function testMcpServerExists(name: string) {
  const result = runSync('codex', ['mcp', 'get', name, '--json'], { stdio: 'ignore' })
  return result.status === 0
}

function addOrUpdateMcpServer(name: string, commandArgs: string[], forceReplace: boolean) {
  const exists = testMcpServerExists(name)

  if (exists && !forceReplace) {
    console.log(`Skipping '${name}' (already configured).`)
    return
  }

  if (exists && forceReplace) {
    console.log(`Removing existing '${name}'...`)
    runChecked('codex', ['mcp', 'remove', name], { stdio: 'inherit' })
  }

  console.log(`Adding '${name}'...`)
  runChecked('codex', ['mcp', 'add', name, '--', ...commandArgs], { stdio: 'inherit' })
}

function main() {
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

  const scriptsByName = new Map<string, string>([
    ['boardly-github', mcpScriptPath('mcp-github')],
    ['boardly-postgres', mcpScriptPath('mcp-postgres')],
    ['boardly-filesystem', mcpScriptPath('mcp-filesystem')],
    ['boardly-memory', mcpScriptPath('mcp-memory')],
  ])

  for (const name of expectedMcpEntries) {
    const scriptPath = scriptsByName.get(name)
    if (!scriptPath) {
      throw new Error(`Missing script mapping for ${name}`)
    }
    assertFileExists(scriptPath, 'Missing script')
  }

  for (const name of expectedMcpEntries) {
    const scriptPath = scriptsByName.get(name)!
    const { command, args } = mcpShellCommandForScript(scriptPath)
    addOrUpdateMcpServer(name, [command, ...args], options.force)
  }

  console.log('')
  console.log('Configured MCP servers:')
  runChecked('codex', ['mcp', 'list'], { stdio: 'inherit' })

  console.log('')
  console.log('External MCP template (manual setup):')
  console.log(resolveScriptPath('docs/codex-mcp.external-template.toml'))
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  if (process.env.DEBUG) {
    console.error(error)
  }
  process.exit(1)
}
