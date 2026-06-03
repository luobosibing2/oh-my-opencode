import type { OhMyOpenCodeConfig } from "../config"

export type ModelReference = {
  providerID: string
  modelID: string
}

export type PlanOnlyModelRoutingSettings = {
  providerID: string
  modelID: string
  gatewayBaseURL: string
  fakeApiKey: string
  fallbackModel: ModelReference
}

export const PLAN_ONLY_ROUTE_HEADER = "x-omoc-plan-route"
export const PLAN_ONLY_ROUTE_HEADER_VALUE = "1"

const DEFAULT_PROVIDER_ID = "plan-only"
const DEFAULT_MODEL_ID = "glm-5.1"
const DEFAULT_GATEWAY_BASE_URL = "https://www.micuapi.ai"
const DEFAULT_FAKE_API_KEY = "sk-omoc-plan-only-fake"
const DEFAULT_FALLBACK_PROVIDER_ID = "micuapi"
const DEFAULT_FALLBACK_MODEL = "micuapi/deepseek-v4-pro"
const PLAN_AGENT_ALIASES = new Set(["plan", "prometheus - plan builder"])

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

export function isPlanAgent(agent: string | undefined): boolean {
  const normalizedAgent = nonEmptyString(agent)?.toLowerCase()
  return normalizedAgent !== undefined && PLAN_AGENT_ALIASES.has(normalizedAgent)
}

export function parseModelReference(model: string | undefined): ModelReference | undefined {
  const trimmed = nonEmptyString(model)
  if (!trimmed) return undefined

  const separatorIndex = trimmed.indexOf("/")
  if (separatorIndex > 0 && separatorIndex < trimmed.length - 1) {
    return {
      providerID: trimmed.slice(0, separatorIndex),
      modelID: trimmed.slice(separatorIndex + 1),
    }
  }

  return {
    providerID: DEFAULT_FALLBACK_PROVIDER_ID,
    modelID: trimmed,
  }
}

export function getPlanOnlyModelRoutingSettings(
  pluginConfig: OhMyOpenCodeConfig | undefined,
): PlanOnlyModelRoutingSettings | null {
  const config = pluginConfig?.plan_only_model_routing
  if (!config?.enabled) return null

  return {
    providerID: nonEmptyString(config.provider_id) ?? DEFAULT_PROVIDER_ID,
    modelID: nonEmptyString(config.model_id) ?? DEFAULT_MODEL_ID,
    gatewayBaseURL: nonEmptyString(config.gateway_base_url) ?? DEFAULT_GATEWAY_BASE_URL,
    fakeApiKey: nonEmptyString(config.fake_api_key) ?? DEFAULT_FAKE_API_KEY,
    fallbackModel:
      parseModelReference(nonEmptyString(config.fallback_model) ?? DEFAULT_FALLBACK_MODEL) ??
      parseModelReference(DEFAULT_FALLBACK_MODEL)!,
  }
}

export function getPlanOnlyModelReference(
  settings: PlanOnlyModelRoutingSettings,
): ModelReference {
  return {
    providerID: settings.providerID,
    modelID: settings.modelID,
  }
}

export function isPlanOnlyModel(
  settings: PlanOnlyModelRoutingSettings | null,
  model: ModelReference | undefined,
): boolean {
  if (!settings || !model) return false
  return model.providerID === settings.providerID && model.modelID === settings.modelID
}

export function isPlanOnlyModelForConfig(
  pluginConfig: OhMyOpenCodeConfig | undefined,
  model: ModelReference | undefined,
): boolean {
  return isPlanOnlyModel(getPlanOnlyModelRoutingSettings(pluginConfig), model)
}
