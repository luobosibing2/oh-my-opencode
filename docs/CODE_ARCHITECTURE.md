# Oh-My-ClaudeCode 代码架构详解

> 本文档从入口文件出发，深入解析整个项目的代码结构、核心实现逻辑、模块协作关系以及设计思想。

---

## 目录

1. [项目概述](#1-项目概述)
2. [入口文件与启动流程](#2-入口文件与启动流程)
3. [核心数据结构](#3-核心数据结构)
4. [模块详解](#4-模块详解)
   - 4.1 [Agent 系统](#41-agent-系统)
   - 4.2 [Hooks 系统](#42-hooks-系统)
   - 4.3 [MCP 服务器](#43-mcp-服务器)
   - 4.4 [Team 协调系统](#44-team-协调系统)
   - 4.5 [状态管理](#45-状态管理)
   - 4.6 [Features 模块](#46-features-模块)
5. [整体架构图](#5-整体架构图)
6. [关键流程分析](#6-关键流程分析)
7. [设计模式与最佳实践](#7-设计模式与最佳实践)

---

## 1. 项目概述

### 1.1 项目定位

**oh-my-claudecode (OMC)** 是一个为 Claude Code CLI 构建的多智能体编排系统。它的核心设计理念是：

- **多智能体协作**：通过 21+ 个专业化 Agent 实现任务分工
- **智能模型路由**：根据任务复杂度自动选择合适的模型（haiku/sonnet/opus）
- **持久化执行**：支持 ralph、autopilot、team 等持续执行模式
- **Hook 扩展机制**：通过 Claude Code 的原生 Hook 系统注入复杂逻辑

### 1.2 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.7 | 主要开发语言 |
| @anthropic-ai/claude-agent-sdk | Claude Agent SDK 集成 |
| @modelcontextprotocol/sdk | MCP 服务器实现 |
| @ast-grep/napi | AST 代码搜索 |
| better-sqlite3 | 任务状态持久化 |
| Zod | Schema 验证 |
| Commander | CLI 框架 |

### 1.3 目录结构

```
oh-my-claudecode/
├── src/                    # TypeScript 源代码
│   ├── index.ts           # 库入口
│   ├── cli/               # CLI 命令
│   ├── agents/            # Agent 定义
│   ├── hooks/             # Hook 实现 (30+ 子模块)
│   ├── mcp/               # MCP 服务器
│   ├── team/              # Team 协调
│   ├── tools/             # 工具实现 (LSP/AST/Python REPL)
│   ├── features/          # 核心功能
│   ├── analytics/         # Token 追踪与成本估算
│   ├── hud/               # Statusline 显示
│   └── ...
├── agents/                 # Agent Prompt 文件 (*.md)
├── skills/                 # Skill 定义
├── hooks/                  # Hook 配置 (hooks.json)
├── bridge/                 # 编译后的 MCP Server bundles
└── docs/                   # 文档
```

---

## 2. 入口文件与启动流程

### 2.1 库入口 (`src/index.ts`)

```typescript
// 核心导出
export { loadConfig, getAgentDefinitions, omcSystemPrompt };
export { lspTools, astTools, allCustomTools } from './tools/index.js';
export { omcToolsServer, omcToolNames } from './mcp/omc-tools-server.js';
```

**设计意图**：`index.ts` 作为库的主入口，负责：
1. 导出配置加载函数
2. 导出 Agent 定义
3. 导出工具集
4. 导出 MCP 服务器配置

### 2.2 CLI 入口 (`src/cli/index.ts`)

CLI 使用 **Commander.js** 框架构建，支持以下命令：

```typescript
program
  .name('omc')
  .description('Multi-agent orchestration system for Claude Agent SDK')
  .version(version)
  .allowUnknownOption()
  .action(defaultAction);  // 默认执行 launch 命令
```

**主要命令**：

| 命令 | 功能 |
|------|------|
| `launch` | 启动 Claude Code (默认) |
| `dashboard` | 显示分析仪表盘 |
| `stats` | 聚合统计 |
| `cost` | 成本报告 |
| `sessions` | 会话历史 |
| `agents` | Agent 使用统计 |
| `install` | 安装到 ~/.claude/ |
| `setup` | 同步所有组件 |
| `wait` | 速率限制等待与自动恢复 |
| `teleport` | 快速创建 git worktree |

### 2.3 会话创建流程

```typescript
// src/index.ts: createSisyphusSession()
export function createSisyphusSession(options?: SisyphusOptions): SisyphusSession {
  // 1. 加载配置
  const loadedConfig = options?.skipConfigLoad ? {} : loadConfig();

  // 2. 查找并加载上下文文件 (AGENTS.md, CLAUDE.md)
  const contextFiles = findContextFiles(options?.workingDirectory);
  const contextAddition = loadContextFromFiles(contextFiles);

  // 3. 构建系统提示词
  let systemPrompt = omcSystemPrompt;
  systemPrompt += continuationSystemPromptAddition;  // 持续执行增强
  systemPrompt += contextAddition;

  // 4. 获取 Agent 定义
  const agents = getAgentDefinitions();

  // 5. 构建 MCP 服务器配置
  const mcpServers = {
    't': omcToolsServer,    // OMC 自定义工具
    'x': codexMcpServer,    // Codex 集成
    'g': geminiMcpServer    // Gemini 集成
  };

  // 6. 返回会话对象
  return {
    queryOptions: { options: { systemPrompt, agents, mcpServers, allowedTools } },
    state, config, processPrompt, detectKeywords,
    backgroundTasks, shouldRunInBackground
  };
}
```

---

## 3. 核心数据结构

### 3.1 Agent 配置 (`AgentConfig`)

```typescript
// src/shared/types.ts
export interface AgentConfig {
  name: string;              // Agent 名称
  description: string;       // 描述（用于路由决策）
  prompt: string;            // 系统提示词
  tools?: string[];          // 允许的工具
  disallowedTools?: string[]; // 禁用的工具
  model?: ModelType;         // 模型类型
  defaultModel?: ModelType;  // 默认模型
}

export type ModelType = 'sonnet' | 'opus' | 'haiku' | 'inherit';
```

### 3.2 插件配置 (`PluginConfig`)

```typescript
export interface PluginConfig {
  agents?: { /* Agent 模型覆盖 */ };
  features?: {
    parallelExecution?: boolean;      // 并行执行
    lspTools?: boolean;               // LSP 工具
    astTools?: boolean;               // AST 工具
    continuationEnforcement?: boolean; // 持续执行强制
    autoContextInjection?: boolean;   // 自动上下文注入
  };
  mcpServers?: {
    exa?: { enabled?: boolean; apiKey?: string };
    context7?: { enabled?: boolean };
  };
  permissions?: {
    allowBash?: boolean;
    allowEdit?: boolean;
    allowWrite?: boolean;
    maxBackgroundTasks?: number;
  };
  magicKeywords?: {
    ultrawork?: string[];
    search?: string[];
    analyze?: string[];
  };
  routing?: { /* 智能模型路由配置 */ };
  delegationRouting?: { /* 委托路由配置 */ };
}
```

### 3.3 会话状态 (`SessionState`)

```typescript
export interface SessionState {
  sessionId?: string;
  activeAgents: Map<string, AgentState>;  // 活跃 Agent
  backgroundTasks: BackgroundTask[];       // 后台任务
  contextFiles: string[];                  // 上下文文件
}

export interface AgentState {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastMessage?: string;
  startTime?: number;
}
```

### 3.4 Hook 上下文与结果

```typescript
export interface HookContext {
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  sessionId?: string;
}

export interface HookResult {
  continue: boolean;         // 是否继续执行
  message?: string;          // 返回给 Claude 的消息
  modifiedInput?: unknown;   // 修改后的输入
}
```

---

## 4. 模块详解

### 4.1 Agent 系统

#### 4.1.1 Agent 分类

OMC 定义了 **21+ 个专业化 Agent**，按功能分为以下几类：

**Build/Analysis Lane（构建/分析线）**：

| Agent | 模型 | 职责 |
|-------|------|------|
| `explore` | haiku | 内部代码库发现、快速模式匹配 |
| `analyst` | opus | 需求清晰化、隐藏约束分析 |
| `planner` | opus | 任务排序、执行计划、风险标识 |
| `architect` | opus | 系统设计、边界定义、接口设计、权衡分析 |
| `debugger` | sonnet | 根因分析、回归隔离、故障诊断 |
| `executor` | sonnet | 代码实现、重构、功能开发 |
| `verifier` | sonnet | 完成验证、声明验证、测试充分性 |

**Review Lane（审查线）**：

| Agent | 模型 | 职责 |
|-------|------|------|
| `quality-reviewer` | sonnet | 逻辑缺陷、可维护性、反模式 |
| `security-reviewer` | sonnet | 安全审计、信任边界、认证授权 |
| `code-reviewer` | opus | 综合代码审查（协调所有审查方面） |

**Domain Specialists（领域专家）**：

| Agent | 模型 | 职责 |
|-------|------|------|
| `test-engineer` | sonnet | 测试策略、覆盖率、不稳定测试加固 |
| `build-fixer` | sonnet | 构建错误、工具链/类型错误修复 |
| `designer` | sonnet | UI/UX 架构、交互设计 |
| `writer` | haiku | 文档、迁移说明 |
| `qa-tester` | sonnet | CLI 测试、交互式运行时验证 |
| `scientist` | sonnet | 数据分析、统计研究 |
| `git-master` | sonnet | Git 操作、提交、变基、历史管理 |
| `document-specialist` | sonnet | 外部文档与参考资料查找 |

**Coordination（协调）**：

| Agent | 模型 | 职责 |
|-------|------|------|
| `critic` | opus | 计划审查、批判性挑战与评估 |
| `deep-executor` | - | 复杂自主目标导向任务 |

#### 4.1.2 Agent 注册表

```typescript
// src/agents/definitions.ts: getAgentDefinitions()
export function getAgentDefinitions(overrides?: Partial<Record<string, Partial<AgentConfig>>>) {
  const agents = {
    // Build/Analysis Lane
    explore: exploreAgent,
    analyst: analystAgent,
    planner: plannerAgent,
    architect: architectAgent,
    debugger: debuggerAgent,
    executor: executorAgent,
    verifier: verifierAgent,

    // Review Lane
    'quality-reviewer': qualityReviewerAgent,
    'security-reviewer': securityReviewerAgent,
    'code-reviewer': codeReviewerAgent,

    // Domain Specialists
    'test-engineer': testEngineerAgent,
    'build-fixer': buildFixerAgent,
    designer: designerAgent,
    writer: writerAgent,
    'qa-tester': qaTesterAgent,
    scientist: scientistAgent,
    'git-master': gitMasterAgent,
    'code-simplifier': codeSimplifierAgent,

    // Coordination
    critic: criticAgent,
    'deep-executor': deepExecutorAgent,
    'document-specialist': documentSpecialistAgent
  };

  // 应用覆盖配置
  // 返回格式化的 Agent 定义
}
```

#### 4.1.3 Agent Prompt 加载

Agent 的提示词存储在 `/agents/*.md` 文件中，通过 `loadAgentPrompt()` 动态加载：

```typescript
// src/agents/utils.ts
export function loadAgentPrompt(name: string): string {
  // 从 agents/${name}.md 读取 prompt 内容
  // 支持开发环境和生产环境的不同路径
}
```

**设计意图**：将 prompt 与代码分离，便于维护和更新。

### 4.2 Hooks 系统

#### 4.2.1 Hooks 架构概览

```
Claude Code Hook Events
        │
        ▼
┌───────────────────────────────────────┐
│          Shell Scripts (.mjs)          │
│   keyword-detector.mjs                 │
│   session-start.mjs                    │
│   pre-tool-use.mjs                     │
│   post-tool-use.mjs                    │
│   persistent-mode.mjs                  │
│   stop-continuation.mjs                │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│      TypeScript Bridge (bridge.ts)     │
│   processHook(input) → output          │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│         Hook Modules (30+)             │
│   ralph/      - Ralph 持久化模式       │
│   autopilot/  - 自动驾驶模式           │
│   ultrawork/  - 最大并行模式           │
│   ultraqa/    - QA 循环工作流          │
│   recovery/   - 错误恢复               │
│   notepad/    - 压缩弹性内存           │
│   learner/    - 技能学习               │
│   ...                                  │
└───────────────────────────────────────┘
```

#### 4.2.2 主要 Hook 模块

**1. Ralph Hook（持久化循环）**

```typescript
// src/hooks/ralph/index.ts
export {
  // Loop
  createRalphLoopHook,
  readRalphState,
  writeRalphState,
  clearRalphState,
  incrementRalphIteration,

  // PRD Integration
  hasPrd,
  getPrdCompletionStatus,
  recordStoryProgress,
  shouldCompleteByPrd,

  // Progress (Memory Persistence)
  readProgress,
  appendProgress,
  addPattern,
  getPatterns,

  // Verifier (Architect Verification)
  startVerification,
  recordArchitectFeedback,
  getArchitectVerificationPrompt,
};
```

**设计意图**：Ralph 模式实现了一个持续执行的循环，直到任务完成：
- **Loop**：循环控制，迭代计数
- **PRD**：产品需求文档集成，追踪用户故事
- **Progress**：进度记录，模式学习
- **Verifier**：使用 architect Agent 验证完成度

**2. Autopilot Hook（自动驾驶）**

```typescript
// src/hooks/autopilot/index.ts
export {
  readAutopilotState,
  writeAutopilotState,
  initAutopilot,
  transitionPhase,          // 阶段转换
  incrementAgentCount,
  updateExpansion,          // 扩展阶段
  updatePlanning,           // 计划阶段
  updateExecution,          // 执行阶段
  updateQA,                 // QA 阶段
  updateValidation,         // 验证阶段
  transitionRalphToUltraQA,
  transitionUltraQAToValidation,
  transitionToComplete,
  transitionToFailed,
  getPhasePrompt,
  formatValidationResults,
  cancelAutopilot,
  resumeAutopilot,
};
```

**阶段流程**：
```
expansion → planning → execution → qa → validation → complete/failed
```

**3. Recovery Hook（错误恢复）**

```typescript
// src/hooks/recovery/index.ts
export {
  createRecoveryHook,
  handleRecovery,
  detectRecoverableError,

  // Context Window Limit Recovery
  handleContextWindowRecovery,
  detectContextLimitError,
  parseContextLimitError,

  // Edit Error Recovery
  handleEditErrorRecovery,
  detectEditError,
  processEditOutput,

  // Session Recovery
  handleSessionRecovery,
  detectSessionErrorType,
  isRecoverableError,
};
```

**恢复策略**：
- **上下文窗口限制**：检测 token 限制错误，触发压缩
- **编辑错误**：检测编辑失败，自动重试
- **会话错误**：检测可恢复的会话错误

**4. Notepad Hook（压缩弹性内存）**

```typescript
// src/hooks/notepad/index.ts
export {
  initNotepad,
  readNotepad,
  getPriorityContext,      // 优先上下文（启动时加载）
  getWorkingMemory,        // 工作记忆（时间戳，7天自动清理）
  getManualSection,        // 手动部分（永久保留）
  setPriorityContext,
  addWorkingMemoryEntry,
  addManualEntry,
  pruneOldEntries,
  formatNotepadContext,
};
```

**存储位置**：`{worktree}/.omc/notepad.md`

**5. Learner Hook（技能学习）**

```typescript
// src/hooks/learner/index.ts
export {
  createLearnedSkillsHook,
  processMessageForSkills,
  isLearnerEnabled,
  getAllSkills,
  findMatchingSkills,
  parseSkillFile,
  writeSkill,
  detectExtractableMoment,   // 检测可提取的学习时刻
  shouldPromptExtraction,
  generateExtractionPrompt,
  promoteLearning,           // 晋升学习为持久技能
};
```

**设计意图**：从对话中自动提取可复用的技能模式。

#### 4.2.3 Mode Registry（模式注册表）

```typescript
// src/hooks/mode-registry/index.ts
export {
  MODE_CONFIGS,              // 模式配置
  getStateDir,
  getStateFilePath,
  clearModeState,
  hasModeState,
  getActiveModes,
  isModeActive,
  getActiveExclusiveMode,
  canStartMode,
  getAllModeStatuses,
  type ExecutionMode,
  type ModeConfig,
};

// 8种执行模式
const EXECUTION_MODES = [
  'autopilot', 'ultrapilot', 'swarm', 'pipeline',
  'team', 'ralph', 'ultrawork', 'ultraqa'
];
```

**状态存储**：`{worktree}/.omc/state/{mode}-state.json`

### 4.3 MCP 服务器

#### 4.3.1 OMC Tools Server

```typescript
// src/mcp/omc-tools-server.ts
export const omcToolsServer = createSdkMcpServer({
  name: "t",
  version: "1.0.0",
  tools: sdkTools  // 聚合所有自定义工具
});

// 工具分类
const allTools: ToolDef[] = [
  ...tagCategory(lspTools, TOOL_CATEGORIES.LSP),       // LSP 工具
  ...tagCategory(astTools, TOOL_CATEGORIES.AST),       // AST 工具
  { ...pythonReplTool, category: TOOL_CATEGORIES.PYTHON },  // Python REPL
  ...tagCategory(skillsTools, TOOL_CATEGORIES.SKILLS), // 技能工具
  ...tagCategory(stateTools, TOOL_CATEGORIES.STATE),   // 状态工具
  ...tagCategory(notepadTools, TOOL_CATEGORIES.NOTEPAD),     // 记事本
  ...tagCategory(memoryTools, TOOL_CATEGORIES.MEMORY), // 项目内存
  ...tagCategory(traceTools, TOOL_CATEGORIES.TRACE),   // 追踪工具
];
```

**工具命名**：`mcp__t__<tool_name>`

#### 4.3.2 状态管理工具

```typescript
// src/tools/state-tools.ts
export const stateTools = [
  stateReadTool,        // state_read: 读取模式状态
  stateWriteTool,       // state_write: 写入模式状态
  stateClearTool,       // state_clear: 清除模式状态
  stateListActiveTool,  // state_list_active: 列出活跃模式
  stateGetStatusTool,   // state_get_status: 获取详细状态
];
```

**使用示例**：
```typescript
// 读取 ralph 模式状态
await state_read({ mode: 'ralph', session_id: 'abc123' });

// 写入 autopilot 状态
await state_write({
  mode: 'autopilot',
  active: true,
  current_phase: 'execution',
  task_description: 'Implement auth module',
  session_id: 'abc123'
});
```

#### 4.3.3 外部 AI 提供商

**Codex Server**（OpenAI gpt-5.3-codex）：
```typescript
// src/mcp/codex-server.ts
export const codexMcpServer = createSdkMcpServer({
  name: "x",
  tools: [
    ask_codex,           // 代码分析、规划验证、审查
    check_job_status,    // 检查后台任务状态
    wait_for_job,        // 等待任务完成
    kill_job,            // 终止任务
    list_jobs,           // 列出所有任务
  ]
});
```

**Gemini Server**（Google gemini-3-pro-preview）：
```typescript
// src/mcp/gemini-server.ts
export const geminiMcpServer = createSdkMcpServer({
  name: "g",
  tools: [
    ask_gemini,          // UI/UX 设计审查、文档、大上下文任务
    // ... 同样的 job 管理工具
  ]
});
```

### 4.4 Team 协调系统

#### 4.4.1 Unified Team View

```typescript
// src/team/unified-team.ts
export interface UnifiedTeamMember {
  name: string;
  agentId: string;
  backend: WorkerBackend;         // 'claude-native' | 'mcp-codex' | 'mcp-gemini'
  model: string;
  capabilities: WorkerCapability[];
  joinedAt: number;
  status: 'active' | 'idle' | 'dead' | 'quarantined' | 'unknown';
  currentTaskId: string | null;
}

export function getTeamMembers(teamName: string, workingDirectory: string): UnifiedTeamMember[] {
  // 1. 从 Claude 原生团队配置读取成员
  // 2. 从 MCP shadow registry 读取 worker
  // 3. 合并两个来源，提供统一视图
}
```

#### 4.4.2 Team Pipeline 流程

```
team-plan → team-prd → team-exec → team-verify → team-fix (loop)
```

**阶段路由**：

| 阶段 | 使用 Agent |
|------|-----------|
| `team-plan` | explore (haiku) + planner (opus) |
| `team-prd` | analyst (opus) + product-manager |
| `team-exec` | executor (sonnet) + designer + build-fixer + writer |
| `team-verify` | verifier (sonnet) + security-reviewer + code-reviewer |
| `team-fix` | executor / build-fixer / debugger |

### 4.5 状态管理

#### 4.5.1 Worktree 路径管理

```typescript
// src/lib/worktree-paths.ts
export function getWorktreeRoot(): string;
export function resolveStatePath(mode: string, root?: string): string;
export function ensureOmcDir(subdir: string, root?: string): string;
export function resolveSessionStatePath(mode: string, sessionId: string, root?: string): string;
export function listSessionIds(root?: string): string[];
```

**路径结构**：
```
{worktree}/.omc/
├── state/
│   ├── {mode}-state.json           # Legacy (无 session)
│   └── sessions/{sessionId}/
│       └── {mode}-state.json       # Session-scoped
├── notepad.md
├── project-memory.json
├── plans/
└── research/
```

#### 4.5.2 原子写入

```typescript
// src/lib/atomic-write.ts
export function atomicWriteJsonSync(filePath: string, data: unknown): void {
  // 1. 写入临时文件
  // 2. 原子重命名
  // 防止并发写入导致的数据损坏
}
```

### 4.6 Features 模块

#### 4.6.1 Magic Keywords

```typescript
// src/features/magic-keywords.ts
const builtInMagicKeywords: MagicKeyword[] = [
  ultraworkEnhancement,   // 触发词: ultrawork, ulw, uw
  searchEnhancement,      // 触发词: search, find, locate, ...
  analyzeEnhancement,     // 触发词: analyze, investigate, examine, ...
  ultrathinkEnhancement,  // 触发词: ultrathink, think, reason, ponder
];

export function createMagicKeywordProcessor(config?: PluginConfig['magicKeywords']):
  (prompt: string) => string {
  // 返回一个处理函数，检测关键词并增强 prompt
}
```

**Ultrawork 模式增强**：
- 激活最大性能模式
- 强制并行 Agent 编排
- 要求严格的验证保证
- 零容忍失败策略

#### 4.6.2 Background Tasks

```typescript
// src/features/background-tasks.ts
export const LONG_RUNNING_PATTERNS = [
  'npm install', 'yarn install', 'pnpm install',
  'npm run build', 'npm test', 'pytest',
  'git clone', 'docker build', ...
];

export const BLOCKING_PATTERNS = [
  'rm -rf', 'git push', 'npm publish', ...
];

export function shouldRunInBackground(
  command: string,
  runningCount: number,
  maxTasks: number
): TaskExecutionDecision {
  // 决定命令是否应该在后台运行
}
```

#### 4.6.3 Continuation Enforcement

```typescript
// src/features/continuation-enforcement.ts
export const continuationSystemPromptAddition = `
## CRITICAL RULES - VIOLATION IS FAILURE

1. **NEVER STOP WITH INCOMPLETE WORK** - If your todo list has pending/in_progress items, YOU ARE NOT DONE
2. **ALWAYS VERIFY** - Check your todo list before ANY attempt to conclude
3. **NO PREMATURE CONCLUSIONS** - Saying "I've completed the task" without verification is a LIE
...
`;
```

---

## 5. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户请求                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OMC Orchestrator                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                    │
│  │ Magic Keywords│  │ Delegation    │  │ Model Routing │                    │
│  │ Detection     │  │ Routing       │  │ (haiku→opus)  │                    │
│  └───────────────┘  └───────────────┘  └───────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Execution Modes                                     │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │  Team   │ │ Autopilot│ │ Ralph  │ │Ultrawork│ │Pipeline│ │ UltraQA  │  │
│  └─────────┘ └──────────┘ └────────┘ └─────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Agent System                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Build/Analysis Lane                                                  │   │
│  │ [explore] → [analyst] → [planner] → [architect] → [executor]       │   │
│  │ [debugger] → [verifier]                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Review Lane                                                          │   │
│  │ [quality-reviewer] [security-reviewer] [code-reviewer]              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Domain Specialists                                                   │   │
│  │ [test-engineer] [build-fixer] [designer] [writer] [qa-tester]      │   │
│  │ [scientist] [git-master] [document-specialist]                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Tool Layer                                        │
│  ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌─────────┐            │
│  │   LSP   │ │   AST   │ │ Python    │ │  State  │ │ Notepad │            │
│  │  Tools  │ │  Tools  │ │   REPL    │ │  Tools  │ │  Tools  │            │
│  └─────────┘ └─────────┘ └───────────┘ └─────────┘ └─────────┘            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ MCP Servers (via Claude Agent SDK)                                   │   │
│  │ [omc-tools-server(t)] [codex-server(x)] [gemini-server(g)]          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          State Persistence                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ {worktree}/.omc/                                                      │  │
│  │ ├── state/{mode}-state.json                                          │  │
│  │ ├── state/sessions/{id}/{mode}-state.json                           │  │
│  │ ├── notepad.md                                                        │  │
│  │ ├── project-memory.json                                              │  │
│  │ ├── plans/                                                            │  │
│  │ └── research/                                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 关键流程分析

### 6.1 自动驾驶模式 (Autopilot) 流程

```
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐
│  START   │───▶│ expansion │───▶│ planning  │───▶│execution │
└──────────┘    └───────────┘    └───────────┘    └──────────┘
                                        │
                                        ▼
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐
│ COMPLETE │◀───│ validation│◀───│    qa     │◀───┤          │
└──────────┘    └───────────┘    └───────────┘    └──────────┘
                     │
                     ▼ (fail)
              ┌───────────┐
              │   fix     │───▶ back to execution
              └───────────┘
```

**阶段说明**：

1. **Expansion**：需求扩展、上下文收集
2. **Planning**：任务分解、计划创建
3. **Execution**：代码实现、功能开发
4. **QA**：测试验证
5. **Validation**：完成验证（使用 verifier Agent）
6. **Fix**（条件性）：修复发现的问题

### 6.2 Ralph 持久化循环

```typescript
// Ralph 循环的核心逻辑
while (active && iteration < max_iterations) {
  // 1. 读取当前状态
  const state = readRalphState();

  // 2. 检查 PRD 完成状态
  if (shouldCompleteByPrd()) {
    transitionToComplete();
    break;
  }

  // 3. 执行任务
  // ...

  // 4. 验证完成度
  const verification = await startVerification();
  if (verification.approved) {
    transitionToComplete();
    break;
  }

  // 5. 记录进度
  recordStoryProgress();
  incrementRalphIteration();
}
```

### 6.3 Hook 执行流程

```
Claude Code Event (e.g., PreToolUse)
        │
        ▼
┌───────────────────────────────────────┐
│   Shell Script (.mjs)                 │
│   - 读取 stdin 获取 hook 输入         │
│   - 调用 Node.js bridge               │
│   - 将结果写入 stdout                 │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│   TypeScript Bridge (processHook)     │
│   - 解析 JSON 输入                    │
│   - 路由到对应的 hook handler         │
│   - 序列化结果为 JSON                 │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│   Hook Handler (e.g., keywordDetector)│
│   - 执行业务逻辑                      │
│   - 返回 HookOutput                   │
└───────────────────────────────────────┘
```

### 6.4 Agent 委托流程

```
用户请求: "ultrawork 实现用户认证模块"
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ Magic Keyword Detection                                    │
│ - 检测到 "ultrawork"                                       │
│ - 注入 Ultrawork 模式增强指令                              │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ 任务分解与委托                                             │
│ 1. Task(explore): 搜索现有认证模式                         │
│ 2. Task(analyst): 分析需求和约束                           │
│ 3. Task(planner): 创建实施计划                             │
│ 4. Task(executor): 实现认证模块                            │
│ 5. Task(test-engineer): 编写测试                           │
│ 6. Task(verifier): 验证完成度                              │
└───────────────────────────────────────────────────────────┘
```

---

## 7. 设计模式与最佳实践

### 7.1 设计模式

#### 7.1.1 策略模式（Model Routing）

根据任务特征选择不同的模型策略：

```typescript
// 智能模型路由
function selectModel(taskComplexity: 'low' | 'medium' | 'high'): ModelType {
  switch (taskComplexity) {
    case 'low': return 'haiku';     // 快速、低成本
    case 'medium': return 'sonnet'; // 平衡
    case 'high': return 'opus';     // 最强能力
  }
}
```

#### 7.1.2 责任链模式（Hook Processing）

多个 Hook 按顺序处理请求：

```typescript
// Hook 链式处理
for (const hook of hooks) {
  const result = await hook.process(input);
  if (!result.continue) {
    return result;  // 链中断
  }
  input = result.modifiedInput || input;
}
```

#### 7.1.3 注册表模式（Agent Registry）

集中管理 Agent 定义：

```typescript
// Agent 注册表
const agentRegistry = {
  'architect': architectAgent,
  'planner': plannerAgent,
  // ...
};

function getAgent(name: string): AgentConfig {
  return agentRegistry[name];
}
```

#### 7.1.4 状态机模式（Mode Transitions）

模式状态转换：

```typescript
// Autopilot 状态机
const transitions = {
  'expansion': ['planning'],
  'planning': ['execution'],
  'execution': ['qa'],
  'qa': ['validation'],
  'validation': ['complete', 'fix'],
  'fix': ['execution']
};
```

### 7.2 最佳实践

#### 7.2.1 文件组织

```
src/
├── {module}/
│   ├── index.ts        # 模块入口，导出公共 API
│   ├── types.ts        # 类型定义
│   ├── utils.ts        # 工具函数
│   └── {submodule}/    # 子模块
```

#### 7.2.2 错误处理

```typescript
// 优雅降级
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  // 记录错误但不中断
  console.error(`Non-fatal error: ${error.message}`);
  return { success: false, error: error.message };
}
```

#### 7.2.3 状态隔离

```typescript
// Session-scoped 状态
// 避免并行会话间的状态污染
const statePath = sessionId
  ? resolveSessionStatePath(mode, sessionId, root)
  : resolveStatePath(mode, root);
```

#### 7.2.4 原子操作

```typescript
// 原子写入防止并发问题
export function atomicWriteJsonSync(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2));
  renameSync(tempPath, filePath);  // 原子操作
}
```

---

## 总结

**oh-my-claudecode** 是一个设计精良的多智能体编排系统，其核心亮点包括：

1. **模块化架构**：清晰的模块边界，职责分离
2. **可扩展的 Hook 系统**：30+ 个 Hook 模块覆盖各种场景
3. **智能模型路由**：根据任务复杂度自动选择模型
4. **持久化执行**：支持多种执行模式（ralph、autopilot、team）
5. **状态管理**：Session-scoped 隔离，原子操作
6. **MCP 集成**：支持 Codex、Gemini 等外部 AI 提供商

通过本文档，你应该能够：
- 理解项目的整体架构
- 了解各模块的职责与协作关系
- 掌握关键流程的执行逻辑
- 为后续开发或定制提供参考

---

*文档版本: 4.3.3 | 生成日期: 2026-02-23*
