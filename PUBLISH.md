# VSCode 插件发布指南

## 前置准备

### 1. 安装 vsce（Visual Studio Code Extensions）

```bash
npm install -g @vscode/vsce
```

### 2. 创建 Azure DevOps 账号并获取 Personal Access Token

1. 访问 [Azure DevOps](https://dev.azure.com/)
2. 如果没有账号，需要先注册
3. 登录后，点击右上角用户头像 → **Personal access tokens**
4. 点击 **New Token**，创建新的访问令牌：
   - **Name**: 输入一个名称，如 "VSCode Extension Publishing"
   - **Organization**: 选择你的组织（如果没有，会创建一个）
   - **Expiration**: 设置过期时间（建议选择较长时间，如 1 年）
   - **Scopes**: 勾选 **Custom defined**，然后勾选 **Marketplace** → **Manage**
5. 点击 **Create**，**重要**：复制生成的 token（只显示一次，请妥善保存）

### 3. 创建发布者账号

1. 访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
2. 使用你的 Microsoft 账号登录（如果没有，需要先注册）
3. 点击左侧 **Create Publisher** 创建发布者
4. 填写发布者信息：
   - **Publisher ID**: 必须与 `package.json` 中的 `publisher` 字段一致（当前为 `zs-liu`）
   - **Publisher Name**: 显示名称
   - **Support Email**: 支持邮箱
   - 其他信息按需填写

### 4. 签署 Eclipse Foundation 发布者协议（重要！）

**这是首次发布插件时的必要步骤！**

1. 访问 [Eclipse Foundation Publisher Agreement](https://marketplace.eclipse.org/content/eclipse-foundation-publisher-agreement)
2. 或者直接访问：https://accounts.eclipse.org/user/register
3. 使用你的邮箱注册 Eclipse 账号（如果还没有账号）
4. 登录后，访问发布者协议页面并签署协议
5. 协议签署完成后，通常需要等待几分钟到几小时才能生效

**注意**：
- 必须使用与 Visual Studio Marketplace 相同的邮箱账号
- 签署协议后，可能需要等待一段时间才能发布插件
- 如果发布时仍然提示需要签署协议，请等待几分钟后重试

## 发布步骤

### 1. 确保代码已编译

```bash
npm run compile
```

### 2. 登录 vsce（使用 Personal Access Token）

```bash
vsce login <publisher-id>
```

例如：
```bash
vsce login zs-liu
```

然后输入你的 Personal Access Token。

### 3. 打包插件

```bash
vsce package
```

这会生成一个 `.vsix` 文件，例如 `shark-translate-0.0.6.vsix`

### 4. 发布到市场

#### 方式一：直接发布（推荐）

```bash
vsce publish
```

这会自动：
- 打包插件
- 上传到 Visual Studio Marketplace
- 发布新版本

#### 方式二：先打包，后发布

如果已经打包好了：

```bash
vsce publish -p <vsix-file-path>
```

例如：
```bash
vsce publish -p shark-translate-0.0.6.vsix
```

### 5. 更新版本号

每次发布新版本时，需要更新 `package.json` 中的 `version` 字段：

```json
{
  "version": "0.0.6"  // 更新版本号，遵循语义化版本规范
}
```

### 6. 更新 CHANGELOG.md

在发布前，确保 `CHANGELOG.md` 中记录了新版本的变更内容。

## 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- **主版本号（Major）**：不兼容的 API 修改
- **次版本号（Minor）**：向下兼容的功能性新增
- **修订号（Patch）**：向下兼容的问题修正

例如：`0.0.6` → `0.0.7`（小修复）或 `0.1.0`（新功能）

## 常见问题

### 1. 提示需要签署 Eclipse Foundation 发布者协议

**错误信息**：`You must sign a Publisher Agreement with the Eclipse Foundation before publishing any extension.`

**解决方法**：
1. 访问 [Eclipse Foundation Publisher Agreement](https://marketplace.eclipse.org/content/eclipse-foundation-publisher-agreement)
2. 使用与 Visual Studio Marketplace 相同的邮箱注册/登录 Eclipse 账号
3. 签署发布者协议
4. 等待几分钟到几小时让协议生效
5. 重新尝试发布

**如果已经签署但仍然提示**：
- 确保使用的是相同的邮箱账号
- 等待更长时间（最多可能需要 24 小时）
- 检查 Eclipse 账号邮箱是否已验证

### 2. 发布失败：Publisher ID 不匹配

确保 `package.json` 中的 `publisher` 字段与你在 Marketplace 创建的 Publisher ID 完全一致。

### 3. 发布失败：版本号已存在

如果该版本已经发布过，需要更新版本号后再发布。

### 3. 测试本地安装

在发布前，可以本地测试安装：

```bash
code --install-extension shark-translate-0.0.6.vsix
```

### 4. 查看发布状态

发布后，访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) 查看发布状态。

## 发布检查清单

### Visual Studio Marketplace

- [ ] 代码已编译通过（`npm run compile`）
- [ ] 版本号已更新（`package.json`）
- [ ] CHANGELOG.md 已更新
- [ ] README.md 已更新（如有新功能）
- [ ] **已签署 Eclipse Foundation 发布者协议**（首次发布必须）
- [ ] 已创建 Publisher 账号
- [ ] 已获取 Personal Access Token
- [ ] 已登录 vsce（`vsce login`）
- [ ] 已执行 `vsce publish`

### Open VSX

- [ ] **许可证已添加**（`package.json` 中的 `license` 字段和 `LICENSE` 文件）
- [ ] 代码已编译通过（`npm run compile`）
- [ ] 版本号已更新（`package.json`）
- [ ] CHANGELOG.md 已更新
- [ ] README.md 已更新（如有新功能）
- [ ] 已创建 Open VSX 账号
- [ ] 已获取 Open VSX Personal Access Token
- [ ] 已安装 ovsx 工具（`npm install -g ovsx`）
- [ ] 已执行 `ovsx publish`

## 发布到 Open VSX（开源扩展市场）

[Open VSX](https://open-vsx.org/) 是一个开源的 VSCode 扩展市场，主要用于 VSCode 的开源版本（如 VSCodium）。

### 前置要求

1. **必须有许可证**：
   - `package.json` 中必须包含 `"license": "MIT"` 字段（已添加）
   - 项目根目录必须有 `LICENSE` 文件（已创建）

2. **创建 Open VSX 账号**：
   - 访问 [Open VSX](https://open-vsx.org/)
   - 点击右上角 **Sign in** 登录（支持 GitHub、GitLab、Eclipse 账号）
   - 登录后访问 [用户设置](https://open-vsx.org/user-settings/extensions)

### 发布步骤

1. **打包插件**：
   ```bash
   vsce package
   ```

2. **安装 ovsx 工具**：
   ```bash
   npm install -g ovsx
   ```

3. **创建 Personal Access Token**：
   - 访问 [Open VSX 用户设置](https://open-vsx.org/user-settings/extensions)
   - 在 **Personal Access Tokens** 部分创建新 token
   - 复制生成的 token

4. **发布插件**：
   ```bash
   ovsx publish shark-translate-0.0.6.vsix -p <your-personal-access-token>
   ```

   或者设置环境变量后直接发布：
   ```bash
   export OVSX_PAT=<your-personal-access-token>
   ovsx publish shark-translate-0.0.6.vsix
   ```

### Open VSX 常见问题

#### 1. 提示缺少许可证

**错误信息**：`This extension cannot be accepted because it has no license`

**解决方法**：
- ✅ 确保 `package.json` 中有 `"license": "MIT"` 字段
- ✅ 确保项目根目录有 `LICENSE` 文件
- ✅ 重新打包插件：`vsce package`
- ✅ 重新发布

#### 2. 发布失败：版本已存在

如果该版本已经发布过，需要更新版本号后再发布。

#### 3. 查看发布状态

发布后，访问 [Open VSX](https://open-vsx.org/) 搜索你的插件名称查看发布状态。

## 发布后

### Visual Studio Marketplace

发布成功后，插件会在几分钟内出现在 Visual Studio Marketplace 上。用户可以：

1. 在 VSCode 中搜索插件名称安装
2. 通过命令面板：`Ctrl+Shift+P` → `Extensions: Install from VSIX...` 安装本地 `.vsix` 文件
3. 访问 Marketplace 网页直接安装

### Open VSX

发布成功后，插件会出现在 Open VSX 上，用户可以：

1. 在 VSCodium 或其他支持 Open VSX 的编辑器中搜索安装
2. 访问 [Open VSX](https://open-vsx.org/) 网页查看和安装

