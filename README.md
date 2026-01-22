# sharkTranslate README

## Features

- **选中内容替换**：编辑器中可以选择需要翻译的中文右键 `oneSharkReplace` 将所选内容快捷翻译成所配置的shark
- **全文替换**：编辑器中可以选择需要翻译的中文右键 `allSharkReplace` 将当前文件中文快捷翻译成所配置的shark
- **导出项目中文**：在文件资源管理器中右键选择 `导出项目中的中文到Excel(默认扫描src目录)` 可以扫描整个项目，按 pageId 分组导出所有中文到 Excel
- **导出文件/文件夹中文**：在文件资源管理器中右键选择文件或文件夹，选择 `导出当前文件/文件夹中的中文到Excel` 可以导出指定文件或文件夹中的中文

## Requirements

### 配置说明

在 vscode `settings.json` 中配置以下选项：

- `sharkTranslate.sharkPrefix`：shark替换时需要删除的前缀（数组类型）
- `sharkTranslate.sharkStoreVar`：shark存储变量名（默认：language）
- `sharkTranslate.scanSrcPath`：扫描中文的源目录路径，相对于项目根目录（默认：src）

配置示例：
```json
{
  "sharkTranslate.sharkPrefix": [
    "key.adresource"
  ],
  "sharkTranslate.sharkStoreVar": "language",
  "sharkTranslate.scanSrcPath": "src"
}
```

### 使用要求

- 需要在项目根目录下新建名称为 `shark.xlsx` 文档，并导入shark平台下载的数据，供插件读取使用
- 上传的shark数据默认为公司shark平台提供的shark模板文档格式

## 功能说明

### 1. 选中内容替换
在编辑器中选中中文文本，右键选择 `oneSharkReplace`，插件会查找对应的 shark 配置并替换。

### 2. 全文替换
在编辑器中右键选择 `allSharkReplace`，插件会扫描当前文件中的所有中文（排除注释），并替换为对应的 shark 配置。

### 3. 导出项目中文（按 pageId 分组）
- 在文件资源管理器中右键选择任意位置
- 选择 `导出项目中的中文到Excel(默认扫描src目录)`
- 插件会扫描配置的源目录（默认 `src`），查找所有文件中的中文
- 通过查找 Controller 文件中的 `pageId` 和 `pageName` 进行分组
- 生成 Excel 文件，包含三列：pageId、pageName、中文

### 4. 导出文件/文件夹中文
- 在文件资源管理器中右键选择文件或文件夹
- 选择 `导出当前文件/文件夹中的中文到Excel`
- 插件会扫描选中的文件或文件夹中的所有中文
- 生成 Excel 文件，包含两列：filePath、中文
