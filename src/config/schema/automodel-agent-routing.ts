import { z } from "zod"

export const AutoModelAgentRoutingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider_id: z.string().trim().min(1).optional(),
  model_id: z.string().trim().min(1).optional(),
}).strict()

export type AutoModelAgentRoutingConfig = z.infer<typeof AutoModelAgentRoutingConfigSchema>
