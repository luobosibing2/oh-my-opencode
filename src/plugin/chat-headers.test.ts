import { describe, expect, test } from "bun:test"

import { OMO_INTERNAL_INITIATOR_MARKER } from "../shared"
import { createChatHeadersHandler } from "./chat-headers"

function createPlanOnlyRoutingConfig(): Record<string, unknown> {
  return {
    automodel_agent_routing: {
      enabled: true,
      provider_id: "automodel",
      model_id: "AutoModel",
      gateway_base_url: "https://www.micuapi.ai",
      fake_api_key: "sk-omoc-automodel-fake",
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

  test("adds Plan agent route header for Plan agent using AutoModel", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_plan",
        agent: "plan",
        provider: { id: "automodel" },
        model: { providerID: "automodel", id: "AutoModel" },
        message: {
          id: "msg_plan",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-agent-route"]).toBe("plan")
  })

  test("adds Plan agent route header for the Web UI Prometheus Plan Builder agent", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_prometheus",
        agent: "Prometheus - Plan Builder",
        provider: { id: "automodel" },
        model: { providerID: "automodel", id: "AutoModel" },
        message: {
          id: "msg_prometheus",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-agent-route"]).toBe("plan")
  })

  test("adds execute agent route header for non-Plan agents using AutoModel", async () => {
    const handler = createChatHeadersHandler({
      ctx: createSilentContext(),
      pluginConfig: createPlanOnlyRoutingConfig() as never,
    })
    const output: { headers: Record<string, string> } = { headers: {} }

    await handler(
      {
        sessionID: "ses_build",
        agent: "build",
        provider: { id: "automodel" },
        model: { providerID: "automodel", id: "AutoModel" },
        message: {
          id: "msg_build",
          role: "user",
        },
      },
      output,
    )

    expect(output.headers["x-omoc-agent-route"]).toBe("execute")
  })

  test("does not add agent route header for ordinary models", async () => {
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

    expect(output.headers["x-omoc-agent-route"]).toBeUndefined()
  })
})
