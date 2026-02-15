import { z } from 'zod'

const joinLobbyCodeSchema = z.string().trim().min(1).max(20)

const gameActionInputSchema = z
  .object({
    lobbyCode: z.string(),
    action: z.unknown().optional(),
    payload: z.unknown().optional(),
  })
  .passthrough()

const sendChatMessageInputSchema = z
  .object({
    lobbyCode: z.string(),
    message: z.string(),
    userId: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough()

const playerTypingInputSchema = z
  .object({
    lobbyCode: z.string(),
    userId: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough()

export interface ParsedGameActionInput {
  lobbyCode: string
  action: unknown
  payload: unknown
}

export interface ParsedSendChatMessageInput {
  lobbyCode: string
  message: string
  userId?: string
  username?: string
}

export interface ParsedPlayerTypingInput {
  lobbyCode: string
  userId?: string
  username?: string
}

export function parseJoinLobbyCode(value: unknown): string | null {
  const parsed = joinLobbyCodeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseGameActionInput(value: unknown): ParsedGameActionInput | null {
  const parsed = gameActionInputSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }

  return {
    lobbyCode: parsed.data.lobbyCode,
    action: parsed.data.action,
    payload: parsed.data.payload,
  }
}

export function parseSendChatMessageInput(value: unknown): ParsedSendChatMessageInput | null {
  const parsed = sendChatMessageInputSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }

  return parsed.data
}

export function parsePlayerTypingInput(value: unknown): ParsedPlayerTypingInput | null {
  const parsed = playerTypingInputSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }

  return parsed.data
}
