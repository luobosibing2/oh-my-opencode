import type { OhMyOpenCodeConfig } from "../config"

export type ModelReference = {
  providerID: string
  modelID: string
}

export type AutoModelAgentRoutingSettings = {
  providerID: string
  modelID: string
}

export const AUTOMODEL_AGENT_ROUTE_HEADER = "x-omoc-agent-route"
export const AUTOMODEL_PLAN_ROUTE_VALUE = "plan"
export const AUTOMODEL_EXECUTE_ROUTE_VALUE = "execute"

const DEFAULT_PROVIDER_ID = "automodel"
const DEFAULT_MODEL_ID = "AutoModel"
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

export function getAutoModelAgentRoutingSettings(
  pluginConfig: OhMyOpenCodeConfig | undefined,
): AutoModelAgentRoutingSettings | null {
  const config = pluginConfig?.automodel_agent_routing
  if (!config?.enabled) return null

  return {
    providerID: nonEmptyString(config.provider_id) ?? DEFAULT_PROVIDER_ID,
    modelID: nonEmptyString(config.model_id) ?? DEFAULT_MODEL_ID,
  }
}

export function isAutoModel(
  settings: AutoModelAgentRoutingSettings | null,
  model: ModelReference | undefined,
): boolean {
  if (!settings || !model) return false
  return model.providerID === settings.providerID && model.modelID === settings.modelID
}
