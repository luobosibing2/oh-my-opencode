import { describe, expect, it } from "bun:test"
import { OhMyOpenCodeConfigSchema } from "./oh-my-opencode-config"

describe("OhMyOpenCodeConfigSchema team_mode", () => {
  it("accepts team_mode when provided", () => {
    // given
    const rawConfig = {
      team_mode: {
        enabled: true,
        max_parallel_members: 2,
      },
    }

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.team_mode).toMatchObject({
        enabled: true,
        max_parallel_members: 2,
      })
    }
  })

  it("allows team_mode omission", () => {
    // given
    const rawConfig = {}

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.team_mode).toBeUndefined()
    }
  })
})

describe("OhMyOpenCodeConfigSchema agent_order", () => {
  it("accepts string agent ordering when provided", () => {
    // given
    const rawConfig = {
      agent_order: ["hephaestus", "sisyphus", "prometheus", "atlas"],
    }

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agent_order).toEqual([
        "hephaestus",
        "sisyphus",
        "prometheus",
        "atlas",
      ])
    }
  })

  it("allows agent_order omission", () => {
    // given
    const rawConfig = {}

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agent_order).toBeUndefined()
    }
  })

  it("rejects abusive agent_order string length and item count", () => {
    // given
    const tooLongName = "x".repeat(129)
    const tooManyNames = Array.from({ length: 65 }, (_, index) => `agent-${index}`)

    // when
    const tooLongResult = OhMyOpenCodeConfigSchema.safeParse({
      agent_order: [tooLongName],
    })
    const tooManyResult = OhMyOpenCodeConfigSchema.safeParse({
      agent_order: tooManyNames,
    })

    // then
    expect(tooLongResult.success).toBe(false)
    expect(tooManyResult.success).toBe(false)
  })
})

describe("OhMyOpenCodeConfigSchema automodel_agent_routing", () => {
  it("accepts AutoModel agent routing settings when provided", () => {
    // given
    const rawConfig = {
      automodel_agent_routing: {
        enabled: true,
        provider_id: "automodel",
        model_id: "AutoModel",
        gateway_base_url: "https://www.micuapi.ai",
        fake_api_key: "sk-omoc-automodel-fake",
      },
    }

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.automodel_agent_routing).toEqual(rawConfig.automodel_agent_routing)
    }
  })

  it("allows automodel_agent_routing omission", () => {
    // given
    const rawConfig = {}

    // when
    const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig)

    // then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.automodel_agent_routing).toBeUndefined()
    }
  })
})
