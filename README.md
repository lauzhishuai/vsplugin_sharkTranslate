# SharkTranslate

SharkTranslate 是一个 VS Code 国际化辅助插件，覆盖三条主链路：

1. 扫描中文并导出结构化 Excel  
2. AI 翻译（单条 / 批量）并落表  
3. 将代码中的中文替换为 `TransKey`

---

## 配置项

在 VS Code 设置中（或 `settings.json`）可配置：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sharkTranslate.sharkStoreVar` | string | `language` | 替换后国际化变量名 |
| `sharkTranslate.sharkPrefix` | string[] | `[]` | 替换时可自动移除的 key 前缀 |
| `sharkTranslate.scanSrcPath` | string | `src` | `exportChineseByPageId` 默认扫描目录 |
| `sharkTranslate.scanExcludePatterns` | string[] | `[]` | `exportChineseByPageId` 排除规则（glob） |
| `sharkTranslate.realtimeTranslateApiUrl` | string | 见插件默认值 | AI 翻译网关地址（当前按 HTTP 调用） |
| `sharkTranslate.realtimeTranslateApiKey` | string | `""` | AI 翻译鉴权 token |
| `sharkTranslate.realtimeTranslateModel` | string | 见插件默认值 | AI 翻译模型名 |
| `sharkTranslate.translateTargetLanguages` | string[] | `["zh-HK","en-US"]` | AI 翻译目标语种（可多选） |
| `sharkTranslate.realtimeTranslateExcelFile` | string | `realtime_translate.xlsx` | 单条 AI 翻译输出文件名 |

`translateTargetLanguages` 支持值：
- `zh-HK`（繁体中文，使用 OpenCC 本地生成）
- `en-US`
- `ja-JP`
- `ko-KR`
- `th-TH`

---

## 一、扫描中文能力

本能力用于“先采集中文资产，再进入翻译或治理流程”。

### 1) `exportChineseByPageId`（全域巡检）

- 命令：`sharkTranslate.exportChineseByPageId`
- 用途：扫描配置目录（默认 `src`）并按 `pageId` 分组导出中文
- 输出文件：`chinese_by_pageId.xlsx`

**步骤**
1. 在资源管理器任意位置右键  
2. 执行“Trip中文全域巡检(默认扫描src目录)”  
3. 等待扫描完成，打开导出的 Excel

**输出列**
- `pageId`
- `pageName`
- `Origin`
- `zh-CN`
- `zh-HK`
- `TransKey`

### 2) `exportChineseByPage`（定域巡检）

- 命令：`sharkTranslate.exportChineseByPage`
- 用途：扫描当前文件或文件夹并导出中文
- 输出文件：`chinese_by_current_file.xlsx`

**步骤**
1. 在目标文件或文件夹上右键  
2. 执行“Trip中文定域巡检”  
3. 等待扫描完成，打开导出的 Excel

**输出列**
- `pageId`
- `pageName`
- `Origin`
- `zh-CN`
- `zh-HK`
- `TransKey`

---

## 二、AI 翻译能力

本能力用于“将中文直接翻译为多语言并写入标准翻译表”。

### 1) `translateSelectionToExcel`（单条闪译）

- 命令：`sharkTranslate.translateSelectionToExcel`
- 用途：选中一段中文后实时翻译并落 Excel
- 输出文件：`realtime_translate.xlsx`（或配置项指定文件名）

**步骤**
1. 在编辑器中选中中文  
2. 右键执行“Trip AI闪译(单条)”  
3. 确认翻译结果后写入 Excel

**输出列（动态）**
- 固定列：`Origin`、`zh-CN`、`TransKey`
- 动态列：按 `translateTargetLanguages` 追加（例如默认 `zh-HK`、`en-US`）

默认情况下，单条翻译的列为：
- `Origin`
- `zh-CN`
- `zh-HK`
- `en-US`
- `TransKey`

### 2) `batchTranslateChineseToExcel`（批量翻译）

- 命令：`sharkTranslate.batchTranslateChineseToExcel`
- 用途：扫描文件/文件夹中的中文并批量翻译后导出
- 输出文件：`batch_translate_by_page.xlsx`

**步骤**
1. 在目标文件或文件夹上右键  
2. 执行“Trip AI批译(批量)”  
3. 等待批量翻译完成并打开导出文件

**输出列（动态）**
- 固定列：`pageId`、`Origin`、`zh-CN`、`TransKey`
- 动态列：按 `translateTargetLanguages` 追加（例如默认 `zh-HK`、`en-US`）

默认情况下，批量翻译的列为：
- `pageId`
- `Origin`
- `zh-CN`
- `zh-HK`
- `en-US`
- `TransKey`

---

## 三、Shark 替换能力

本能力用于“将代码中的中文替换为国际化 key 引用”。

### 1) `oneSharkReplace`（点替）

- 命令：`sharkTranslate.oneSharkReplace`
- 用途：替换当前选中的单条中文

**步骤**
1. 在代码中选中中文  
2. 右键执行“Trip Shark点替”  
3. 选择确认后完成替换

### 2) `allSharkReplace`（全替）

- 命令：`sharkTranslate.allSharkReplace`
- 用途：批量替换当前文件中可匹配的中文（自动排除注释）

**步骤**
1. 打开目标文件  
2. 右键执行“Trip Shark全替”  
3. 插件按翻译表映射批量替换

### 替换读取的翻译表优先级

插件会在项目根目录按顺序尝试读取：

1. `shark.xlsx`
2. `batch_translate_by_page.xlsx`
3. `realtimeTranslateExcelFile`（配置项对应文件名）
4. `realtime_translate.xlsx`

要求至少包含：
- `TransKey`
- `Origin`（或 `zh-CN` 作为兼容来源）

---

## 识别与匹配规则

- 仅识别引号中的文本（单引号 / 双引号）
- 自动排除注释内容（`//`、`/* ... */`）
- 文件类型支持：`.ts`、`.tsx`、`.js`、`.jsx`、`.vue`
- `pageId` 通过向上查找 Controller 文件推断

---

## 常见说明

- 单条翻译使用 `realtime_translate.xlsx`（或你自定义的 `realtimeTranslateExcelFile`）
- 批量翻译使用 `batch_translate_by_page.xlsx`
- 若已存在单条翻译表，且你修改了 `translateTargetLanguages`，新旧表头可能不一致；建议新建一份翻译表或先备份后重建

---

## 建议使用流程

1. 先执行中文巡检（全域或定域）确认文案分布  
2. 用 AI 单条或批量翻译生成标准翻译表  
3. 在代码中执行点替 / 全替完成 key 化  
4. 需要时复用翻译表做增量维护
