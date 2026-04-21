import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as ExcelJS from 'exceljs';
import { glob } from 'glob';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const openCC = require('opencc-js');

// 封装 glob 调用，兼容不同版本
async function globAsync(pattern: string, options: { cwd: string; ignore: string[]; absolute: boolean }): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(pattern, options, (err: Error | null, matches: string[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(matches);
      }
    });
  });
}

interface TranslationEntry {
  Origin: string;
  TransKey: string;
}

function getCandidateTranslationExcelPaths(workspaceRoot: string): string[] {
  const config = vscode.workspace.getConfiguration();
  const realtimeFile = config.get('sharkTranslate.realtimeTranslateExcelFile') as string || 'realtime_translate.xlsx';
  const candidates = [
    'batch_translate_by_page.xlsx',
    realtimeFile,
    'realtime_translate.xlsx'
  ];

  return Array.from(new Set(candidates)).map(file => path.join(workspaceRoot, file));
}

function getTranslationLookupRoots(): string[] {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (activeWorkspace?.uri.fsPath) {
      return [activeWorkspace.uri.fsPath];
    }
  }

  const firstWorkspace = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspace?.uri.fsPath) {
    return [firstWorkspace.uri.fsPath];
  }

  if (vscode.workspace.rootPath) {
    return [vscode.workspace.rootPath];
  }

  return [];
}

async function loadTranslationEntriesFromExcel(): Promise<{ entries: TranslationEntry[]; sourceFile: string }> {
  const lookupRoots = getTranslationLookupRoots();
  if (lookupRoots.length === 0) {
    throw new Error('未找到工作区目录，请先打开一个工作区');
  }

  const searchedFiles: string[] = [];
  for (const root of lookupRoots) {
    const candidateFiles = getCandidateTranslationExcelPaths(root);
    for (const filePath of candidateFiles) {
      searchedFiles.push(filePath);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        continue;
      }

      const keys: string[] = [];
      const rows: Record<string, string>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        const obj: Record<string, string> = {};
        row.eachCell((cell, colNumber) => {
          const value = `${cell.value ?? ''}`;
          if (rowNumber === 1) {
            keys.push(value);
          } else {
            obj[keys[colNumber - 1]] = value;
          }
        });
        if (rowNumber > 1) {
          rows.push(obj);
        }
      });

      const entries: TranslationEntry[] = rows
        .map(item => ({
          Origin: item['Origin'] || item['zh-CN'] || '',
          TransKey: item['TransKey'] || ''
        }))
        .filter(item => item.Origin && item.TransKey);

      if (entries.length > 0) {
        return { entries, sourceFile: filePath };
      }
    }
  }

  throw new Error(`未找到可用翻译表。已检查: ${Array.from(new Set(searchedFiles)).join(' , ')}`);
}

const s2hkConverter = (() => {
  try {
    return openCC.Converter({ from: 'cn', to: 'hk' }) as (input: string) => string;
  } catch (error) {
    console.error('初始化 opencc-js 转换器失败，zh-HK 列将回退为原文:', error);
    return (input: string) => input;
  }
})();

function toZhHk(text: string): string {
  return s2hkConverter(text);
}

export function activate(context: vscode.ExtensionContext) {

  // 选中内容替换
  let disposableOneSharkReplace = vscode.commands.registerCommand('sharkTranslate.oneSharkReplace', () => {

    replaceConfigValue();
  });

  // 全文替换
  let disposableAllSharkReplace = vscode.commands.registerCommand('sharkTranslate.allSharkReplace', async function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return; // 如果没有打开的编辑器，直接返回
    }

    const document = editor.document;
    const text = document.getText();

    // 获取用户配置的shark前缀
    const sharkPrefix = vscode.workspace.getConfiguration().get('sharkTranslate.sharkPrefix') as Array<string>;
    const sharkStoreVar = vscode.workspace.getConfiguration().get('sharkTranslate.sharkStoreVar') as string;

    // 正则表达式匹配注释
    // const commentPatterns = [
    //     /\/\/.*$/gm,          // 单行注释
    //     /\/\*[\s\S]*?\*\//g   // 多行注释
    // ];

    // 替换注释中的内容为空
    let comments: { start: number, end: number }[] = [];
    // let textWithoutComments = text;
    // commentPatterns.forEach(pattern => {
    //     textWithoutComments = textWithoutComments.replace(pattern, match => ' '.repeat(match.length));
    // });

    // 获取注释的位置
    let match;
    const commentPatterns = /\/\/.*|\/\*[\s\S]*?\*\//g;
    while ((match = commentPatterns.exec(text)) !== null) {
      comments.push({ start: match.index, end: match.index + match[0].length });
    }

    // 匹配非注释部分英文引号中的字符（改进版：正确处理转义）
    // 先匹配完整的字符串字面量（单引号或双引号），然后检查是否包含中文
    // 使用更精确的匹配，确保从开始引号匹配到对应的结束引号
    // 改进：使用更严格的匹配，确保匹配的是完整的字符串字面量
    const chinesePattern = /(['"])((?:(?!\1)[^\\\r\n]|\\.)*?)\1/g;

    let result: TranslationEntry[] = [];
    try {
      ({ entries: result } = await loadTranslationEntriesFromExcel());
    } catch (error) {
      vscode.window.showErrorMessage(`读取翻译表失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (editor && result.length) {
      const transKeyMap = new Map<string, string>();
      result.forEach(item => {
        transKeyMap.set(item.Origin, item.TransKey);
      });

      // 替换非注释部分的中文字符
      // 使用更安全的方式：先找到所有匹配，然后逐个处理
      const matches: Array<{ match: string, quote: string, content: string, start: number, end: number }> = [];
      let match;
      // 重置正则的 lastIndex
      chinesePattern.lastIndex = 0;
      while ((match = chinesePattern.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        const isInComment = comments.some(comment => matchStart >= comment.start && matchEnd <= comment.end);
        if (!isInComment) {
          const content = match[2];
          const hasChinese = /[\u4e00-\u9fa5]/.test(content);
          if (hasChinese) {
            matches.push({
              match: match[0],
              quote: match[1],
              content: content,
              start: matchStart,
              end: matchEnd
            });
          }
        }
      }

      // 从后往前替换，避免位置偏移问题
      let newText = text;
      for (let i = matches.length - 1; i >= 0; i--) {
        const { content, start, end } = matches[i];
        // 验证匹配的确实是完整的字符串（开始和结束都是引号，且内容匹配）
        const startChar = text[start];
        const endChar = text[end - 1];
        if (startChar === endChar && (startChar === "'" || startChar === '"')) {
          // 再次验证：确保匹配的内容确实是引号内的内容
          const actualContent = text.substring(start + 1, end - 1);
          if (actualContent === content) {
            const matchedTransKey = transKeyMap.get(content);
            if (matchedTransKey) {
              const hasPrefix = sharkPrefix.find(item => matchedTransKey.startsWith(item));
              let replacement;
              if (hasPrefix) {
                replacement = `${sharkStoreVar}['${removeText(matchedTransKey, hasPrefix)}']`;
              } else {
                replacement = `${sharkStoreVar}['${matchedTransKey}']`;
              }
              newText = newText.substring(0, start) + replacement + newText.substring(end);
            }
          }
        }
      }

      // 创建一个编辑器编辑操作
      editor.edit(editBuilder => {
        const firstLine = document.lineAt(0);
        const lastLine = document.lineAt(document.lineCount - 1);
        const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
        editBuilder.replace(textRange, newText);
      });
    } else {
      vscode.window.showErrorMessage('未读取到shark配置文件或未正确获取到工作区，请检查');
    }
  });

  // 导出页面中文到Excel
  let disposableExportChineseByPage = vscode.commands.registerCommand('sharkTranslate.exportChineseByPage', async function (uri?: vscode.Uri) {
    await exportChineseByPage(uri);
  });

  // 按PageId导出项目中文到Excel
  let disposableExportChineseByPageId = vscode.commands.registerCommand('sharkTranslate.exportChineseByPageId', async function (uri?: vscode.Uri) {
    await exportChineseByPageId(uri);
  });

  // 选中文本实时翻译并写入 Excel
  let disposableTranslateSelectionToExcel = vscode.commands.registerCommand('sharkTranslate.translateSelectionToExcel', async function () {
    await translateSelectionToExcel();
  });

  // 批量识别并翻译文件/文件夹中的中文到 Excel
  let disposableBatchTranslateChineseToExcel = vscode.commands.registerCommand('sharkTranslate.batchTranslateChineseToExcel', async function (uri?: vscode.Uri) {
    await batchTranslateChineseToExcel(uri);
  });

  context.subscriptions.push(disposableOneSharkReplace);
  context.subscriptions.push(disposableAllSharkReplace);
  context.subscriptions.push(disposableExportChineseByPage);
  context.subscriptions.push(disposableExportChineseByPageId);
  context.subscriptions.push(disposableTranslateSelectionToExcel);
  context.subscriptions.push(disposableBatchTranslateChineseToExcel);
}

async function replaceConfigValue() {
  const editor = vscode.window.activeTextEditor;
  let result: TranslationEntry[] = [];
  try {
    ({ entries: result } = await loadTranslationEntriesFromExcel());
  } catch (error) {
    vscode.window.showErrorMessage(`读取翻译表失败：${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // 获取用户配置的shark前缀
  const sharkPrefix = vscode.workspace.getConfiguration().get('sharkTranslate.sharkPrefix') as Array<string>;
  const sharkStoreVar = vscode.workspace.getConfiguration().get('sharkTranslate.sharkStoreVar') as string;

  if (editor && result.length) {

    const currentCursorPosition = editor.selection.active;
    const selectedText = editor.document.getText(editor.selection) || '';
    const sharkObj = result.find(item => item.Origin === selectedText);

    if (sharkObj && sharkObj.Origin && sharkObj.TransKey) {

      let transKey = '';
      const hasPrefix = sharkPrefix.find(item => sharkObj.TransKey.startsWith(item))
      if (hasPrefix) {
        transKey = `${sharkStoreVar}['${removeText(sharkObj.TransKey, hasPrefix)}']`;
      } else {
        transKey = `${sharkStoreVar}['${sharkObj.TransKey}']`;
      }

      const replaceOption = {
        title: 'Shark Replace',
        tooltip: `确定使用 "${transKey || ''}" 替换 "${selectedText}"`,
      };

      vscode.window.showInformationMessage(`确定使用 "${transKey || ''}" 替换 "${selectedText}"`, replaceOption)
        .then((value) => {
          if (value === replaceOption && currentCursorPosition) {
            editor.edit((editBuilder) => {
              editBuilder.replace(editor.selection, transKey || '');
            });
          }
        });
    } else {
      vscode.window.showErrorMessage(`关键字"${selectedText}" 没有可使用的shark配置`);
    }
  } else {
    vscode.window.showErrorMessage('未读取到shark配置文件或未正确获取到工作区，请检查');
  }
}

// 字符串删除指定文本
function removeText(originalText: string, textToRemove: string) {
  const regex = new RegExp(textToRemove, 'g');
  return originalText.replace(regex, '');
}

interface RealtimeTranslationResult {
  [languageCode: string]: string;
}

interface TranslateLanguageConfig {
  code: string;
  label: string;
  aiKey?: string;
}

const SUPPORTED_TRANSLATE_LANGUAGES: TranslateLanguageConfig[] = [
  { code: 'zh-HK', label: '繁体中文(香港)' },
  { code: 'en-US', label: '英文', aiKey: 'en' },
  { code: 'ja-JP', label: '日语', aiKey: 'ja' },
  { code: 'ko-KR', label: '韩语', aiKey: 'ko' },
  { code: 'th-TH', label: '泰语', aiKey: 'th' }
];

function getConfiguredTranslateLanguages(): string[] {
  const config = vscode.workspace.getConfiguration();
  const configured = config.get('sharkTranslate.translateTargetLanguages') as string[] | undefined;
  const defaultLanguages = ['zh-HK', 'en-US'];
  const source = configured && configured.length > 0 ? configured : defaultLanguages;
  const supportedCodes = new Set(SUPPORTED_TRANSLATE_LANGUAGES.map(item => item.code));
  const filtered = source.filter(code => supportedCodes.has(code));
  if (filtered.length === 0) {
    return defaultLanguages;
  }
  return Array.from(new Set(filtered));
}

function getAiLanguageConfigs(targetLanguages: string[]): TranslateLanguageConfig[] {
  return SUPPORTED_TRANSLATE_LANGUAGES
    .filter(item => targetLanguages.includes(item.code) && !!item.aiKey);
}

function getLanguageLabel(languageCode: string): string {
  const found = SUPPORTED_TRANSLATE_LANGUAGES.find(item => item.code === languageCode);
  return found ? found.label : languageCode;
}

function formatEnglishForTransKey(englishText: string): string {
  const slug = englishText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!slug) {
    return '请手动输入TransKey';
  }

  if (slug.length <= 50) {
    return slug;
  }

  // 长文本采用“可读 slug 前缀 + 短哈希”，兼顾可读性和唯一性
  let hashValue = 0;
  for (let i = 0; i < englishText.length; i++) {
    hashValue = ((hashValue << 5) - hashValue + englishText.charCodeAt(i)) | 0;
  }
  const hash = Math.abs(hashValue).toString(36).slice(0, 6).padStart(6, '0');
  const maxPrefixLength = 50 - 1 - hash.length;
  const prefix = slug.slice(0, maxPrefixLength).replace(/_+$/g, '') || '请手动输入TransKey';
  return `${prefix}_${hash}`;
}

function buildTransKeyForDocument(documentPath: string, englishText: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return `key.common.${formatEnglishForTransKey(englishText)}`;
  }

  const pageInfo = findPageInfoForFile(documentPath, workspaceFolder.uri.fsPath);
  const pageId = pageInfo.pageId && pageInfo.pageId.trim() ? pageInfo.pageId.trim() : 'common';
  return `key.${pageId}.${formatEnglishForTransKey(englishText)}`;
}

function requestRealtimeTranslations(text: string, targetLanguages: string[]): Promise<RealtimeTranslationResult> {
  const aiLanguageConfigs = getAiLanguageConfigs(targetLanguages);
  if (aiLanguageConfigs.length === 0) {
    return Promise.resolve({});
  }

  const config = vscode.workspace.getConfiguration();
  const apiKey = config.get('sharkTranslate.realtimeTranslateApiKey') as string || '';
  const apiUrl = config.get('sharkTranslate.realtimeTranslateApiUrl') as string || '';
  const model = config.get('sharkTranslate.realtimeTranslateModel') as string || 'kimi-k2.5';

  if (!apiKey.trim()) {
    throw new Error('未配置 sharkTranslate.realtimeTranslateApiKey，请先在插件设置中配置。');
  }
  if(!apiUrl.trim()) {
    throw new Error('未配置 sharkTranslate.realtimeTranslateApiUrl，请先在插件设置中配置。');
  }

  const targetPrompt = aiLanguageConfigs
    .map(item => `${item.label}(${item.aiKey})`)
    .join('、');
  const targetKeys = aiLanguageConfigs
    .map(item => item.aiKey)
    .filter((item): item is string => !!item)
    .join('、');

  const payload = JSON.stringify({
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `你是翻译助手。请把用户提供的中文翻译成：${targetPrompt}。只返回 JSON，不要额外解释。JSON 键名固定为：${targetKeys}。`
      },
      {
        role: 'user',
        content: `请翻译这段中文：${text}`
      }
    ]
  });

  const parseResponse = (data: string): RealtimeTranslationResult => {
    const json = JSON.parse(data);
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型返回内容为空');
    }
    const normalizedContent = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(normalizedContent) as Record<string, string>;
    const result: RealtimeTranslationResult = {};
    aiLanguageConfigs.forEach(item => {
      if (!item.aiKey) {
        return;
      }
      const value = parsed[item.aiKey];
      result[item.code] = typeof value === 'string' ? value : '';
    });
    return result;
  };

  const requestOnce = (targetUrl: string): Promise<RealtimeTranslationResult> => {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:') {
        reject(new Error(`当前仅支持 http 网关，请将 apiUrl 改为 http:// 开头。当前值：${targetUrl}`));
        return;
      }
      const requestHeaders: Record<string, string | number> = {};
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
      requestHeaders['Content-Length'] = Buffer.byteLength(payload);

      const request = http.request({
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: requestHeaders
      }, response => {
        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`翻译请求失败(${response.statusCode})：${data}`));
            return;
          }

          try {
            resolve(parseResponse(data));
          } catch (error) {
            reject(new Error(`解析翻译结果失败: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      });

      request.on('error', error => {
        reject(new Error(`调用翻译接口失败: ${error.message}`));
      });

      request.write(payload);
      request.end();
    });
  };

  return requestOnce(apiUrl);
}

function buildRealtimeSheetHeaders(targetLanguages: string[]): string[] {
  return ['Origin', 'zh-CN', ...targetLanguages, 'TransKey'];
}

function buildRealtimeSheetRow(chinese: string, translated: RealtimeTranslationResult, transKey: string, targetLanguages: string[]): string[] {
  const row: string[] = [chinese, chinese];
  targetLanguages.forEach(languageCode => {
    if (languageCode === 'zh-HK') {
      row.push(toZhHk(chinese));
      return;
    }
    row.push(translated[languageCode] || '');
  });
  row.push(transKey);
  return row;
}

async function appendRealtimeTranslationToExcel(chinese: string, translated: RealtimeTranslationResult, transKey: string, targetLanguages: string[]) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('未找到工作区，请先打开一个工作区');
  }

  const config = vscode.workspace.getConfiguration();
  const excelFileName = config.get('sharkTranslate.realtimeTranslateExcelFile') as string || 'realtime_translate.xlsx';
  const outputPath = path.join(workspaceFolder.uri.fsPath, excelFileName);

  const workbook = new ExcelJS.Workbook();
  let worksheet: ExcelJS.Worksheet;
  const headers = buildRealtimeSheetHeaders(targetLanguages);

  if (fs.existsSync(outputPath)) {
    await workbook.xlsx.readFile(outputPath);
    worksheet = workbook.getWorksheet('实时翻译') || workbook.getWorksheet(1) || workbook.addWorksheet('实时翻译');
    if (worksheet.rowCount === 0) {
      worksheet.addRow([...headers]);
    }
  } else {
    worksheet = workbook.addWorksheet('实时翻译');
    worksheet.columns = headers.map(header => ({
      header,
      key: header,
      width: header === 'TransKey' ? 50 : 40
    }));
  }

  if (worksheet.rowCount > 0) {
    const headerRow = worksheet.getRow(1);
    const currentHeaders = headers
      .map((_, idx) => String(headerRow.getCell(idx + 1).value ?? '').trim())
      .filter(item => item);
    if (currentHeaders.join('|') !== headers.join('|')) {
      throw new Error(`翻译表表头与当前语种配置不一致。当前表头: ${currentHeaders.join(', ')}；期望表头: ${headers.join(', ')}`);
    }
  }

  worksheet.addRow(buildRealtimeSheetRow(chinese, translated, transKey, targetLanguages));

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

async function translateSelectionToExcel() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('未找到活动编辑器');
    return;
  }

  const selectedText = editor.document.getText(editor.selection).trim();
  if (!selectedText) {
    vscode.window.showWarningMessage('请先选中要翻译的中文文本');
    return;
  }

  try {
    const targetLanguages = getConfiguredTranslateLanguages();
    const translated = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在实时翻译选中文本...',
      cancellable: false
    }, async () => requestRealtimeTranslations(selectedText, targetLanguages));
    const englishForTransKey = translated['en-US'] || '';
    const transKey = buildTransKeyForDocument(editor.document.uri.fsPath, englishForTransKey);

    const previewLines = targetLanguages.map(languageCode => {
      const value = languageCode === 'zh-HK' ? toZhHk(selectedText) : (translated[languageCode] || '');
      return `${getLanguageLabel(languageCode)}(${languageCode}): ${value}`;
    });
    const confirm = await vscode.window.showInformationMessage(
      `翻译完成，是否写入 Excel？\n${previewLines.join('\n')}\nTransKey: ${transKey}`,
      { modal: true },
      '确认写入',
      '取消'
    );

    if (confirm !== '确认写入') {
      return;
    }

    const outputPath = await appendRealtimeTranslationToExcel(selectedText, translated, transKey, targetLanguages);
    vscode.window.showInformationMessage(`已写入 ${path.basename(outputPath)}`, '打开文件').then(selection => {
      if (selection === '打开文件') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
      }
    });
  } catch (error) {
    vscode.window.showErrorMessage(`实时翻译失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildTransKeyByPageId(pageId: string, englishText: string): string {
  const normalizedPageId = pageId && pageId.trim() ? pageId.trim() : 'common';
  return `key.${normalizedPageId}.${formatEnglishForTransKey(englishText)}`;
}

async function batchTranslateChineseToExcel(uri?: vscode.Uri) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('未找到工作区，请先打开一个工作区');
    return;
  }

  if (!uri || !uri.fsPath) {
    vscode.window.showWarningMessage('请在资源管理器中右键文件或文件夹后执行批量翻译');
    return;
  }

  // 与 exportChineseByPageId 对齐：过滤规则一致（排除目录、测试文件、自定义排除）
  const userExcludePatterns = vscode.workspace.getConfiguration().get('sharkTranslate.scanExcludePatterns') as string[] || [];

  // 确定扫描根目录或单个文件：
  // - 右键目录：扫描该目录
  // - 右键文件：仅扫描该文件
  let scanRoot = workspaceFolder.uri.fsPath;
  let singleFile: string | null = null;
  if (uri && uri.fsPath) {
    const stat = fs.statSync(uri.fsPath);
    if (stat.isDirectory()) {
      scanRoot = uri.fsPath;
    } else {
      singleFile = uri.fsPath;
      scanRoot = path.dirname(uri.fsPath);
    }
  }

  if (!singleFile && !fs.existsSync(scanRoot)) {
    vscode.window.showErrorMessage(`扫描目录不存在: ${scanRoot}`);
    return;
  }

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: singleFile ? '正在批量翻译当前文件中的中文...' : '正在批量翻译文件夹中的中文...',
    cancellable: false
  }, async (progress) => {
    const targetLanguages = getConfiguredTranslateLanguages();
    progress.report({ increment: 0, message: '开始扫描文件...' });

    let uniqueFiles: string[] = [];
    if (singleFile) {
      uniqueFiles = [singleFile];
      progress.report({ increment: 20, message: `扫描文件: ${path.basename(singleFile)}` });
    } else {
      const filePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'];
      const excludePatterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        ...userExcludePatterns
      ];
      const allFiles: string[] = [];
      for (const pattern of filePatterns) {
        try {
          const files = await globAsync(pattern, {
            cwd: scanRoot,
            ignore: excludePatterns,
            absolute: true
          });
          allFiles.push(...files);
        } catch (error) {
          console.error(`扫描模式 ${pattern} 时出错:`, error);
        }
      }
      uniqueFiles = Array.from(new Set(allFiles));
      progress.report({ increment: 20, message: `找到 ${uniqueFiles.length} 个文件，开始提取中文...` });
    }

    const pageChineseMap: Map<string, { pageName: string; chineseSet: Set<string> }> = new Map();
    for (let i = 0; i < uniqueFiles.length; i++) {
      const filePath = uniqueFiles[i];
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const chineseList = extractChineseFromText(fileContent);
        if (chineseList.length > 0) {
          const pageInfo = findPageInfoForFile(filePath, workspaceFolder.uri.fsPath);
          if (!pageChineseMap.has(pageInfo.pageId)) {
            pageChineseMap.set(pageInfo.pageId, {
              pageName: pageInfo.pageName,
              chineseSet: new Set()
            });
          }
          chineseList.forEach(chinese => {
            pageChineseMap.get(pageInfo.pageId)!.chineseSet.add(chinese);
          });
        }
      } catch (error) {
        console.error(`处理文件 ${filePath} 时出错:`, error);
      }
    }

    const totalChinese = Array.from(pageChineseMap.values())
      .reduce((total, item) => total + item.chineseSet.size, 0);
    if (totalChinese === 0) {
      vscode.window.showInformationMessage('未找到任何中文内容');
      return;
    }

    progress.report({ increment: 20, message: `提取完成，共 ${totalChinese} 条中文，开始批量翻译...` });
    const sortedPageIds = Array.from(pageChineseMap.keys()).sort((a, b) => {
      const aIsNumber = /^\d+$/.test(a);
      const bIsNumber = /^\d+$/.test(b);
      if (aIsNumber && bIsNumber) {
        return Number(a) - Number(b);
      }
      if (aIsNumber) return -1;
      if (bIsNumber) return 1;
      return a.localeCompare(b);
    });

    const translationCache: Map<string, RealtimeTranslationResult> = new Map();
    const excelRows: Record<string, string>[] = [];
    let translatedCount = 0;

    for (const pageId of sortedPageIds) {
      const { chineseSet } = pageChineseMap.get(pageId)!;
      for (const chinese of chineseSet) {
        let translated = translationCache.get(chinese);
        if (!translated) {
          translated = await requestRealtimeTranslations(chinese, targetLanguages);
          translationCache.set(chinese, translated);
        }
        const translatedResult = translated || {};
        const englishForTransKey = translatedResult['en-US'] || '';
        const transKey = buildTransKeyByPageId(pageId, englishForTransKey);
        const row: Record<string, string> = {
          pageId,
          Origin: chinese,
          'zh-CN': chinese
        };
        targetLanguages.forEach(languageCode => {
          if (languageCode === 'zh-HK') {
            row['zh-HK'] = toZhHk(chinese);
            return;
          }
          row[languageCode] = translatedResult[languageCode] || '';
        });
        row.TransKey = transKey;
        excelRows.push(row);

        translatedCount += 1;
        progress.report({
          increment: (50 / totalChinese),
          message: `翻译进度 ${translatedCount}/${totalChinese}`
        });
      }
    }

    progress.report({ increment: 10, message: '正在生成 Excel 文件...' });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('批量翻译');
    const dynamicHeaders = ['pageId', 'Origin', 'zh-CN', ...targetLanguages, 'TransKey'];
    worksheet.columns = dynamicHeaders.map(header => ({
      header,
      key: header,
      width: header === 'pageId' ? 20 : 50
    }));
    excelRows.forEach(row => {
      worksheet.addRow(row);
    });

    const outputPath = path.join(workspaceFolder.uri.fsPath, 'batch_translate_by_page.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    vscode.window.showInformationMessage(
      `批量翻译完成，共 ${excelRows.length} 条，已导出 ${path.basename(outputPath)}`,
      '打开文件'
    ).then(selection => {
      if (selection === '打开文件') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
      }
    });
  });
}

// 从文件内容中提取中文（排除注释）
function extractChineseFromText(text: string): string[] {
  const chineseList: string[] = [];

  // 获取注释的位置
  let comments: { start: number, end: number }[] = [];
  let match;
  const commentPatterns = /\/\/.*|\/\*[\s\S]*?\*\//g;
  while ((match = commentPatterns.exec(text)) !== null) {
    comments.push({ start: match.index, end: match.index + match[0].length });
  }

  // 匹配非注释部分英文引号中的字符（改进版：正确处理转义）
  // 先匹配完整的字符串字面量（单引号或双引号），然后检查是否包含中文
  // 使用更精确的匹配，确保从开始引号匹配到对应的结束引号
  // 改进：使用更严格的匹配，避免匹配到字符串外的引号
  const chinesePattern = /(['"])((?:(?!\1)[^\\\r\n]|\\.)*?)\1/g;

  while ((match = chinesePattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    // 检查是否在注释中
    const isInComment = comments.some(comment => matchStart >= comment.start && matchEnd <= comment.end);

    if (!isInComment) {
      const content = match[2]; // 提取引号内的内容（第二个捕获组）
      // 检查内容是否包含中文
      const hasChinese = /[\u4e00-\u9fa5]/.test(content);
      if (hasChinese) {
        // 去重
        if (!chineseList.includes(content)) {
          chineseList.push(content);
        }
      }
    }
  }

  return chineseList;
}

// 导出页面中文到Excel
async function exportChineseByPage(uri?: vscode.Uri) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('未找到工作区，请先打开一个工作区');
    return;
  }
  const userExcludePatterns = vscode.workspace.getConfiguration().get('sharkTranslate.scanExcludePatterns') as string[] || [];

  // 确定扫描的根目录或单个文件
  let scanRoot = workspaceFolder.uri.fsPath;
  let singleFile: string | null = null; // 单文件模式

  if (uri && uri.fsPath) {
    const stat = fs.statSync(uri.fsPath);
    if (stat.isDirectory()) {
      scanRoot = uri.fsPath;
    } else {
      // 如果 uri 代表的是一个文件，只扫描这一个文件
      singleFile = uri.fsPath;
      scanRoot = path.dirname(uri.fsPath);
    }
  }

  // 显示进度
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: singleFile ? "正在扫描文件中的中文..." : "正在扫描项目中的中文...",
    cancellable: false
  }, async (progress) => {
    progress.report({ increment: 0, message: "开始扫描文件..." });

    let uniqueFiles: string[] = [];

    if (singleFile) {
      // 单文件模式：只扫描右键点击的那个文件
      uniqueFiles = [singleFile];
      progress.report({ increment: 20, message: `扫描文件: ${path.basename(singleFile)}` });
    } else {
      // 目录模式：扫描整个目录
      // 支持的文件类型
      const filePatterns = [
        '**/*.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.jsx',
        '**/*.vue'
      ];

      // 需要排除的目录
      const excludePatterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        ...userExcludePatterns
      ];

      const allFiles: string[] = [];

      // 收集所有文件
      for (const pattern of filePatterns) {
        try {
          const files = await globAsync(pattern, {
            cwd: scanRoot,
            ignore: excludePatterns,
            absolute: true
          });
          allFiles.push(...files);
        } catch (error) {
          console.error(`扫描模式 ${pattern} 时出错:`, error);
        }
      }

      // 去重
      uniqueFiles = Array.from(new Set(allFiles));
      progress.report({ increment: 20, message: `找到 ${uniqueFiles.length} 个文件，开始提取中文...` });
    }

    // 按 pageId 分组的中文数据，同时存储 pageName
    const pageChineseMap: Map<string, { pageName: string; chineseSet: Set<string> }> = new Map();

    // 处理每个文件
    for (let i = 0; i < uniqueFiles.length; i++) {
      const filePath = uniqueFiles[i];
      try {
        // 读取文件内容
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // 提取中文
        const chineseList = extractChineseFromText(fileContent);

        if (chineseList.length > 0) {
          // 查找该文件对应的 pageId 和 pageName（使用工作区根目录作为搜索范围）
          const pageInfo = findPageInfoForFile(filePath, workspaceFolder.uri.fsPath);

          // 如果 pageId 不存在，初始化
          if (!pageChineseMap.has(pageInfo.pageId)) {
            pageChineseMap.set(pageInfo.pageId, {
              pageName: pageInfo.pageName,
              chineseSet: new Set()
            });
          }

          // 将中文添加到对应的 pageId
          chineseList.forEach(chinese => {
            pageChineseMap.get(pageInfo.pageId)!.chineseSet.add(chinese);
          });
        }

        // 更新进度
        if ((i + 1) % 10 === 0 || i === uniqueFiles.length - 1) {
          progress.report({
            increment: 60 / uniqueFiles.length * 10,
            message: `已处理 ${i + 1}/${uniqueFiles.length} 个文件...`
          });
        }
      } catch (error) {
        console.error(`处理文件 ${filePath} 时出错:`, error);
      }
    }

    progress.report({ increment: 20, message: "正在生成 Excel 文件..." });

    // 生成 Excel 数据
    const excelData: { pageId: string; pageName: string; 'zh-CN': string }[] = [];

    // 对 pageId 进行排序，数字类型的 pageId 放在前面
    const sortedPageIds = Array.from(pageChineseMap.keys()).sort((a, b) => {
      const aIsNumber = /^\d+$/.test(a);
      const bIsNumber = /^\d+$/.test(b);
      if (aIsNumber && bIsNumber) {
        return Number(a) - Number(b);
      }
      if (aIsNumber) return -1;
      if (bIsNumber) return 1;
      return a.localeCompare(b);
    });

    sortedPageIds.forEach(pageId => {
      const { pageName, chineseSet } = pageChineseMap.get(pageId)!;
      chineseSet.forEach(chinese => {
        excelData.push({ pageId, pageName, 'zh-CN': chinese });
      });
    });

    if (excelData.length === 0) {
      vscode.window.showInformationMessage('未找到任何中文内容');
      return;
    }

    // 创建 Excel 文件
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('页面中文');

    // 设置表头
    worksheet.columns = [
      { header: 'pageId', key: 'pageId', width: 20 },
      { header: 'pageName', key: 'pageName', width: 40 },
      { header: 'zh-CN', key: 'zh-CN', width: 50 }
    ];

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // 添加数据
    excelData.forEach(row => {
      worksheet.addRow(row);
    });

    // 保存文件
    const outputPath = path.join(workspaceFolder.uri.fsPath, 'chinese_by_current_file.xlsx');
    await workbook.xlsx.writeFile(outputPath);

    vscode.window.showInformationMessage(
      `成功导出 ${excelData.length} 条中文数据到 ${path.basename(outputPath)}，共 ${pageChineseMap.size} 个页面`,
      '打开文件'
    ).then(selection => {
      if (selection === '打开文件') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
      }
    });
  });
}

// Controller 文件中提取的信息
interface ControllerInfo {
  pageId: string | null;
  pageName: string | null;
}

// 从 Controller 文件中提取 pageId 和 pageName
function extractInfoFromController(controllerPath: string): ControllerInfo {
  try {
    if (!fs.existsSync(controllerPath)) {
      return { pageId: null, pageName: null };
    }
    const content = fs.readFileSync(controllerPath, 'utf-8');

    // 匹配 pageId = 数字 或 pageId: 数字 的格式
    const pageIdMatch = content.match(/pageId\s*[=:]\s*(\d+)/);
    const pageId = (pageIdMatch && pageIdMatch[1] && pageIdMatch[1] !== '0') ? pageIdMatch[1] : null;

    // 匹配 pageName = ['xxx', 'yyy'] 或 pageName: ['xxx', 'yyy'] 的格式
    const pageNameMatch = content.match(/pageName\s*[=:]\s*\[([^\]]*)\]/);
    let pageName: string | null = null;
    if (pageNameMatch && pageNameMatch[1]) {
      // 提取数组中的字符串，去除引号，用逗号分隔
      const items = pageNameMatch[1].match(/['"]([^'"]+)['"]/g);
      if (items && items.length > 0) {
        pageName = items.map(item => item.replace(/['"]/g, '')).join(', ');
      }
    }

    return { pageId, pageName };
  } catch (error) {
    console.error(`读取 Controller 文件出错: ${controllerPath}`, error);
    return { pageId: null, pageName: null };
  }
}

// 查找结果
interface PageInfo {
  pageId: string;
  pageName: string;
}

// 查找当前文件对应的 pageId 和 pageName
// 查找逻辑：从当前文件所在目录开始，向上查找 controller.ts 或 controller.js 文件
function findPageInfoForFile(filePath: string, srcRoot: string): PageInfo {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  let currentDir = path.dirname(filePath);

  // 首先检查当前文件是否就是 Controller 文件
  const fileName = path.basename(filePath);
  if (/^(local)?controller\.(ts|js)$/i.test(fileName)) {
    const info = extractInfoFromController(filePath);
    // 获取相对路径作为默认 pageId
    const relativePath = path.relative(workspaceFolder?.uri.fsPath || '', path.dirname(filePath));
    return {
      pageId: info.pageId || relativePath || 'root',
      pageName: info.pageName || ''
    };
  }

  // 向上查找 Controller 文件，直到 srcRoot
  while (currentDir.startsWith(srcRoot) && currentDir.length >= srcRoot.length) {
    // 检查当前目录下的 controller 文件
    const controllerFiles = [
      'controller.ts',
      'controller.js',
      'Controller.ts',
      'Controller.js',
      'LocalController.ts',
      'LocalController.js',
      'localController.ts',
      'localController.js'
    ];

    for (const controllerFile of controllerFiles) {
      const controllerPath = path.join(currentDir, controllerFile);
      if (fs.existsSync(controllerPath)) {
        const info = extractInfoFromController(controllerPath);
        // 获取相对路径作为默认 pageId
        const relativePath = path.relative(workspaceFolder?.uri.fsPath || '', currentDir);
        return {
          pageId: info.pageId || relativePath || 'root',
          pageName: info.pageName || ''
        };
      }
    }

    // 向上一级目录继续查找
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // 已经到达根目录
    }
    currentDir = parentDir;
  }

  // 如果找不到 controller 文件，使用相对路径作为 pageId
  const relativePath = path.relative(workspaceFolder?.uri.fsPath || '', path.dirname(filePath));
  return {
    pageId: relativePath || 'root',
    pageName: ''
  };
}

// 按 PageId 导出项目中文到 Excel
async function exportChineseByPageId(uri?: vscode.Uri) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('未找到工作区，请先打开一个工作区');
    return;
  }

  // 获取配置的扫描路径
  const scanSrcPath = vscode.workspace.getConfiguration().get('sharkTranslate.scanSrcPath') as string || 'src';
  const srcRoot = path.join(workspaceFolder.uri.fsPath, scanSrcPath);

  // 获取用户配置的排除模式
  const userExcludePatterns = vscode.workspace.getConfiguration().get('sharkTranslate.scanExcludePatterns') as string[] || [];

  // 检查 src 目录是否存在
  if (!fs.existsSync(srcRoot)) {
    vscode.window.showErrorMessage(`扫描目录不存在: ${srcRoot}，请检查配置 sharkTranslate.scanSrcPath`);
    return;
  }

  // 显示进度
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "正在按PageId扫描项目中的中文...",
    cancellable: false
  }, async (progress) => {
    progress.report({ increment: 0, message: "开始扫描文件..." });

    // 支持的文件类型
    const filePatterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.vue'
    ];

    // 需要排除的目录
    const excludePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/out/**',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      ...userExcludePatterns
    ];

    const allFiles: string[] = [];

    // 收集所有文件
    for (const pattern of filePatterns) {
      try {
        const files = await globAsync(pattern, {
          cwd: srcRoot,
          ignore: excludePatterns,
          absolute: true // 返回绝对路径，方便后面直接读取文件
        });
        allFiles.push(...files);
      } catch (error) {
        console.error(`扫描模式 ${pattern} 时出错:`, error);
      }
    }

    // 去重
    const uniqueFiles = Array.from(new Set(allFiles));
    progress.report({ increment: 20, message: `找到 ${uniqueFiles.length} 个文件，开始提取中文...` });

    // 按 pageId 分组的中文数据，同时存储 pageName
    const pageChineseMap: Map<string, { pageName: string; chineseSet: Set<string> }> = new Map();

    // 处理每个文件
    for (let i = 0; i < uniqueFiles.length; i++) {
      const filePath = uniqueFiles[i];
      try {
        // 读取文件内容
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // 提取中文
        const chineseList = extractChineseFromText(fileContent);

        if (chineseList.length > 0) {
          // 查找该文件对应的 pageId 和 pageName
          const pageInfo = findPageInfoForFile(filePath, srcRoot);

          // 如果 pageId 不存在，初始化
          if (!pageChineseMap.has(pageInfo.pageId)) {
            pageChineseMap.set(pageInfo.pageId, {
              pageName: pageInfo.pageName,
              chineseSet: new Set()
            });
          }

          // 将中文添加到对应的 pageId
          chineseList.forEach(chinese => {
            pageChineseMap.get(pageInfo.pageId)!.chineseSet.add(chinese);
          });
        }

        // 更新进度
        if ((i + 1) % 10 === 0 || i === uniqueFiles.length - 1) {
          progress.report({
            increment: 60 / uniqueFiles.length * 10,
            message: `已处理 ${i + 1}/${uniqueFiles.length} 个文件...`
          });
        }
      } catch (error) {
        console.error(`处理文件 ${filePath} 时出错:`, error);
      }
    }

    progress.report({ increment: 20, message: "正在生成 Excel 文件..." });

    // 生成 Excel 数据
    const excelData: { pageId: string; pageName: string; 'zh-CN': string }[] = [];

    // 对 pageId 进行排序，数字类型的 pageId 放在前面
    const sortedPageIds = Array.from(pageChineseMap.keys()).sort((a, b) => {
      const aIsNumber = /^\d+$/.test(a);
      const bIsNumber = /^\d+$/.test(b);
      if (aIsNumber && bIsNumber) {
        return Number(a) - Number(b);
      }
      if (aIsNumber) return -1;
      if (bIsNumber) return 1;
      return a.localeCompare(b);
    });

    sortedPageIds.forEach(pageId => {
      const { pageName, chineseSet } = pageChineseMap.get(pageId)!;
      chineseSet.forEach(chinese => {
        excelData.push({ pageId, pageName, 'zh-CN': chinese });
      });
    });

    if (excelData.length === 0) {
      vscode.window.showInformationMessage('未找到任何中文内容');
      return;
    }

    // 创建 Excel 文件
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('按PageId分组的中文');

    // 设置表头
    worksheet.columns = [
      { header: 'pageId', key: 'pageId', width: 20 },
      { header: 'pageName', key: 'pageName', width: 40 },
      { header: 'zh-CN', key: 'zh-CN', width: 50 }
    ];

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // 添加数据
    excelData.forEach(row => {
      worksheet.addRow(row);
    });

    // 保存文件
    const outputPath = path.join(workspaceFolder.uri.fsPath, 'chinese_by_pageId.xlsx');
    await workbook.xlsx.writeFile(outputPath);

    // 统计信息
    const totalChinese = excelData.length;
    const totalPages = pageChineseMap.size;
    const validPageIds = sortedPageIds.filter(id => /^\d+$/.test(id)).length;
    const unknownPageIds = totalPages - validPageIds;

    vscode.window.showInformationMessage(
      `成功导出 ${totalChinese} 条中文数据到 ${path.basename(outputPath)}，共 ${totalPages} 个页面（有效PageId: ${validPageIds}，未找到PageId: ${unknownPageIds}）`,
      '打开文件'
    ).then(selection => {
      if (selection === '打开文件') {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
      }
    });
  });
}

export function deactivate() { }

