import type { OhMyOpenCodeConfig } from "../config"
import { getAutoModelAgentRoutingSettings } from "../shared/automodel-agent-routing"

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function ensureRecord(config: UnknownRecord, key: string): UnknownRecord {
  const current = config[key]
  if (isRecord(current)) return current

  const created: UnknownRecord = {}
  config[key] = created
  return created
}

function mergeRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? { ...value } : {}
}

export function applyAutoModelProviderConfig(params: {
  config: UnknownRecord
  pluginConfig: OhMyOpenCodeConfig
}): void {
  const settings = getAutoModelAgentRoutingSettings(params.pluginConfig)
  if (!settings) return

  const providerName = "AutoModel Gateway"
  const endpoint = {
    type: "aisdk",
    package: "@ai-sdk/openai-compatible",
    url: settings.gatewayBaseURL,
  }
  const modelConfig = {
    name: settings.modelID,
    capabilities: {
      tools: true,
      input: ["text"],
      output: ["text"],
    },
    limit: {
      context: 128000,
      output: 8192,
    },
  }

  const providers = ensureRecord(params.config, "providers")
  const existingProvider = mergeRecord(providers[settings.providerID])
  const existingOptions = mergeRecord(existingProvider.options)
  const existingAisdkOptions = mergeRecord(existingOptions.aisdk)
  const existingAisdkProviderOptions = mergeRecord(existingAisdkOptions.provider)
  providers[settings.providerID] = {
    ...existingProvider,
    name: existingProvider.name ?? providerName,
    endpoint,
    options: {
      ...existingOptions,
      aisdk: {
        ...existingAisdkOptions,
        provider: {
          ...existingAisdkProviderOptions,
          apiKey: settings.fakeApiKey,
        },
      },
    },
    models: {
      [settings.modelID]: modelConfig,
    },
  }

  const legacyProviders = ensureRecord(params.config, "provider")
  const existingLegacyProvider = mergeRecord(legacyProviders[settings.providerID])
  const existingLegacyOptions = mergeRecord(existingLegacyProvider.options)
  legacyProviders[settings.providerID] = {
    ...existingLegacyProvider,
    name: existingLegacyProvider.name ?? providerName,
    npm: "@ai-sdk/openai-compatible",
    api: settings.gatewayBaseURL,
    options: {
      ...existingLegacyOptions,
      apiKey: settings.fakeApiKey,
    },
    models: {
      [settings.modelID]: {
        name: settings.modelID,
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        limit: {
          context: 128000,
          output: 8192,
        },
      },
    },
  }
}
