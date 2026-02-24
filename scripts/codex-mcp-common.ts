#!/usr/bin/env tsx

import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const isWindows = process.platform === 'win32'
export const workspaceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const expectedMcpEntries = [
  'boardly-github',
  'boardly-postgres',
  'boardly-filesystem',
  'boardly-memory',
] as const

export type CommandSpec = {
  command: string
  args: string[]
}

export function formatCommand(command: string, args: string[] = []) {
  return [command, ...args].join(' ')
}

export function fail(message: string): never {
  throw new Error(message)
}

export function assertCommand(commandName: string, installHint: string) {
  const probeArgs =
    commandName === 'powershell'
      ? ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']
      : ['--version']

  const result = spawnSync(commandName, probeArgs, { stdio: 'ignore' })
  const error = result.error as NodeJS.ErrnoException | undefined
  if (error?.code === 'ENOENT') {
    fail(`'${commandName}' command not found. ${installHint}`)
  }
  if (error) {
    fail(`Failed to probe '${commandName}': ${error.message}`)
  }
}

export function runSync(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
) {
  return spawnSync(command, args, options)
}

export function runChecked(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
) {
  const result = runSync(command, args, options)
  const error = result.error as NodeJS.ErrnoException | undefined

  if (error?.code === 'ENOENT') {
    fail(`'${command}' command not found while running: ${formatCommand(command, args)}`)
  }

  if (error) {
    fail(`Failed to run '${formatCommand(command, args)}': ${error.message}`)
  }

  if (result.status !== 0) {
    const code = result.status ?? 1
    fail(`Command failed (${code}): ${formatCommand(command, args)}`)
  }

  return result
}

export function resolveScriptPath(relativePath: string) {
  return path.join(workspaceDir, relativePath)
}

export function assertFileExists(filePath: string, label = 'Missing file') {
  if (!existsSync(filePath)) {
    fail(`${label}: ${filePath}`)
  }
}

export function mcpShellCommandForScript(scriptPath: string): CommandSpec {
  return isWindows
    ? {
        command: 'powershell',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      }
    : {
        command: 'bash',
        args: [scriptPath],
      }
}

export function mcpScriptPath(baseName: string) {
  const ext = isWindows ? 'ps1' : 'sh'
  return resolveScriptPath(`scripts/${baseName}.${ext}`)
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function printStep(title: string) {
  console.log('')
  console.log(`==> ${title}`)
}

export function normalizeText(raw: string | undefined | null) {
  return (raw ?? '').replace(/\r/g, '').trim()
}
