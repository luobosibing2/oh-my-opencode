import type { OhMyOpenCodeConfig } from "../config"
import { OMO_INTERNAL_INITIATOR_MARKER } from "../shared"
import {
  AUTOMODEL_AGENT_ROUTE_HEADER,
  AUTOMODEL_EXECUTE_ROUTE_VALUE,
  AUTOMODEL_PLAN_ROUTE_VALUE,
  getAutoModelAgentRoutingSettings,
  isAutoModel,
  isPlanAgent,
} from "../shared/automodel-agent-routing"
import type { PluginContext } from "./types"

type ChatHeadersInput = {
  sessionID: string
  agent?: string
  provider: { id: string }
  model?: {
    providerID: string
    modelID: string
  }
  message: {
    id?: string
    role?: string
  }
}

type ChatHeadersOutput = {
  headers: Record<string, string>
}

const INTERNAL_MARKER_CACHE_LIMIT = 1000
const internalMarkerCache = new Map<string, boolean>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function buildChatHeadersInput(raw: unknown): ChatHeadersInput | null {
  if (!isRecord(raw)) return null

  const sessionID = raw.sessionID
  const agent = raw.agent
  const provider = raw.provider
  const model = raw.model
  const message = raw.message

  if (typeof sessionID !== "string") return null
  if (!isRecord(provider) || typeof provider.id !== "string") return null
  if (!isRecord(message)) return null

  let normalizedModel: ChatHeadersInput["model"] | undefined
  if (isRecord(model)) {
    const providerID = typeof model.providerID === "string" ? model.providerID : provider.id
    const modelID =
      typeof model.modelID === "string"
        ? model.modelID
        : typeof model.id === "string"
          ? model.id
          : undefined
    if (providerID && modelID) {
      normalizedModel = { providerID, modelID }
    }
  }

  return {
    sessionID,
    agent: typeof agent === "string" ? agent : undefined,
    provider: { id: provider.id },
    model: normalizedModel,
    message: {
      id: typeof message.id === "string" ? message.id : undefined,
      role: typeof message.role === "string" ? message.role : undefined,
    },
  }
}

function isChatHeadersOutput(raw: unknown): raw is ChatHeadersOutput {
  if (!isRecord(raw)) return false
  if (!isRecord(raw.headers)) {
    raw.headers = {}
  }
  return isRecord(raw.headers)
}

function isCopilotProvider(providerID: string): boolean {
  return providerID === "github-copilot" || providerID === "github-copilot-enterprise"
}

async function hasInternalMarker(
  client: PluginContext["client"],
  sessionID: string,
  messageID: string,
): Promise<boolean> {
  const cacheKey = `${sessionID}:${messageID}`
  const cached = internalMarkerCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    const response = await client.session.message({
      path: { id: sessionID, messageID },
    })

    const data = response.data
    if (!isRecord(data) || !Array.isArray(data.parts)) {
      internalMarkerCache.set(cacheKey, false)
      if (internalMarkerCache.size > INTERNAL_MARKER_CACHE_LIMIT) {
        internalMarkerCache.clear()
      }
      return false
    }

    const hasMarker = data.parts.some((part) => {
      if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
        return false
      }

      return part.text.includes(OMO_INTERNAL_INITIATOR_MARKER)
    })

    internalMarkerCache.set(cacheKey, hasMarker)
    if (internalMarkerCache.size > INTERNAL_MARKER_CACHE_LIMIT) {
      internalMarkerCache.clear()
    }

    return hasMarker
  } catch {
    internalMarkerCache.set(cacheKey, false)
    if (internalMarkerCache.size > INTERNAL_MARKER_CACHE_LIMIT) {
      internalMarkerCache.clear()
    }
    return false
  }
}

async function isOmoInternalMessage(input: ChatHeadersInput, client: PluginContext["client"]): Promise<boolean> {
  if (input.message.role !== "user") {
    return false
  }

  if (!input.message.id) {
    return false
  }

  return hasInternalMarker(client, input.sessionID, input.message.id)
}

export function createChatHeadersHandler(args: {
  ctx: PluginContext
  pluginConfig?: OhMyOpenCodeConfig
}): (input: unknown, output: unknown) => Promise<void> {
  const { ctx, pluginConfig } = args

  return async (input, output): Promise<void> => {
    const normalizedInput = buildChatHeadersInput(input)
    if (!normalizedInput) return
    if (!isChatHeadersOutput(output)) return

    const autoModelSettings = getAutoModelAgentRoutingSettings(pluginConfig)
    if (isAutoModel(autoModelSettings, normalizedInput.model)) {
      output.headers[AUTOMODEL_AGENT_ROUTE_HEADER] = isPlanAgent(normalizedInput.agent)
        ? AUTOMODEL_PLAN_ROUTE_VALUE
        : AUTOMODEL_EXECUTE_ROUTE_VALUE
    }

    if (!isCopilotProvider(normalizedInput.provider.id)) return

    // Do not override x-initiator when @ai-sdk/github-copilot is active.
    // OpenCode's copilot fetch wrapper already sets x-initiator based on
    // the actual request body content. Overriding it here causes a mismatch
    // that the Copilot API rejects with "invalid initiator".
    const model = isRecord(input) && isRecord((input as Record<string, unknown>).model)
      ? (input as Record<string, unknown>).model as Record<string, unknown>
      : undefined
    const api = model && isRecord(model.api) ? model.api as Record<string, unknown> : undefined
    if (api?.npm === "@ai-sdk/github-copilot") return

    if (!(await isOmoInternalMessage(normalizedInput, ctx.client))) return

    output.headers["x-initiator"] = "agent"
  }
}
