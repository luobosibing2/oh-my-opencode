import { z } from "zod"

export const PlanOnlyModelRoutingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider_id: z.string().trim().min(1).optional(),
  model_id: z.string().trim().min(1).optional(),
  gateway_base_url: z.string().url().optional(),
  fake_api_key: z.string().trim().min(1).optional(),
  fallback_model: z.string().trim().min(1).optional(),
})

export type PlanOnlyModelRoutingConfig = z.infer<typeof PlanOnlyModelRoutingConfigSchema>
