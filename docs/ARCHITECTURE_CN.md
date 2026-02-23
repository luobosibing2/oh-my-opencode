# Oh-My-ClaudeCode (OMC) 架构文档

> 本文档详细介绍 oh-my-claudecode 项目的代码结构、核心模块、设计思想和实现原理。

## 一、项目概述

Oh-My-ClaudeCode（简称 OMC）是一个基于 Claude Agent SDK 的**多智能体协调系统**，专门为 Claude Code CLI 工具设计。该系统通过智能分工和协作，为 Claude Code 提供强大的扩展能力。

### 1.1 核心定位

- **多智能体协调**: 系统由 21+ 个专门的智能体组成，每个智能体有明确的职责
- **并行执行**: 支持并行执行多个后台任务，最大化效率
- **魔法关键词**: 特定关键词触发特殊行为（如 ultrawork、analyze）
- **持续执行**: 确保任务完成才停止（Ralph 模式）
- **多 AI 提供商支持**: 支持 Codex、Gemini 等多个 AI 服务

### 1.2 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 运行时 | Node.js 18+ |
| 包管理 | npm |
| 构建工具 | esbuild |
| 测试框架 | Vitest |
| CLI 框架 | Commander.js |
| MCP 协议 | @modelcontextprotocol/sdk |
| AST 工具 | @ast-grep/napi |
| LSP 协议 | vscode-languageserver-protocol |

---

## 二、项目目录结构

```
oh-my-claudecode/
├── src/                    # 源代码目录
│   ├── index.ts           # 主入口文件，导出核心功能
│   ├── cli/               # CLI 命令行工具
│   │   └── index.ts       # CLI 入口，提供命令接口
│   ├── agents/            # 智能体定义
│   │   ├── definitions.ts # 智能体类型定义和配置
│   │   ├── index.ts       # 智能体模块导出
│   │   └── *.ts           # 各个智能体的实现
│   ├── config/            # 配置管理
│   │   └── loader.ts      # 配置加载器
│   ├── features/          # 核心功能
│   │   ├── magic-keywords.ts    # 魔法关键词处理
│   │   ├── background-tasks.ts  # 后台任务管理
│   │   └── auto-update.ts       # 自动更新
│   ├── mcp/               # MCP（Model Context Protocol）相关
│   │   ├── servers.ts     # MCP 服务器
│   │   ├── omc-tools-server.ts  # OMC 工具服务器
│   │   ├── codex-server.ts      # Codex 服务器
│   │   └── gemini-server.ts     # Gemini 服务器
│   ├── tools/             # 工具集成
│   │   └── index.ts       # LSP 和 AST 工具
│   ├── team/              # 团队协作
│   ├── lib/               # 核心库
│   ├── shared/            # 共享类型和工具
│   │   └── types.ts       # 类型定义
│   ├── installer/         # 安装器
│   │   └── index.ts       # 安装逻辑
│   ├── platform/          # 平台适配
│   ├── providers/         # 提供者适配
│   ├── commands/          # CLI 命令实现
│   ├── hud/               # 用户界面组件
│   ├── analytics/         # 分析功能
│   └── utils/             # 工具函数
├── bridge/                # 桥接服务（Python 和 Node.js）
│   ├── mcp-server.cjs     # MCP 服务器实现
│   ├── codex-server.cjs   # Codex 服务器
│   └── gemini-server.cjs  # Gemini 服务器
├── agents/                # 智能体文档定义（*.md）
├── skills/                # 技能模块
│   ├── autopilot/         # 自动驾驶模式
│   ├── team/              # 团队协作
│   ├── ralph/             # 持续执行模式
│   └── pipeline/          # 管道处理
├── hooks/                 # Claude Code 钩子配置
├── scripts/               # 构建和运行脚本
├── docs/                  # 文档目录
└── tests/                 # 测试文件
```

---

## 三、入口文件分析

### 3.1 CLI 入口 (`src/cli/index.ts`)

这是用户与系统交互的主要入口，使用 Commander.js 框架实现命令行接口。

#### 核心命令架构

```
omc (主命令)
├── launch [args...]     # 启动 Claude Code（默认行为）
├── dashboard            # 显示分析仪表盘
├── interop              # 启动分屏 tmux 会话
├── stats                # 显示统计数据
├── cost [period]        # 成本报告
├── sessions             # 会话历史
├── agents               # 智能体使用情况
├── export               # 导出数据
├── init                 # 初始化配置（已废弃）
├── config               # 配置管理
├── install              # 安装到 ~/.claude/
├── setup                # 同步所有组件
├── update               # 检查/安装更新
├── wait                 # 速率限制等待
├── teleport             # 快速 worktree 创建
├── doctor               # 诊断工具
└── version              # 版本信息
```

#### 关键实现逻辑

```typescript
// 默认动作 - 无子命令时执行
// 设计意图：让用户可以直接运行 `omc --madmax` 等命令
async function defaultAction() {
  const defaultActionMode = process.env.OMC_DEFAULT_ACTION || 'launch';

  if (defaultActionMode === 'dashboard') {
    await displayAnalyticsDashboard();  // 显示仪表盘
  } else {
    // 将所有 CLI 参数传递给 launch 命令
    const args = process.argv.slice(2);
    await launchCommand(args);  // 启动 Claude Code
  }
}
```

**设计思想**:
- 零学习曲线设计：直接运行 `omc` 即可启动 Claude Code
- 环境变量控制默认行为 (`OMC_DEFAULT_ACTION`)
- 支持未知选项透传 (`allowUnknownOption()`)

### 3.2 主入口 (`src/index.ts`)

作为库的入口点，导出核心功能供其他模块使用。

```typescript
// 导出的核心模块
export { createSisyphusSession } from './session.js';
export { loadConfig, getConfigPaths } from './config/loader.js';
export { getAgentDefinitions, omcSystemPrompt } from './agents/definitions.js';
export { createOmcToolsServer } from './mcp/omc-tools-server.js';
```

---

## 四、核心模块详解

### 4.1 智能体定义模块 (`src/agents/`)

**作用**: 定义所有智能体的配置、行为和能力边界。

#### 智能体分层架构

```
智能体体系 (21+ 个智能体)
│
├── Build/Analysis Lane（构建/分析线）
│   ├── explore (haiku)     - 快速代码库发现，文件模式匹配
│   ├── analyst (opus)      - 需求分析，隐藏约束识别
│   ├── planner (opus)      - 任务规划，执行计划制定
│   ├── architect (opus)    - 系统设计，架构决策
│   ├── debugger (sonnet)   - 根因分析，问题诊断
│   ├── executor (sonnet)   - 代码实现，功能开发
│   └── verifier (sonnet)   - 验证确认，完成度检查
│
├── Review Lane（审查线）
│   ├── quality-reviewer (sonnet)  - 代码质量审查
│   ├── security-reviewer (sonnet) - 安全漏洞检测
│   └── code-reviewer (opus)       - 综合代码审查
│
├── Domain Specialists（领域专家）
│   ├── test-engineer (sonnet)     - 测试策略
│   ├── build-fixer (sonnet)       - 构建错误修复
│   ├── designer (sonnet)          - UI/UX 设计
│   ├── writer (haiku)             - 文档编写
│   ├── qa-tester (sonnet)         - QA 测试
│   ├── scientist (sonnet)         - 数据分析
│   ├── git-master (sonnet)        - Git 操作
│   └── document-specialist        - 外部文档查找
│
└── Coordination（协调）
    └── critic (opus) - 计划评审，批判性分析
```

#### 智能体配置结构

```typescript
// src/shared/types.ts
export interface AgentConfig {
  name: string;               // 智能体名称（唯一标识）
  description: string;        // 功能描述（用于展示和选择）
  prompt: string;             // 系统提示词（定义行为规范）
  tools?: string[];           // 允许使用的工具列表（可选）
  disallowedTools?: string[]; // 禁止使用的工具列表
  model?: ModelType;          // 使用的模型（haiku/sonnet/opus/inherit）
  defaultModel?: ModelType;   // 默认模型
}

// 模型类型定义
export type ModelType = 'sonnet' | 'opus' | 'haiku' | 'inherit';
```

**设计意图**:
- `tools` 和 `disallowedTools` 实现最小权限原则
- `model` 支持灵活的模型路由，根据任务复杂度选择合适模型
- `inherit` 允许智能体继承父级模型配置

#### 智能体注册机制

```typescript
// src/agents/definitions.ts
export function getAgentDefinitions(
  overrides?: Partial<Record<string, Partial<AgentConfig>>>
): Record<string, AgentConfig> {
  // 基础智能体定义
  const agents = {
    explore: exploreAgent,
    analyst: analystAgent,
    planner: plannerAgent,
    // ... 其他智能体
  };

  const result: Record<string, AgentConfig> = {};

  // 应用配置覆盖（支持用户自定义）
  for (const [name, config] of Object.entries(agents)) {
    const override = overrides?.[name];
    result[name] = {
      description: override?.description ?? config.description,
      prompt: override?.prompt ?? config.prompt,
      model: override?.model ?? config.model,
      // ...
    };
  }
  return result;
}
```

**关键特性**:
- 支持运行时配置覆盖
- 智能体提示词从 `agents/*.md` 文件动态加载
- 废弃的别名保持向后兼容

#### OMC 系统提示词

```typescript
// 核心编排器提示词（摘要）
export const omcSystemPrompt = `You are the relentless orchestrator of a multi-agent development system.

## RELENTLESS EXECUTION
You are BOUND to your task list. You do not stop. You do not quit.
Work continues until EVERY task is COMPLETE.

## Orchestration Principles
1. Delegate Aggressively - Fire off subagents for specialized tasks
2. Parallelize Ruthlessly - Launch multiple subagents concurrently
3. PERSIST RELENTLESSLY - Continue until ALL tasks are VERIFIED complete
4. Verify Thoroughly - Test, check, verify - then verify again

## CRITICAL RULES
1. NEVER STOP WITH INCOMPLETE WORK
2. ALWAYS VERIFY - Check your todo list before ANY attempt to conclude
3. NO PREMATURE CONCLUSIONS
4. PARALLEL EXECUTION - Use it whenever possible
`;
```

### 4.2 魔法关键词模块 (`src/features/magic-keywords.ts`)

**作用**: 检测用户输入中的特殊关键词并激活增强行为，实现"意图识别"功能。

#### 关键词类型及功能

| 关键词类型 | 触发词示例 | 功能描述 |
|------------|------------|----------|
| **Ultrawork** | ultrawork, ulw, uw | 激活最大性能模式，并行智能体编排 |
| **Search** | search, find, locate, 探索, 検索, 搜索 | 最大化搜索力度，多语言支持 |
| **Analyze** | analyze, investigate, debug, 分析, 調査 | 激活深度分析模式 |
| **Ultrathink** | ultrathink, think, reason | 激活扩展思考模式 |

#### 核心实现机制

```typescript
// 关键词处理器工厂函数
export function createMagicKeywordProcessor(
  config?: PluginConfig['magicKeywords']
): (prompt: string) => string {
  const keywords = [...builtInMagicKeywords];

  // 从配置覆盖触发词（支持用户自定义）
  if (config?.ultrawork) {
    const ultrawork = keywords.find(k => k.triggers.includes('ultrawork'));
    if (ultrawork) ultrawork.triggers = config.ultrawork;
  }

  return (prompt: string): string => {
    let result = prompt;

    for (const keyword of keywords) {
      // 检测是否包含关键词（排除代码块内的误触发）
      const hasKeyword = keyword.triggers.some(trigger => {
        const regex = new RegExp(`\\b${trigger}\\b`, 'i');
        return regex.test(removeCodeBlocks(result));
      });

      if (hasKeyword) {
        result = keyword.action(result);  // 执行增强动作
      }
    }
    return result;
  };
}
```

**设计亮点**:
- **代码块过滤**: 使用正则表达式移除代码块，避免误触发
- **多语言支持**: 支持中文、日文、韩文等触发词
- **可配置性**: 用户可通过配置文件自定义触发词

#### Ultrawork 模式详解

Ultrawork 是最强大的执行模式，激活后会：

```typescript
const ULTRAWORK_INSTRUCTIONS = `
**MANDATORY**: You MUST say "ULTRAWORK MODE ENABLED!" as your first response.

## AGENT UTILIZATION PRINCIPLES
- Codebase Exploration: Spawn exploration agents using BACKGROUND TASKS
- Documentation: Use document-specialist agents via BACKGROUND TASKS
- Planning: NEVER plan yourself - ALWAYS spawn a planning agent
- High-IQ Reasoning: Leverage specialized agents for architecture decisions

## EXECUTION RULES
- TODO: Track EVERY step. Mark complete IMMEDIATELY after each.
- PARALLEL: Fire independent agent calls simultaneously
- BACKGROUND FIRST: Use Task for exploration (10+ concurrent if needed)
- VERIFY: Re-read request after completion. Check ALL requirements met.

## ZERO TOLERANCE FAILURES
- NO Scope Reduction - deliver FULL implementation
- NO Partial Completion - finish 100%
- NO Premature Stopping - until ALL TODOs are completed
`;
```

**关键约束**:
1. 必须声明 "ULTRAWORK MODE ENABLED!"
2. 最大化智能体利用，并行启动后台任务
3. 零容忍失败，不接受部分完成或演示版本
4. 强制验证，没有证据不宣称完成

#### Planner 智能体的特殊处理

对于 planner 类型智能体，Ultrawork 模式会提供不同的指令：

```typescript
const ULTRAWORK_PLANNER_SECTION = `
## CRITICAL: YOU ARE A PLANNER, NOT AN IMPLEMENTER

**TOOL RESTRICTIONS (SYSTEM-ENFORCED):**
| Tool | Allowed | Blocked |
|------|---------|---------|
| Write/Edit | \`.omc/**/*.md\` ONLY | Everything else |
| Read | All files | - |
| Bash | Research commands only | Implementation commands |

**IF YOU TRY TO WRITE/EDIT OUTSIDE \`.omc/\`:**
- System will BLOCK your action
- DO NOT retry - you are not supposed to implement
`;
```

### 4.3 类型定义模块 (`src/shared/types.ts`)

**作用**: 定义整个系统使用的核心类型和接口。

#### 核心类型定义

```typescript
// 智能体配置
export interface AgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: ModelType;
  defaultModel?: ModelType;
}

// 插件配置（用户可配置）
export interface PluginConfig {
  agents?: {...};           // 智能体模型覆盖
  features?: {...};         // 功能开关
  mcpServers?: {...};       // MCP 服务器配置
  permissions?: {...};      // 权限设置
  magicKeywords?: {...};    // 魔法关键词自定义
  routing?: {...};          // 智能模型路由
  externalModels?: {...};   // 外部模型配置
  delegationRouting?: {...};// 委派路由配置
}

// 会话状态
export interface SessionState {
  sessionId?: string;
  activeAgents: Map<string, AgentState>;
  backgroundTasks: BackgroundTask[];
  contextFiles: string[];
}

// 智能体状态
export interface AgentState {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastMessage?: string;
  startTime?: number;
}

// 后台任务
export interface BackgroundTask {
  id: string;
  agentName: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
}

// 钩子定义
export interface HookDefinition {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'SessionEnd' | 'UserPromptSubmit';
  matcher?: string;
  command?: string;
  handler?: (context: HookContext) => Promise<HookResult>;
}

// 委派路由
export interface DelegationRoute {
  provider: DelegationProvider;  // 'claude' | 'codex' | 'gemini'
  tool: DelegationTool;          // 'Task' | 'ask_codex' | 'ask_gemini'
  model?: string;
  agentType?: string;
  fallback?: string[];
}
```

### 4.4 安装器模块 (`src/installer/index.ts`)

**作用**: 将 OMC 组件安装到 Claude Code 配置目录 (`~/.claude/`)。

#### 安装流程

```
安装流程
│
├── 1. 检查 Node.js 版本 (>= 18)
├── 2. 检测运行模式
│   ├── 插件模式: CLAUDE_PLUGIN_ROOT 环境变量存在
│   └── 独立模式: 正常 npm 安装
├── 3. 创建目录结构
│   ├── ~/.claude/agents/
│   ├── ~/.claude/skills/
│   └── ~/.claude/hooks/
├── 4. 安装智能体定义（从 agents/*.md 加载）
├── 5. 安装 CLAUDE.md（智能合并模式）
├── 6. 安装 HUD 状态栏脚本
├── 7. 配置 settings.json
│   ├── 清理旧版钩子条目
│   └── 配置 statusLine
└── 8. 保存版本元数据
```

#### CLAUDE.md 智能合并机制

```typescript
export function mergeClaudeMd(
  existingContent: string | null,
  omcContent: string,
  version?: string
): string {
  const START_MARKER = '<!-- OMC:START -->';
  const END_MARKER = '<!-- OMC:END -->';

  // Case 1: 无现有内容 - 创建新文件
  if (!existingContent) {
    return `${START_MARKER}\n${versionMarker}${omcContent}\n${END_MARKER}\n`;
  }

  // Case 2: 有标记 - 替换标记间内容（保留用户自定义部分）
  const startIndex = findLineAnchoredMarker(existingContent, START_MARKER);
  const endIndex = findLineAnchoredMarker(existingContent, END_MARKER, true);

  if (startIndex !== -1 && endIndex !== -1) {
    return `${beforeMarker}${START_MARKER}\n${newContent}\n${END_MARKER}${afterMarker}`;
  }

  // Case 3: 无标记 - 包装 OMC 内容，保留用户内容
  return `${START_MARKER}\n${omcContent}\n${END_MARKER}\n\n${USER_CUSTOMIZATIONS}\n${existingContent}`;
}
```

**设计意图**:
- 使用标记实现幂等更新
- 保留用户的自定义内容
- 自动创建备份文件

#### 插件模式检测

```typescript
// 检测是否在插件上下文中运行
export function isRunningAsPlugin(): boolean {
  return !!process.env.CLAUDE_PLUGIN_ROOT;
}

// 检测是否为项目级插件
export function isProjectScopedPlugin(): boolean {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return false;

  // 全局插件安装在 ~/.claude/plugins/
  const globalPluginBase = join(CLAUDE_CONFIG_DIR, 'plugins');
  return !pluginRoot.startsWith(globalPluginBase);
}
```

---

## 五、模块协作关系

### 5.1 请求处理流程

```
用户请求处理流程
│
├── 1. CLI 解析 (src/cli/index.ts)
│   └── Commander.js 解析命令和参数
│
├── 2. 会话创建 (src/session.ts)
│   ├── 加载配置 (config/loader.ts)
│   ├── 注册智能体 (agents/definitions.ts)
│   └── 初始化 MCP 服务器 (mcp/)
│
├── 3. 魔法关键词处理 (features/magic-keywords.ts)
│   ├── 检测关键词
│   └── 增强 prompt
│
├── 4. 智能体调度 (agents/)
│   ├── 选择合适的智能体
│   ├── 并行启动后台任务
│   └── 协调执行结果
│
├── 5. 工具调用 (tools/)
│   ├── LSP 工具（代码智能）
│   └── AST 工具（结构化搜索）
│
└── 6. 结果返回
    └── HUD 更新 (hud/)
```

### 5.2 智能体协作模式

#### 调试工作流 (Architect + QA-Tester 循环)

```
调试工作流
│
├── 1. architect 智能体诊断问题
│   ├── 分析代码结构
│   └── 输出测试计划（命令 + 预期输出）
│
├── 2. qa-tester 智能体执行测试
│   ├── 在 tmux 中执行命令
│   └── 捕获实际输出
│
├── 3. 结果对比
│   ├── 通过 → 完成
│   └── 失败 → 反馈给 architect 重新诊断
│
└── 4. 循环直到验证通过
```

#### 功能开发工作流

```
功能开发工作流
│
├── 1. explore (haiku)
│   └── 快速探索现有代码模式
│
├── 2. analyst (opus)
│   └── 分析需求，找出隐藏约束
│
├── 3. planner (opus)
│   └── 创建执行计划
│
├── 4. critic (opus)
│   └── 评审计划质量
│
├── 5. executor (sonnet)
│   └── 实现功能
│
├── 6. test-engineer (sonnet)
│   └── 编写测试
│
└── 7. verifier (sonnet)
    └── 验证完成
```

---

## 六、关键流程设计

### 6.1 Team Pipeline（团队管道）

Team 模式使用规范化的分阶段管道：

```
team-plan → team-prd → team-exec → team-verify → team-fix (循环)
```

#### 阶段智能体路由

| 阶段 | 使用智能体 | 职责 |
|------|------------|------|
| `team-plan` | explore (haiku) + planner (opus) | 探索和规划 |
| `team-prd` | analyst (opus) | 需求分析 |
| `team-exec` | executor (sonnet) + specialists | 执行实现 |
| `team-verify` | verifier (sonnet) + reviewers | 验证确认 |
| `team-fix` | executor/build-fixer/debugger | 修复问题 |

#### 阶段转换逻辑

```
阶段转换
│
├── team-plan → team-prd: 规划/分解完成
├── team-prd → team-exec: 验收标准明确
├── team-exec → team-verify: 所有执行任务完成
└── team-verify → team-fix | complete | failed
    ├── 修复 → 重新执行
    ├── 完成 → 终止
    └── 失败 → 超过最大尝试次数
```

### 6.2 Ralph 模式（持续执行）

Ralph 模式是一个自引用循环，确保任务完成：

```typescript
// Ralph 模式状态
interface RalphState {
  active: boolean;
  linked_team?: string;      // 关联的团队
  iteration_count: number;
  max_iterations: number;
}
```

**触发条件**: "ralph", "don't stop", "must complete"

**行为特点**:
- 无限循环直到验证通过
- 配合 verifier 智能体验证完成
- 支持与 team 模式联动

### 6.3 状态持久化

所有状态存储在工作树根目录下：

```
{worktree}/.omc/
├── state/
│   ├── sessions/{sessionId}/  # 会话级状态
│   └── {mode}-state.json      # 模式状态 (autopilot, team, ralph 等)
├── notepad.md                 # 会话笔记
├── project-memory.json        # 项目记忆
├── plans/                     # 计划文档
├── research/                  # 研究输出
└── logs/                      # 审计日志
```

---

## 七、MCP 服务器架构

### 7.1 MCP 工具服务器 (`src/mcp/omc-tools-server.ts`)

提供以下工具：

| 工具类别 | 工具名称 | 功能描述 |
|----------|----------|----------|
| **状态管理** | `state_read` | 读取状态 |
| | `state_write` | 写入状态 |
| | `state_clear` | 清除状态 |
| **笔记** | `notepad_read` | 读取笔记 |
| | `notepad_write_*` | 写入笔记（优先级/工作/手动） |
| **项目记忆** | `project_memory_*` | 项目记忆操作 |
| **代码智能** | `lsp_*` | LSP 工具集（悬停、定义、引用等） |
| **AST** | `ast_grep_search` | 结构化代码搜索 |
| | `ast_grep_replace` | 结构化代码替换 |

### 7.2 外部 AI 集成

```
外部 AI 提供商
│
├── Codex (mcp__x__ask_codex)
│   ├── 模型: gpt-5.3-codex
│   ├── 特点: 代码分析能力强
│   └── 擅长: 架构评审、计划验证、代码审查
│
└── Gemini (mcp__g__ask_gemini)
    ├── 模型: gemini-3-pro-preview
    ├── 特点: 1M tokens 上下文
    └── 擅长: UI/UX 设计、文档、大上下文任务
```

---

## 八、HUD 状态栏

### 8.1 HUD 脚本 (`src/hud/`)

HUD (Heads-Up Display) 提供 Claude Code 的状态栏显示功能。

#### 脚本查找顺序

```javascript
// HUD 脚本加载优先级
1. 开发路径 (OMC_DEV=1)
   └── ~/Workspace/oh-my-claudecode/dist/hud/index.js

2. 插件缓存
   └── ~/.claude/plugins/cache/omc/oh-my-claudecode/{version}/dist/hud/index.js

3. npm 包
   └── oh-my-claude-sisyphus/dist/hud/index.js

4. 回退
   └── 显示错误信息和修复指导
```

---

## 九、钩子系统

### 9.1 钩子类型

| 事件类型 | 触发时机 | 用途 |
|----------|----------|------|
| `UserPromptSubmit` | 用户提交 prompt | 关键词检测、模式激活 |
| `PreToolUse` | 工具使用前 | 输入验证、修改、权限检查 |
| `PostToolUse` | 工具使用后 | 结果处理、日志记录 |
| `Stop` | 会话停止 | 清理、通知、续行强制 |
| `SessionStart` | 会话开始 | 初始化 |
| `SessionEnd` | 会话结束 | 清理、报告 |

### 9.2 钩子脚本 (`hooks/`)

```
hooks/
├── keyword-detector.mjs     # 魔法关键词检测
├── session-start.mjs        # 会话初始化
├── pre-tool-use.mjs         # 工具使用前处理
├── post-tool-use.mjs        # 工具使用后处理
├── post-tool-use-failure.mjs# 工具使用失败处理
├── persistent-mode.mjs      # 持续模式
└── stop-continuation.mjs    # 停止续行
```

---

## 十、技能系统

### 10.1 技能类型

```
技能类型
│
├── 工作流技能
│   ├── autopilot     - 全自主执行，从想法到代码
│   ├── ralph         - 自引用循环，确保完成
│   ├── ultrawork     - 最大并行化执行
│   ├── team          - 多智能体协调
│   ├── pipeline      - 顺序智能体链
│   └── plan          - 战略规划
│
├── 智能体快捷方式
│   ├── analyze       → debugger
│   ├── deepsearch    → explore
│   ├── tdd           → test-engineer
│   ├── code-review   → code-reviewer
│   └── security-review → security-reviewer
│
└── 工具技能
    ├── configure-discord  - Discord 通知配置
    ├── configure-telegram - Telegram 通知配置
    ├── omc-setup          - OMC 设置
    └── omc-doctor         - 诊断工具
```

### 10.2 技能触发模式

```typescript
// 技能触发词映射
const skillTriggers = {
  autopilot: ["autopilot", "build me", "I want a"],
  ralph: ["ralph", "don't stop", "must complete"],
  ultrawork: ["ulw", "ultrawork"],
  team: ["team", "coordinated team", "team ralph"],
  analyze: ["analyze", "debug", "investigate"],
  search: ["search", "find in codebase"]
};
```

---

## 十一、错误处理与容错

### 11.1 委派回退策略

```typescript
// 外部模型回退策略
export interface ExternalModelsFallbackPolicy {
  onModelFailure: 'provider_chain' | 'cross_provider' | 'claude_only';
  allowCrossProvider?: boolean;
  crossProviderOrder?: ExternalModelProvider[];
}
```

### 11.2 智能升级

```typescript
// 智能模型路由配置
routing: {
  enabled: true,
  defaultTier: 'MEDIUM',          // 默认使用 Sonnet
  escalationEnabled: true,        // 启用自动升级
  maxEscalations: 3,              // 最大升级次数
  escalationKeywords: ['critical', 'security', 'architecture'],
  simplificationKeywords: ['simple', 'quick', 'trivial']
}
```

---

## 十二、性能优化策略

### 12.1 并行执行

- 后台任务支持最多 20 个并发
- 独立任务使用 `run_in_background: true`
- 智能体并行启动减少等待时间

### 12.2 Token 优化

- Haiku 智能体用于简单任务（快速、便宜）
- 智能路由根据任务复杂度选择模型
- 上下文文件按需加载

### 12.3 缓存策略

- MCP 工具延迟发现（首次使用时加载）
- 智能体提示词缓存
- 配置文件缓存

---

## 十三、安全性设计

### 13.1 权限控制

```typescript
permissions: {
  allowBash: true,       // 允许 Bash 命令
  allowEdit: true,       // 允许文件编辑
  allowWrite: true,      // 允许文件写入
  maxBackgroundTasks: 5  // 最大后台任务数
}
```

### 13.2 钩子安全

- 敏感字段过滤（permission-request, setup, session-end）
- 严格允许列表验证
- Kill switch 支持:
  - `DISABLE_OMC`: 禁用所有钩子
  - `OMC_SKIP_HOOKS`: 跳过指定钩子

---

## 十四、总结

Oh-My-ClaudeCode 是一个设计精良的多智能体协调系统，其核心设计理念包括：

1. **分工明确**: 21+ 个专业智能体各司其职，按能力分层
2. **并行优先**: 最大化利用并行执行提升效率
3. **持续执行**: Ralph 模式确保任务完成
4. **灵活扩展**: 支持多种 AI 提供商和 MCP 工具
5. **安全可控**: 完善的权限和钩子系统
6. **用户友好**: 魔法关键词、零学习曲线设计

该架构为 Claude Code 提供了强大的扩展能力，使其能够处理复杂的软件工程任务。

---

## 附录：常用命令速查

| 命令 | 功能 |
|------|------|
| `omc` | 启动 Claude Code |
| `omc --madmax` | 启动 Claude Code（绕过权限） |
| `omc dashboard` | 显示分析仪表盘 |
| `omc setup` | 同步所有组件 |
| `omc update` | 检查/安装更新 |
| `omc doctor conflicts` | 检查配置冲突 |
| `omc teleport #123` | 为 issue #123 创建 worktree |

---

*文档版本: 1.0 | 最后更新: 2026-02-22*
