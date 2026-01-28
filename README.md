# SharkTranslate

一个强大的 VSCode 扩展，帮助开发者快速将项目中的中文替换为 Shark 国际化配置，并支持批量导出中文内容到 Excel。

## ✨ Features

- **选中内容替换**：编辑器中可以选择需要翻译的中文右键 `oneSharkReplace` 将所选内容快捷翻译成所配置的shark
- **全文替换**：编辑器中可以选择需要翻译的中文右键 `allSharkReplace` 将当前文件中文快捷翻译成所配置的shark
- **导出项目中文（按 pageId 分组）**：扫描整个项目，自动查找 Controller 文件中的 pageId 和 pageName，按页面分组导出所有中文到 Excel
- **导出文件/文件夹中文**：支持右键选择文件或文件夹，导出其中的中文内容到 Excel
- **智能路径过滤**：支持配置扫描排除模式，灵活控制需要扫描的文件和目录

## 📋 Requirements

### 配置说明

在 VSCode `settings.json` 中配置以下选项：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sharkTranslate.sharkStoreVar` | string | `"language"` | shark存储变量名 |
| `sharkTranslate.sharkPrefix` | array | `[]` | shark替换时需要删除的前缀（数组类型） |
| `sharkTranslate.scanSrcPath` | string | `"src"` | 扫描中文的源目录路径，相对于项目根目录 |
| `sharkTranslate.scanExcludePatterns` | array | `[]` | 扫描时排除的文件或文件夹（glob 模式），仅对 `exportChineseByPageId` 命令生效 |

**配置示例：**
```json
{
 "sharkTranslate.sharkPrefix": [
      "key.adresource"
    ],
  "sharkTranslate.sharkStoreVar": "language",
  "sharkTranslate.scanSrcPath": "src",
  "sharkTranslate.scanExcludePatterns": [
    "**/components/**",
    "**/utils/helper.ts",
    "**/test/**",
    "**/mock/**"
  ]
}
```

**Glob 模式说明：**

- `**/components/**` - 排除所有 components 目录及其子目录
- `**/utils/helper.ts` - 排除特定的文件
- `**/*.test.ts` - 排除所有测试文件
- `**/mock/**` - 排除 mock 目录

### 使用要求

- 需要在项目根目录下新建名称为 `shark.xlsx` 文档，并导入shark平台下载的数据，供插件读取使用
- 上传的shark数据默认为公司shark平台提供的shark模板文档格式

## 🚀 功能说明

### 1. 选中内容替换

在编辑器中选中中文文本，右键选择 `oneSharkReplace`，插件会查找对应的 shark 配置并替换。

**使用场景：** 快速替换单个中文文本为对应的 shark 配置。

### 2. 全文替换

在编辑器中右键选择 `allSharkReplace`，插件会扫描当前文件中的所有中文（自动排除注释），并替换为对应的 shark 配置。

**使用场景：** 批量替换整个文件中的中文内容。

**智能特性：**

- ✅ 自动排除单行注释（`//`）和多行注释（`/* */`）
- ✅ 只匹配引号中包含中文的字符串
- ✅ 支持单引号和双引号

### 3. 导出项目中文（按 pageId 分组）

**功能特点：**

- 📁 扫描整个项目，自动查找所有文件中的中文
- 🔍 智能识别 Controller 文件中的 `pageId` 和 `pageName`
- 📊 按 pageId 分组，生成结构化的 Excel 文件
- ⚙️ 支持配置扫描路径和排除模式

**使用步骤：**

1. 在文件资源管理器中右键选择任意位置
2. 选择 `导出项目中的中文到Excel(默认扫描src目录)`
3. 插件会扫描配置的源目录（默认 `src`），查找所有文件中的中文
4. 通过查找 Controller 文件中的 `pageId` 和 `pageName` 进行分组
5. 生成 Excel 文件：`chinese_by_pageId.xlsx`

**Excel 文件格式：**

| pageId | pageName | 中文 |
| --- | --- | --- |
| 1001 | 首页, 主页 | 欢迎使用 |
| 1001 | 首页, 主页 | 点击登录 |
| 1002 | 商品列表 | 商品名称 |

**Controller 文件识别规则：**

- 支持文件名：`Controller.ts`、`controller.ts`、`LocalController.ts`、`localController.ts` 等
- 自动向上查找：从当前文件所在目录向上查找，直到找到包含 `pageId` 的 Controller 文件
- pageId 格式：`pageId = 数字` 或 `pageId: 数字`
- pageName 格式：`pageName = ['xxx', 'yyy']` 或 `pageName: ['xxx', 'yyy']`

### 4. 导出文件/文件夹中文

**使用步骤：**

1. 在文件资源管理器中右键选择文件或文件夹
2. 选择 `导出当前文件/文件夹中的中文到Excel`
3. 插件会扫描选中的文件或文件夹中的所有中文
4. 生成 Excel 文件：`chinese_by_current_file.xlsx`

**Excel 文件格式：**

| filePath | 中文 |
| --- | --- |
| src/pages/home/index.tsx | 欢迎使用 |
| src/pages/home/index.tsx | 点击登录 |
| src/components/Button.tsx | 确定 |

## ⚙️ 高级配置

### 扫描路径过滤

通过配置 `sharkTranslate.scanExcludePatterns`，可以灵活控制扫描范围，排除不需要扫描的文件和目录。

**示例配置：**
```json
{
  "sharkTranslate.scanExcludePatterns": [
    "**/components/**",      // 排除所有 components 目录
    "**/utils/**",           // 排除所有 utils 目录
    "**/*.test.ts",          // 排除所有测试文件
    "**/mock/**",            // 排除 mock 目录
    "**/node_modules/**"     // 排除 node_modules（默认已排除）
  ]
}
```

**默认排除项（无需配置）：**

- `node_modules`
- `dist`、`build`、`out`
- `.git`
- `*.d.ts`
- `*.test.ts`、`*.test.tsx`
- `*.spec.ts`、`*.spec.tsx`

## 📝 注意事项

1. **shark.xlsx 文件格式：** 必须包含 `Origin` 和 `TransKey` 两列
2. **中文匹配规则：** 只匹配引号中包含中文字符的字符串，自动排除注释
3. **pageId 查找：** 如果找不到对应的 Controller 文件，会使用文件相对路径作为标识
4. **文件类型支持：** `.ts`、`.tsx`、`.js`、`.jsx`、`.vue`

## 🔗 相关链接

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/)
- [Open VSX Registry](https://open-vsx.org/)
