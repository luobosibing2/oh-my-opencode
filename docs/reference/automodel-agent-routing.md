# AutoModel Agent Routing

本文档记录 AutoModel agent 路由方案。目标是让 OpenCode UI 里只暴露一个 `automodel/AutoModel`，插件不再劫持模型名；Plan 和普通执行请求通过运行时 header 标记交给 gateway 侧路由。

## Requirements

1. OpenCode 配置、插件配置、仓库文件和 `/models` 输出里只出现 fake/default SK。
2. UI 只需要选择 `automodel/AutoModel`，不再暴露 `plan-only/glm-5.1`。
3. Plan agent 请求打 `x-omoc-agent-route: plan`。
4. 非 Plan agent 请求打 `x-omoc-agent-route: execute`。
5. 插件不写入 `Authorization: Bearer SK-plan` 或 `Authorization: Bearer SK-execute`；这两个路由 token 由 gateway 服务端内部持有。
6. gateway 转发上游前剥离 `x-omoc-agent-route`，并按 route marker 映射到内部 SK 和真实模型。

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
