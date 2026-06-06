import { z } from "zod"

export const AutoModelAgentRoutingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider_id: z.string().trim().min(1).optional(),
  model_id: z.string().trim().min(1).optional(),
  gateway_base_url: z.string().url().optional(),
  fake_api_key: z.string().trim().min(1).optional(),
})

export type AutoModelAgentRoutingConfig = z.infer<typeof AutoModelAgentRoutingConfigSchema>
