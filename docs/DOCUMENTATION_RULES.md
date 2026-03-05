# 文档治理规则

**适用对象**：所有开发者、AI 工具（Claude Code 等）
**更新日期**：2026-03-05

---

## 核心原则

本项目以 `docs/` 目录作为唯一文档来源（Single Source of Truth）。任何文档必须写入 `docs/` 对应子目录，且以当前代码实际状态为准，不允许保留历史规划内容。

---

## 规则一：所有文档必须放在 `docs/`

禁止在以下位置创建 Markdown 文件：
- 项目根目录（`.md` 文件）
- `src/` 目录
- `scripts/` 目录
- `tests/` 目录
- `tools/` 目录

**唯一例外**（允许在根目录存在）：
- `README.md`
- `CLAUDE.md`

---

## 规则二：文档按类型存放

| 文档类型 | 目标目录 | 示例 |
|---------|---------|------|
| 系统架构、技术设计 | `docs/architecture/` | system-architecture.md |
| 数据库 Schema、ER 图 | `docs/database/` | 数据库设计.md |
| 项目说明、快速开始 | `docs/project/` | 项目概述.md |
| 技术报告、审计报告 | `docs/reports/` | 技术审计报告.md |

---

## 规则三：禁止创建开发日志文件

以下类型的文件不允许提交到版本库：

- `day1-complete.md`、`day2-complete.md` 等每日完成报告
- `daily-report.md`、`dev.log` 等自动生成的日志
- 任何仅记录「今天做了什么」的临时文件

如需记录开发过程，使用 Git commit message 或 GitHub Issues。

---

## 规则四：文档统一使用中文

- 文档标题：中文
- 文档正文：中文
- 代码块、命令行示例：保持原样（英文）
- 变量名、文件路径：保持原样（英文）

---

## 规则五：文档内容以当前实际代码为准

- 禁止在文档中保留「计划」「待完成」等未实现功能的描述，未实现功能在文档中明确标注 `⚠️ 待实现`
- 禁止保留历史开发计划（7天计划、Day N 任务等）
- 架构文档反映当前代码的实际结构，不反映设计蓝图

---

## 规则六：文档更新与代码同步

修改以下文件时，对应文档必须同步更新：

| 修改代码 | 需更新文档 |
|---------|-----------|
| 数据库 Schema | `docs/database/数据库设计.md` |
| 新增/移除 API 方法 | `docs/architecture/数据层API文档.md` |
| 架构重大变更 | `docs/architecture/system-architecture.md` |
| 新增环境变量 | `docs/project/项目概述.md` + `.env.example` |

---

## 规则七：禁止创建备份和临时文件

禁止在 `docs/` 目录创建：
- `*.backup`
- `*-old.md`
- `*-v1.md`、`*-v2.md` 等版本副本

版本历史通过 Git 管理，不通过文件副本管理。

---

## 检查清单

提交 PR 前确认：

- [ ] 新文档是否放在了正确的 `docs/` 子目录？
- [ ] 根目录是否有新增的 `.md` 文件（除 README.md / CLAUDE.md 外）？
- [ ] 文档内容是否与当前代码一致（无过时的计划或未实现功能描述）？
- [ ] 是否有开发日志类文件需要删除？
- [ ] 文档是否使用中文？

---

## 违规示例

```
# 错误示例 1：在根目录创建文档
/daily-report.md          ❌
/DAY7_COMPLETED.md        ❌

# 错误示例 2：在 src/ 下创建文档
/src/TODO.md              ❌

# 错误示例 3：创建开发日志
/docs/reports/day8-complete.md   ❌

# 错误示例 4：创建备份文档
/docs/architecture/system-architecture-old.md  ❌
```

```
# 正确示例
/docs/architecture/system-architecture.md  ✅
/docs/reports/技术审计报告.md              ✅
/docs/database/数据库设计.md              ✅
```
