# Plan-only Model Routing Isolation

本文档记录 2026-06-03 为 `oh-my-opencode` 增加的 Plan-only 模型路由隔离方案。目标是让 OpenCode 进入 Plan agent 时强制走指定模型，同时保证普通 agent 不会继续污染或成功调用这个 Plan-only 模型。

## Requirements

1. 真实 SK 不写入 OpenCode 配置、插件配置、仓库文件或 `/models` 输出；OpenCode 侧只保存 fake SK。
2. Plan 请求强制使用 `plan-only/glm-5.1`，不受用户当前手动选择模型影响。
3. 非 Plan agent 即使手动切到 `plan-only/glm-5.1`，也不能拿到 real SK 成功调用。
4. Plan 结束后，下一条非 Plan 消息恢复最近的正常模型；没有历史正常模型时使用 fallback 模型。
5. 插件逻辑不修改 OpenCode 源码，通过 `config`、`chat.message`、`chat.headers` 和 gateway 策略完成隔离。
6. 图形化界面验证使用 OpenCode Web UI 可见的 `Prometheus - Plan Builder` agent；插件把它视为 Plan agent 的别名。

## Implemented Routing

Plan-only 路由由四段逻辑组成：

```text
config hook registers fake provider
  -> chat.message chooses final model
  -> chat.headers marks authorized Plan requests
  -> gateway swaps real key only for marked Plan requests
```

### Configuration Schema

新增配置键 `plan_only_model_routing`，字段定义在 [`plan-only-model-routing.ts`](../../src/config/schema/plan-only-model-routing.ts#L3)。默认目标是 `plan-only/glm-5.1`，默认 gateway 是 `https://www.micuapi.ai`，默认 fake key 是 `sk-omoc-plan-only-fake`，默认 fallback 是 `micuapi/deepseek-v4-flash`；这些默认值集中在 [`plan-only-model-routing.ts`](../../src/shared/plan-only-model-routing.ts#L19)。

示例：

```jsonc
{
  "plan_only_model_routing": {
    "enabled": true,
    "provider_id": "plan-only",
    "model_id": "glm-5.1",
    "gateway_base_url": "http://127.0.0.1:8787/v1",
    "fake_api_key": "sk-omoc-plan-only-fake",
    "fallback_model": "micuapi/deepseek-v4-flash"
  }
}
```

真实 SK 只放在 gateway 服务端环境变量中。演示环境使用 `/tmp/omoc-plan-only-e2e/gateway.env` 保存 secret，该文件在仓库外，不能提交或贴到日志里。

### Provider Registration

`config` hook 会在 OpenCode 配置里注入 `plan-only` provider，让 `/models` 可以看到 `glm-5.1`，但 provider options 里只写 fake SK。当前实现同时兼容新旧 provider 配置形态：

- 新 `providers` 结构：[`applyPlanOnlyProviderConfig`](../../src/plugin-handlers/plan-only-provider-config-handler.ts#L49)
- 旧 `provider` 结构：[`applyPlanOnlyProviderConfig`](../../src/plugin-handlers/plan-only-provider-config-handler.ts#L78)
- hook 接入位置：[`createConfigHandler`](../../src/plugin-handlers/config-handler.ts#L43)

### Message Routing

`chat.message` 是最终模型选择的收口点。只要 agent 是 `plan` 或 `Prometheus - Plan Builder`，插件都会把当前 user message 的 model 改成 `plan-only/glm-5.1`。Plan agent alias 定义在 [`isPlanAgent`](../../src/shared/plan-only-model-routing.ts#L33)，强制改模型逻辑在 [`applyPlanOnlyModelRouting`](../../src/plugin/chat-message.ts#L122)。

非 Plan agent 如果误用 `plan-only/glm-5.1`，会优先恢复该 session 最近一次正常模型；没有记录时恢复 fallback 模型。正常模型记忆逻辑会跳过 Plan agent 和 Plan-only 模型，避免 Plan-only 污染 session model state，见 [`rememberNormalSessionModel`](../../src/plugin/chat-message.ts#L147) 和 hook 调用顺序 [`chat-message.ts`](../../src/plugin/chat-message.ts#L384)。

`message.updated` 事件里也跳过 Plan-only 模型写入 session model state，避免运行后事件再把 Plan-only 记成正常模型，见 [`event.ts`](../../src/plugin/event.ts#L793)。

### Header Marking

`chat.headers` 只有在“Plan alias + `plan-only/glm-5.1`”同时成立时才添加 `x-omoc-plan-route: 1`。非 Plan agent、普通模型或没有启用配置时都不会添加这个 header。hook 接收插件配置的位置在 [`plugin-interface.ts`](../../src/plugin-interface.ts#L46)，header 判断和写入在 [`chat-headers.ts`](../../src/plugin/chat-headers.ts#L159)。

这个 header 只是路由标记，不是安全凭证。强隔离由 gateway 完成：只有看见合法 Plan 路由标记时才替换 real SK 并转发；没有标记的 `glm-5.1` 请求直接拒绝或继续使用 fake SK 失败。

## Test Cases

单元测试覆盖以下行为：

| Case | Expected | Evidence |
| ---- | -------- | -------- |
| Plan 下手动选择普通模型 | 最终 model 是 `plan-only/glm-5.1` | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L620) |
| Web UI `Prometheus - Plan Builder` | 被视为 Plan-only | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L638) |
| 非 Plan 手动选择 Plan-only | 恢复最近正常模型 | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L659) |
| 非 Plan 没有正常模型历史 | 恢复 `micuapi/deepseek-v4-flash` | [`chat-message.test.ts`](../../src/plugin/chat-message.test.ts#L682) |
| Plan + Plan-only | 添加 `x-omoc-plan-route: 1` | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L170) |
| Web UI Plan alias + Plan-only | 添加 `x-omoc-plan-route: 1` | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L194) |
| 非 Plan + Plan-only | 不添加 route header | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L218) |
| 普通模型请求 | 不添加 route header | [`chat-headers.test.ts`](../../src/plugin/chat-headers.test.ts#L242) |
| `config` hook provider 注册 | `plan-only/glm-5.1` 可见且只含 fake SK | [`config-handler.test.ts`](../../src/plugin-handlers/config-handler.test.ts#L240) |
| 配置 schema | `plan_only_model_routing` 可解析 | [`oh-my-opencode-config.test.ts`](../../src/config/schema/oh-my-opencode-config.test.ts#L103) |

端到端验收使用 `deepseek-v4-flash` 作为普通模型对照，`glm-5.1` 作为 Plan-only 目标：

1. Build 普通请求走 `micuapi/deepseek-v4-flash`。
2. 切到 Plan alias 后，即使 UI 当前模型仍显示 `deepseek-v4-flash`，实际请求走 `plan-only/glm-5.1`。
3. 切回 Build 后下一条请求恢复 `micuapi/deepseek-v4-flash`。
4. Build 手动切到 `plan-only/glm-5.1` 时不会获得 real SK。
5. gateway 探针验证：普通 `deepseek-v4-flash` 返回 200，带 Plan route header 的 `glm-5.1` 返回 200，不带 header 的 `glm-5.1` 返回 403。

## Demo Runtime

当前演示环境保持三个服务运行：

| Service | URL |
| ------- | --- |
| Gateway | `http://127.0.0.1:8787` |
| OpenCode backend | `http://127.0.0.1:4096` |
| OpenCode Web UI | `http://127.0.0.1:4444` |

演示时在图形化界面选择 `Prometheus - Plan Builder` agent，即可触发 Plan-only 路由。gateway 日志中成功路由会显示 `route=plan model=glm-5.1`；普通请求会显示 `route=normal model=deepseek-v4-flash`。
