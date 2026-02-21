import { prisma } from '../lib/db'
import { runReliabilityAlertCycle } from '../lib/reliability-alerts'

function readNumberArg(name: string): number | undefined {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))
  if (!raw) return undefined

  const value = Number(raw.slice(prefix.length))
  if (!Number.isFinite(value)) return undefined
  return value
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const windowMinutes = readNumberArg('window-minutes') ?? Number(process.env.OPS_ALERT_WINDOW_MINUTES)
  const baselineDays = readNumberArg('baseline-days') ?? Number(process.env.OPS_ALERT_BASELINE_DAYS)
  const repeatMinutes = readNumberArg('repeat-minutes') ?? Number(process.env.OPS_ALERT_REPEAT_MINUTES)
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL
  const runbookBaseUrl = process.env.OPS_RUNBOOK_BASE_URL
  const dryRun = hasFlag('dry-run')

  const result = await runReliabilityAlertCycle({
    windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : undefined,
    baselineDays: Number.isFinite(baselineDays) ? baselineDays : undefined,
    repeatMinutes: Number.isFinite(repeatMinutes) ? repeatMinutes : undefined,
    webhookUrl,
    runbookBaseUrl,
    dryRun,
  })

  console.log(
    JSON.stringify(
      {
        generatedAt: result.evaluation.generatedAt,
        dryRun: result.dryRun,
        windowMinutes: result.evaluation.windowMinutes,
        baselineDays: result.evaluation.baselineDays,
        triggered: result.triggered.map((rule) => rule.alertKey),
        resolved: result.resolved.map((rule) => rule.alertKey),
        notificationsSent: result.notificationsSent,
        rules: result.evaluation.rules,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error('Failed to run reliability alert cycle:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
