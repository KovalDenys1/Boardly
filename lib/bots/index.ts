/**
 * Bot system exports - convenience imports
 */

// Core exports
export { BaseBot } from './core/base-bot'
export { UniversalBotExecutor } from './core/bot-executor'
export { createBot, hasBotSupport, getAvailableDifficulties, type GameType } from './core/bot-factory'
export type {
    BaseBotActionEvent,
    BaseBotDecision,
    BotDifficulty,
    BotConfig,
    BotActionCallback,
    MoveCallback,
} from './core/bot-types'
export { isBot, getBotDifficulty, getBotType, botSupportsGame } from './core/bot-helpers'

// Yahtzee exports
export { YahtzeeBot, type YahtzeeBotDecision } from './yahtzee/yahtzee-bot'
export { YahtzeeBotExecutor, type YahtzeeBotActionEvent } from './yahtzee/yahtzee-bot-executor'
export { YahtzeeBotAI, type BotDecision as YahtzeeBotAIDecision } from './yahtzee/yahtzee-bot-ai'
