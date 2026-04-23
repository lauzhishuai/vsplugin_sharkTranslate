# SharkTranslate

SharkTranslate 是一个 VS Code 国际化插件，当前聚焦 3 类能力：

1. 中文扫描导出：`exportChineseByPage`
2. AI 批量翻译导出：`batchTranslateChineseToExcel`
3. Shark 替换：`oneSharkReplace` / `allSharkReplace`

---

## 命令清单

| 命令 ID | 菜单名称 | 说明 |
| --- | --- | --- |
| `sharkTranslate.exportChineseByPage` | Trip中文定域巡检 | 扫描右键文件/文件夹中的中文并导出 |
| `sharkTranslate.batchTranslateChineseToExcel` | Trip AI批译 | 扫描右键文件/文件夹中的中文并批量翻译导出 |
| `sharkTranslate.oneSharkReplace` | Trip Shark点替 | 替换当前选中中文 |
| `sharkTranslate.allSharkReplace` | Trip Shark全替 | 替换当前文件中可匹配中文 |

> `batchTranslateChineseToExcel` 需要在资源管理器中右键文件或文件夹触发；命令面板直接执行不会启动扫描。

---

## 配置项

在 VS Code 设置中（或 `settings.json`）可配置：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sharkTranslate.sharkStoreVar` | string | `language` | 替换后的国际化变量名 |
| `sharkTranslate.sharkPrefix` | string[] | `[]` | 替换时可移除的 key 前缀 |
| `sharkTranslate.scanSrcPath` | string | `src` | 保留配置，当前主要命令不强依赖该值 |
| `sharkTranslate.scanExcludePatterns` | string[] | `[]` | 扫描排除规则（glob） |
| `sharkTranslate.realtimeTranslateApiUrl` | string | 见 `package.json` 默认值 | AI 网关地址（当前按 HTTP 调用） |
| `sharkTranslate.realtimeTranslateApiKey` | string | `""` | AI 鉴权 Token |
| `sharkTranslate.realtimeTranslateModel` | string | 见 `package.json` 默认值 | AI 模型名 |
| `sharkTranslate.translateTargetLanguages` | string[] | `["zh-HK","en-US"]` | 批量翻译目标语种（可多选） |
| `sharkTranslate.batchTranslateExcelFile` | string | `batch_translate_by_page.xlsx` | 批量翻译导出文件名（项目根目录） |

`translateTargetLanguages` 支持值：
- `zh-HK`（繁体中文，OpenCC 本地生成）
- `en-US`
- `ja-JP`
- `ko-KR`
- `th-TH`

---

## 一、中文扫描导出

### `exportChineseByPage`

- 入口：资源管理器右键文件或文件夹 -> `Trip中文定域巡检`
- 输出：`chinese_by_current_file.xlsx`

导出列：
- `pageId`
- `pageName`
- `zh-CN`

说明：
- `pageId` 会从上层 Controller 解析；若未找到则为空。
- 识别规则与翻译命令一致：提取引号中的中文，自动排除注释。

---

## 二、AI 批量翻译导出

### `batchTranslateChineseToExcel`

- 入口：资源管理器右键文件或文件夹 -> `Trip AI批译`
- 输出：`sharkTranslate.batchTranslateExcelFile`（默认 `batch_translate_by_page.xlsx`）
- 支持取消：进度条可取消；取消后会尽量保留已翻译结果并落盘

导出列顺序：
- `TransKey`
- `pageId`
- `Origin`
- `zh-CN`
- 动态语种列（来自 `translateTargetLanguages`）

`TransKey` 规则：
- 有有效数字 `pageId`：`key.{pageId}.{slug}`
- 无有效 `pageId`：`key.common.{slug}`

---

## 三、Shark 替换

### `oneSharkReplace`

- 入口：编辑器右键 -> `Trip Shark点替`
- 行为：将当前选中中文替换为对应 `TransKey` 引用

### `allSharkReplace`

- 入口：编辑器右键 -> `Trip Shark全替`
- 行为：批量替换当前文件中可匹配中文（自动排除注释）

替换读取翻译表优先级（项目根目录）：
1. `shark.xlsx`
2. `batch_translate_by_page.xlsx`
3. `realtime_translate.xlsx`

表中至少需要：
- `TransKey`
- `Origin`（或 `zh-CN`）

---

## 扫描与过滤规则

- 文件类型：`.ts`、`.tsx`、`.js`、`.jsx`、`.vue`
- 自动排除目录：`node_modules`、`dist`、`build`、`.git`、`out`
- 自动排除文件：`*.d.ts`、`*.test.ts(x)`、`*.spec.ts(x)`
- 叠加排除：`sharkTranslate.scanExcludePatterns`

---

## 推荐使用流程

1. 右键目标目录执行 `Trip中文定域巡检`，确认中文分布
2. 右键目标目录执行 `Trip AI批译`，生成多语种翻译表
3. 回到代码中执行 `Trip Shark点替` 或 `Trip Shark全替`
