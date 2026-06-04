import { describe, expect, test } from "bun:test"

import { OMO_INTERNAL_INITIATOR_MARKER } from "../shared"
import { createChatHeadersHandler } from "./chat-headers"

function createPlanOnlyRoutingConfig(): Record<string, unknown> {
  return {
    plan_only_model_routing: {
      enabled: true,
      provider_id: "plan-only",
      model_id: "glm-5.1",
      gateway_base_url: "https://www.micuapi.ai",
      fake_api_key: "sk-omoc-plan-only-fake",
      fallback_model: "micuapi/deepseek-v4-flash",
    },
  }
}

function createSilentContext() {
  return {
    client: {
      session: {
        message: async () => ({ data: { parts: [] } }),
      },
    },
  } as never
}

describe("createChatHeadersHandler", () => {
  test("sets x-initiator=agent for Copilot internal marker messages", async () => {
    const handler = createChatHeadersHandler({
      ctx: {
        client: {
          session: {
            message: async () => ({
              data: {
                parts: [
                  {
                    type: "text",
                    text: `notification\n${OMO_INTERNAL_INITIATOR_MARKER}`,
                  },
                ],
              },
            }),
          },
        },
      } as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_1",
        provider: { id: "github-copilot" },
        message: {
          id: "msg_1",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-initiator"]).toBe("agent")
  })

  test("does not override non-copilot providers", async () => {
    const handler = createChatHeadersHandler({
      ctx: {
        client: {
          session: {
            message: async () => ({
              data: {
                parts: [
                  {
                    type: "text",
                    text: `notification\n${OMO_INTERNAL_INITIATOR_MARKER}`,
                  },
                ],
              },
            }),
          },
        },
      } as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_1",
        provider: { id: "openai" },
        message: {
          id: "msg_2",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-initiator"]).toBeUndefined()
  })

  test("does not override regular user messages", async () => {
    const handler = createChatHeadersHandler({
      ctx: {
        client: {
          session: {
            message: async () => ({
              data: {
                parts: [{ type: "text", text: "normal user message" }],
              },
            }),
          },
        },
      } as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_3",
        provider: { id: "github-copilot" },
        message: {
          id: "msg_3",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-initiator"]).toBeUndefined()
  })

  test("skips x-initiator override when model uses @ai-sdk/github-copilot", async () => {
    const handler = createChatHeadersHandler({
      ctx: {
        client: {
          session: {
            message: async () => ({
              data: {
                parts: [
                  {
                    type: "text",
                    text: `notification\n${OMO_INTERNAL_INITIATOR_MARKER}`,
                  },
                ],
              },
            }),
          },
        },
      } as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_4",
        provider: { id: "github-copilot" },
        model: { api: { npm: "@ai-sdk/github-copilot" } },
        message: {
          id: "msg_4",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-initiator"]).toBeUndefined()
  })

  test("adds Plan route header only for Plan agent using the Plan-only model", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_plan",
        agent: "plan",
        provider: { id: "plan-only" },
        model: { providerID: "plan-only", id: "glm-5.1" },
        message: {
          id: "msg_plan",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-plan-route"]).toBe("1")
  })

  test("adds Plan route header for the Web UI Prometheus Plan Builder agent", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_prometheus",
        agent: "Prometheus - Plan Builder",
        provider: { id: "plan-only" },
        model: { providerID: "plan-only", id: "glm-5.1" },
        message: {
          id: "msg_prometheus",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-plan-route"]).toBe("1")
  })

  test("does not add Plan route header for non-Plan agents using the Plan-only model", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_build",
        agent: "build",
        provider: { id: "plan-only" },
        model: { providerID: "plan-only", id: "glm-5.1" },
        message: {
          id: "msg_build",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-plan-route"]).toBeUndefined()
  })

  test("does not add Plan route header for ordinary models", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_normal",
        agent: "build",
        provider: { id: "micuapi" },
        model: { providerID: "micuapi", id: "deepseek-v4-flash" },
        message: {
          id: "msg_normal",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-plan-route"]).toBeUndefined()
  })
})
