# ciku-skill v4.0.0-lite

公考成语/实词**词条型** PDF → 微信小程序《成语辨析记忆》v2.1 标准 JSON 题库。

**轻量版**：仓库只有 5 个文件、零依赖——不需要 Python、不需要 pip、没有任何 npm 包。PDF 解析由 Agent 的文本/视觉（多模态）能力直接完成，本仓库只提供**规格**（SKILL.md + schema.json）和一个**可选**的零依赖 Node 质检脚本。

## 安装

```bash
git clone https://github.com/Acherzyc/ciku-skill.git .agents/skills/ciku-skill
```

装完即用，无任何安装步骤。

## 使用

把下面的指令发给任意 Agent（Claude Code / DeepSeek Harness / Cursor / Dify 等）：

```
请安装并加载 Skill：git clone https://github.com/Acherzyc/ciku-skill.git .agents/skills/ciku-skill
然后阅读 .agents/skills/ciku-skill/SKILL.md，按其中「零依赖多模态工作流」处理我上传的公考成语/实词词条型 PDF，
输出小程序 v2.1 标准 deck.json。
```

## 质检（可选，零依赖）

```bash
node scripts/validate_deck.js deck.json
```

纯 Node 标准库实现（无 npm 包、无 Python），覆盖：word 去重/OCR 粘连、pinyin 声调、tone/sem.intensity 枚举、shortDef/mnemonic 限长、example 单条与词原形、confusions ≤4、synonyms 黑名单与同组雷同、groupWords 闭环、cardCount 一致、fullDef 禁用。exit 0 = 可交付。

## 文件清单

| 文件 | 说明 |
|---|---|
| `SKILL.md` | 提取规格：准入判定、多模态工作流、版面噪声清洗规则（实战沉淀）、字段映射、AI 补齐规范、八项质检清单 |
| `references/schema.json` | v2.1 字段级 JSON Schema（与校验器同口径） |
| `scripts/validate_deck.js` | 零依赖 Node 质检器（唯一脚本） |
| `README.md` | 本文件 |
| `.gitignore` | — |

## 从 v3.x 迁移到 v4-lite 说明

v3.x 的「状态机流水线」（`ciku_pipeline.py` prepare→review→resolve→finalize→verify、`extract_pdf.py`、`audit_deck.py`、rapidocr 等 Python 依赖）已整体移除：

- 确定性脚本提取对复杂双栏/串行版面的噪声率高（实战实测 570 候选中 167 个为误词条），仍需 Agent 逐条复核；改为 Agent 直接解析并未减少复核工作量，却引入了繁重的环境配置。
- v3.x 已验证有效的知识（噪声清洗规则、字段规范、生成顺序、审查口径）全部沉淀进 `SKILL.md`，由多模态 Agent 直接执行。
- 若确需流水线式确定性提取，可回退使用 v3.1.0 历史版本。
