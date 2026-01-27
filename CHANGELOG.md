# Change Log

All notable changes to the "sharkTranslate" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.7]

### Added
- 新增配置项 `sharkTranslate.scanExcludePatterns`：支持配置扫描排除模式（glob 模式）
  - 可以灵活排除不需要扫描的文件和目录
  - 仅对 `exportChineseByPageId` 命令生效
  - 支持 glob 模式，如 `**/components/**`、`**/*.test.ts` 等

### Improved
- 优化扫描性能，支持更灵活的路径过滤
- 改进错误提示信息

## [0.0.6]

### Added
- 新增功能：导出项目中的中文到Excel（按pageId分组）
  - 支持扫描整个项目，自动查找Controller文件中的pageId和pageName
  - 按pageId分组导出所有中文到Excel
  - 可配置扫描源目录路径（默认src）
- 新增功能：导出当前文件/文件夹中的中文到Excel
  - 支持右键选择文件或文件夹，导出其中的中文
  - 按文件路径分组

## [0.0.5]

- Initial release