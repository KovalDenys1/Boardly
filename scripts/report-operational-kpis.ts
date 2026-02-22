import { writeFileSync } from 'node:fs'
import { prisma } from '../lib/db'
import { getOperationalKpiDashboard } from '../lib/operational-metrics'

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatValue(value: number | null, unit: 'ms' | 'percent'): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return unit === 'ms' ? `${value.toFixed(1)}ms` : `${value.toFixed(2)}%`
}

async function main() {
  const hours = parseNumber(readArg('hours') || process.env.OPS_REPORT_HOURS)
  const baselineDays = parseNumber(readArg('baseline-days') || process.env.OPS_REPORT_BASELINE_DAYS)
  const outPath = readArg('out')
  const jsonOnly = process.argv.includes('--json')

  const dashboard = await getOperationalKpiDashboard(hours, baselineDays)

  if (!jsonOnly) {
    console.log(
      `Operational KPI report | generatedAt=${dashboard.generatedAt} | rangeHours=${dashboard.rangeHours} | baselineDays=${dashboard.baselineDays}`
    )
    console.log(
      `Reconnect success=${formatValue(dashboard.reconnect.successRatioPct.value, 'percent')} (baseline=${formatValue(dashboard.reconnect.successRatioPct.baseline, 'percent')}, target=${dashboard.reconnect.successRatioPct.target.toFixed(2)}%)`
    )
    console.log(
      `Reconnect recovery p95=${formatValue(dashboard.reconnect.recoveryP95Ms.value, 'ms')} (baseline=${formatValue(dashboard.reconnect.recoveryP95Ms.baseline, 'ms')}, target=${dashboard.reconnect.recoveryP95Ms.target.toFixed(1)}ms)`
    )
    console.log('')
    for (const game of dashboard.games) {
      console.log(
        `${game.gameType}: move_p95=${formatValue(game.moveSubmitAppliedP95Ms.value, 'ms')} (samples=${game.moveSubmitAppliedP95Ms.samples}), lobby_ready_p95=${formatValue(game.createLobbyReadyP95Ms.value, 'ms')} (samples=${game.createLobbyReadyP95Ms.samples}), start_alone_auto_bot=${formatValue(game.startAloneAutoBotSuccessRatioPct.value, 'percent')} (samples=${game.startAloneAutoBotSuccessRatioPct.samples})`
      )
    }
    console.log('')
  }

  const output = JSON.stringify(dashboard, null, 2)
  console.log(output)

  if (outPath) {
    writeFileSync(outPath, output)
    console.log(`Report written to ${outPath}`)
  }
}

main()
  .catch((error) => {
    console.error('Failed to build operational KPI report:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
