import type { OhMyOpenCodeConfig } from "../config"
import { getPlanOnlyModelRoutingSettings } from "../shared/plan-only-model-routing"

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

export function applyPlanOnlyProviderConfig(params: {
  config: UnknownRecord
  pluginConfig: OhMyOpenCodeConfig
}): void {
  const settings = getPlanOnlyModelRoutingSettings(params.pluginConfig)
  if (!settings) return

  const providerName = "Plan-only Gateway"
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
  const existingModels = mergeRecord(existingProvider.models)
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
      ...existingModels,
      [settings.modelID]: {
        ...mergeRecord(existingModels[settings.modelID]),
        ...modelConfig,
      },
    },
  }

  const legacyProviders = ensureRecord(params.config, "provider")
  const existingLegacyProvider = mergeRecord(legacyProviders[settings.providerID])
  const existingLegacyOptions = mergeRecord(existingLegacyProvider.options)
  const existingLegacyModels = mergeRecord(existingLegacyProvider.models)
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
      ...existingLegacyModels,
      [settings.modelID]: {
        ...mergeRecord(existingLegacyModels[settings.modelID]),
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
