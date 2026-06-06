# AutoModel Agent Routing

本文档记录 AutoModel agent 路由方案。目标是让 OpenCode UI 里只暴露一个 `automodel/AutoModel`，插件不再劫持模型名；Plan 和普通执行请求通过运行时 header 标记交给 gateway 侧路由。

## Requirements

1. OpenCode 配置、插件配置、仓库文件和 `/models` 输出里只出现 fake/default SK。
2. UI 只需要选择 `automodel/AutoModel`，不再暴露 `plan-only/glm-5.1`。
3. Plan agent 请求打 `x-omoc-agent-route: plan`。
4. 非 Plan agent 请求打 `x-omoc-agent-route: execute`。
5. 插件不写入 `Authorization: Bearer SK-plan` 或 `Authorization: Bearer SK-execute`；这两个路由 token 由 gateway 服务端内部持有。
6. gateway 转发上游前剥离 `x-omoc-agent-route`，并按 route marker 映射到内部 SK 和真实模型。

## Solution Thinking

核心思路是把“模型选择”和“真实模型路由”拆开：OpenCode 只负责选择一个稳定可见的 `AutoModel`，插件只负责把当前请求标记成 Plan 或 execute，gateway 才负责把这个标记映射到真实 SK 和真实上游模型。

旧方案依赖模型名劫持：Plan 时把当前消息改成 `plan-only/glm-5.1`，非 Plan 时再恢复普通模型。这能工作，但 UI 会看到额外模型，也需要处理 Plan 结束后的模型污染问题。新方案改成单模型后，UI 不再切换模型名，也不需要恢复逻辑；用户只需要始终选择 `AutoModel`，切换 agent 就能改变 gateway 的实际路由。

运行链路是：

```text
OpenCode UI selects automodel/AutoModel
  -> plugin marks the request as plan or execute
  -> gateway validates fake key + route marker + AutoModel body
  -> gateway maps the marker to an internal SK and upstream model
  -> gateway strips internal headers and forwards the rewritten request
```

Plan 请求和普通执行请求的差异只体现在内部 route marker 上：

| Request kind | Route marker | Gateway route |
| ------------ | ------------ | ------------- |
| Plan agent | `x-omoc-agent-route: plan` | internal Plan SK and Plan model |
| Non-Plan agent | `x-omoc-agent-route: execute` | internal execute SK and execute model |

这个 header 只是路由标记，不是安全凭证。强隔离依赖 gateway 服务端策略：只有 fake/default SK、`AutoModel` 请求体和合法 route marker 同时满足时，gateway 才会选择内部真实 SK；否则请求应被拒绝。

## Security Boundary

OpenCode、插件配置和仓库文件里不保存 `SK-plan`、`SK-execute` 或真实上游 SK。它们只存在于 gateway 服务端环境中。插件也不直接改写 `Authorization` 为这些内部 token，因为 OpenCode 的底层 provider/auth 可能覆盖普通 header，而且把路由 token 放到用户机器侧也不符合密钥隔离目标。

gateway 转发上游前需要做三件事：

1. 删除 `x-omoc-agent-route`，避免把内部路由标记传给上游。
2. 把 fake/default SK 替换成 gateway 内部选择的真实 SK。
3. 把请求体里的 `AutoModel` 改成真实上游模型名。

因此，上游只看到正常的 OpenAI-compatible 请求；用户机器侧只看到 `AutoModel` 和 fake/default SK。

## Verification Method

验证分成三层：

1. 配置验证：OpenCode 配置和 `/models` 只暴露 `automodel/AutoModel`，只出现 fake/default SK，不出现 `SK-plan`、`SK-execute` 或真实上游 SK。
2. hook 验证：Plan agent 的 `AutoModel` 请求会带 `x-omoc-agent-route: plan`；非 Plan agent 的 `AutoModel` 请求会带 `x-omoc-agent-route: execute`；普通非 AutoModel 请求不打这个 header。
3. gateway 验证：Plan marker 路由到 Plan 模型，execute marker 路由到 execute 模型；无 marker、非法 marker、fake/default SK 不匹配或 body model 不是 `AutoModel` 时返回 403。

本地 demo 验收可以直接看 gateway 日志。一次非 Plan 请求后应看到 `route=execute model=AutoModel upstreamModel=<execute model>`；一次 Plan 请求后应看到 `route=plan model=AutoModel upstreamModel=<plan model>`。如果没有 route marker，应看到 403 拒绝日志，而不是成功转发。

## Implemented Routing

AutoModel 路由由三段逻辑组成：

```text
config hook registers automodel/AutoModel with fake SK
  -> chat.headers marks plan|execute per request
  -> gateway maps marker to internal SK/model and strips marker before forwarding
```

### Configuration Schema

新增配置键 `automodel_agent_routing`，字段定义在 [`automodel-agent-routing.ts`](../../src/config/schema/automodel-agent-routing.ts#L3)。默认 provider 是 `automodel`，默认 model 是 `AutoModel`，默认 gateway 是 `https://www.micuapi.ai`，默认 fake key 是 `sk-omoc-automodel-fake`；这些默认值集中在 [`automodel-agent-routing.ts`](../../src/shared/automodel-agent-routing.ts#L19)。

示例：

```jsonc
{
  "automodel_agent_routing": {
    "enabled": true,
    "provider_id": "automodel",
    "model_id": "AutoModel",
    "gateway_base_url": "http://127.0.0.1:8787/v1",
    "fake_api_key": "sk-omoc-automodel-fake"
  }
}
```

`SK-plan`、`SK-execute` 和真实上游 SK 都只放在 gateway 服务端。插件侧只负责让 gateway 知道当前请求来自 Plan 还是普通执行。

### Provider Registration

`config` hook 会在 OpenCode 配置里注入 `automodel` provider，让 `/models` 只看到 `AutoModel`，provider options 里只写 fake SK。当前实现同时兼容新旧 provider 配置形态：

- 新 `providers` 结构：[`applyAutoModelProviderConfig`](../../src/plugin-handlers/automodel-provider-config-handler.ts#L49)
- 旧 `provider` 结构：[`applyAutoModelProviderConfig`](../../src/plugin-handlers/automodel-provider-config-handler.ts#L73)
- hook 接入位置：[`createConfigHandler`](../../src/plugin-handlers/config-handler.ts#L43)

### Message Routing

`chat.message` 不再做模型劫持。Plan agent、`Prometheus - Plan Builder` 和普通 Build agent 都保持用户选中的 `automodel/AutoModel`。模型状态记忆只记录当前模型，不再需要旧方案的污染恢复逻辑，见 [`rememberNormalSessionModel`](../../src/plugin/chat-message.ts#L116) 和 hook 调用顺序 [`chat-message.ts`](../../src/plugin/chat-message.ts#L349)。

`message.updated` 事件也不再跳过特定隔离模型；有真实 message model 时会正常同步 session model state，见 [`event.ts`](../../src/plugin/event.ts#L792)。

### Header Marking

`chat.headers` 只在配置启用且当前 model 是 `automodel/AutoModel` 时添加 `x-omoc-agent-route`。Plan alias 定义在 [`isPlanAgent`](../../src/shared/automodel-agent-routing.ts#L31)，header 判断和写入在 [`chat-headers.ts`](../../src/plugin/chat-headers.ts#L160)。

| Agent | Header |
| ----- | ------ |
| `plan` | `x-omoc-agent-route: plan` |
| `Prometheus - Plan Builder` | `x-omoc-agent-route: plan` |
| Build / other non-Plan agent | `x-omoc-agent-route: execute` |
| Non-AutoModel request | no agent route header |

这个 header 是路由标记，不是安全凭证。强隔离由 gateway 完成：gateway 校验 fake/default SK 和 route marker，然后在服务端内部选择 `SK-plan` 或 `SK-execute`；没有合法 marker 的请求应拒绝。

## Test Cases

单元测试覆盖以下行为：

| Case | Expected | Evidence |
| ---- | -------- | -------- |
| Plan + AutoModel | 不改写 message model | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L616) |
| Web UI `Prometheus - Plan Builder` + AutoModel | 不改写 message model | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L635) |
| 非 Plan + AutoModel | 不恢复到其它模型 | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L655) |
| Plan + AutoModel | 添加 `x-omoc-agent-route: plan` | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L169) |
| Web UI Plan alias + AutoModel | 添加 `x-omoc-agent-route: plan` | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L193) |
| 非 Plan + AutoModel | 添加 `x-omoc-agent-route: execute` | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L217) |
| 普通模型请求 | 不添加 route header | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L241) |
| `config` hook provider 注册 | `automodel/AutoModel` 可见且只含 fake SK | [`config-handler.test.ts`](../../src/plugin-handlers/config-handler.test.ts#L234) |
| 配置 schema | `automodel_agent_routing` 可解析 | [`oh-my-opencode-config.test.ts`](../../src/config/schema/oh-my-opencode-config.test.ts#L97) |

端到端验收：

1. UI 选择 `automodel/AutoModel`。
2. 切到 Plan alias 后，gateway 日志显示 `route=plan`，上游模型由 gateway 内部决定。
3. 切回 Build 后，gateway 日志显示 `route=execute`。
4. `/models` 不出现 `plan-only/glm-5.1`、`SK-plan` 或 `SK-execute`。
5. 无 marker、非法 marker 或 fake/default SK 不匹配时，gateway 返回 403。

## Demo Runtime

当前演示环境保持三个服务运行：

| Service | URL |
| ------- | --- |
| Gateway | `http://127.0.0.1:8787` |
| OpenCode backend | `http://127.0.0.1:4096` |
| OpenCode Web UI | `http://127.0.0.1:4444` |

演示时在图形化界面只选择 `AutoModel`。切换 agent 会改变 gateway 看到的 `x-omoc-agent-route`，不会改变 UI 里的模型名。
