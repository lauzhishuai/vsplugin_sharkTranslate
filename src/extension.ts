import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { glob } from 'glob';

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

export function activate(context: vscode.ExtensionContext) {
  
  // 选中内容替换
  let disposableOneSharkReplace = vscode.commands.registerCommand('sharkTranslate.oneSharkReplace', () => {

      replaceConfigValue();
  });
  
  // 全文替换
  let disposableAllSharkReplace = vscode.commands.registerCommand('sharkTranslate.allSharkReplace', async function() {
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
    let comments: {start:number, end:number}[] = [];
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

    const sharkFile = path.join(vscode.workspace.rootPath || '', 'shark.xlsx'); // 项目中shark的配置文件
    let keys: string[] = [];
    const result:Record<string,string>[]= [];
  
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(sharkFile);
    const worksheet = workbook.getWorksheet(1);
    
    (worksheet || []).eachRow((row, rowNumber) => { 
      let obj:Record<string,string> ={};
      row.eachCell((cell, colNumber)=>{
        const value= `${cell.value}`;
        if (rowNumber === 1) {
          keys.push(value);
        } else {
          obj[keys[colNumber - 1]] = value;
        }
      });
      if (rowNumber > 1) {
        result.push(obj);
      }
    });
    
    if (editor && result.length) {
      // 替换非注释部分的中文字符
      // 使用更安全的方式：先找到所有匹配，然后逐个处理
      const matches: Array<{match: string, quote: string, content: string, start: number, end: number}> = [];
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
            for (const { Origin, TransKey } of result) {
              if (Origin === content) {
                const hasPrefix = sharkPrefix.find(item => TransKey.startsWith(item));
                let replacement;
                if (hasPrefix) {
                  replacement = `${sharkStoreVar}['${removeText(TransKey, hasPrefix)}']`;
                } else {
                  replacement = `${sharkStoreVar}['${TransKey}']`;
                }
                newText = newText.substring(0, start) + replacement + newText.substring(end);
                break;
              }
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
  let disposableExportChineseByPage = vscode.commands.registerCommand('sharkTranslate.exportChineseByPage', async function(uri?: vscode.Uri) {
    await exportChineseByPage(uri);
  });

  // 按PageId导出项目中文到Excel
  let disposableExportChineseByPageId = vscode.commands.registerCommand('sharkTranslate.exportChineseByPageId', async function(uri?: vscode.Uri) {
    await exportChineseByPageId(uri);
  });

  context.subscriptions.push(disposableOneSharkReplace);
  context.subscriptions.push(disposableAllSharkReplace);
  context.subscriptions.push(disposableExportChineseByPage);
  context.subscriptions.push(disposableExportChineseByPageId);
}

async function replaceConfigValue() {
  const sharkFile = path.join(vscode.workspace.rootPath || '', 'shark.xlsx'); // 项目中shark的配置文件
  const editor = vscode.window.activeTextEditor;

  let keys: string[] = [];
  const result:Record<string,string>[]= [];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sharkFile);
  const worksheet = workbook.getWorksheet(1);

  (worksheet || []).eachRow((row, rowNumber) => { 
    let obj:Record<string,string> ={};
    row.eachCell((cell, colNumber)=>{
      const value= `${cell.value}`;
      if (rowNumber === 1) {
        keys.push(value);
      } else {
        obj[keys[colNumber - 1]] = value;
      }
    });
    if (rowNumber > 1) {
      result.push(obj);
    }
  });

  // 获取用户配置的shark前缀
  const sharkPrefix = vscode.workspace.getConfiguration().get('sharkTranslate.sharkPrefix') as Array<string>;
  const sharkStoreVar = vscode.workspace.getConfiguration().get('sharkTranslate.sharkStoreVar') as string;

  if (editor && result.length) {

    const currentCursorPosition = editor.selection.active;
    const selectedText = editor.document.getText(editor.selection) || '';
    
    const sharkObj = result.find(item => item['Origin'] === selectedText) || {};

    if (sharkObj['Origin'] && sharkObj['TransKey']) {

      let transKey = '';
      const hasPrefix = sharkPrefix.find(item =>sharkObj['TransKey'] .startsWith(item))
      if (hasPrefix) {
        transKey = `${sharkStoreVar}['${removeText(sharkObj['TransKey'], hasPrefix)}']`;
      } else {
        transKey = `${sharkStoreVar}['${sharkObj['TransKey']}']`;
      }

      const replaceOption = {
          title: 'Shark Replace',
          tooltip: `确定使用 "${transKey || ''}" 替换 "${selectedText}"`,
      };

      vscode.window.showInformationMessage(`确定使用 "${transKey||''}" 替换 "${selectedText}"`, replaceOption)
          .then((value) => {
              if (value === replaceOption && currentCursorPosition) {
                editor.edit((editBuilder) => {
                    editBuilder.replace(editor.selection, transKey||'');
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
function removeText(originalText:string,textToRemove:string) {
  const regex = new RegExp(textToRemove, 'g');
  return originalText.replace(regex, '');
}

// 从文件内容中提取中文（排除注释）
function extractChineseFromText(text: string): string[] {
  const chineseList: string[] = [];
  
  // 获取注释的位置
  let comments: {start:number, end:number}[] = [];
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
        '**/*.vue',
        '**/*.jsx'
      ];

      // 需要排除的目录
      const excludePatterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/out/**'
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

    // 按 pageId（文件夹名）分组的中文数据
    const pageChineseMap: Map<string, Set<string>> = new Map();

    // 处理每个文件
    for (let i = 0; i < uniqueFiles.length; i++) {
      const filePath = uniqueFiles[i];
      try {
        // 读取文件内容
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        // 提取中文
        const chineseList = extractChineseFromText(fileContent);
        
        if (chineseList.length > 0) {
          // 使用文件的相对路径（相对于项目根目录）作为 pageId
          const pageId = path.relative(workspaceFolder.uri.fsPath, filePath);
          
          // 如果 pageId 不存在，初始化为 Set
          if (!pageChineseMap.has(pageId)) {
            pageChineseMap.set(pageId, new Set());
          }
          
          // 将中文添加到对应的 pageId
          chineseList.forEach(chinese => {
            pageChineseMap.get(pageId)!.add(chinese);
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
    const excelData: { filePath: string; chinese: string }[] = [];
    pageChineseMap.forEach((chineseSet, pageId) => {
      chineseSet.forEach(chinese => {
        excelData.push({ filePath: pageId, chinese });
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
      { header: 'filePath', key: 'filePath', width: 30 },
      { header: '中文', key: 'chinese', width: 50 }
    ];

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
// 查找逻辑：从当前文件所在目录开始，向上查找 Controller.ts 或 Controller.js 文件
function findPageInfoForFile(filePath: string, srcRoot: string): PageInfo {
  let currentDir = path.dirname(filePath);
  
  // 首先检查当前文件是否就是 Controller 文件
  const fileName = path.basename(filePath);
  if (/^(local)?controller\.(ts|js)$/i.test(fileName)) {
    const info = extractInfoFromController(filePath);
    if (info.pageId) {
      return { 
        pageId: info.pageId, 
        pageName: info.pageName || '' 
      };
    }
  }
  
  // 向上查找 Controller 文件，直到 srcRoot
  while (currentDir.startsWith(srcRoot) && currentDir.length >= srcRoot.length) {
    // 检查当前目录下的 Controller 文件
    const controllerFiles = [
      'Controller.ts',
      'Controller.js',
      'controller.ts',
      'controller.js',
      'LocalController.ts',
      'LocalController.js',
      'localController.ts',
      'localController.js'
    ];
    
    for (const controllerFile of controllerFiles) {
      const controllerPath = path.join(currentDir, controllerFile);
      const info = extractInfoFromController(controllerPath);
      if (info.pageId) {
        return { 
          pageId: info.pageId, 
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
  
  // 如果找不到 pageId，使用相对路径作为标识
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  const relativePath = path.relative(workspaceFolder!!.uri.fsPath, path.dirname(filePath));
  return { 
    pageId: `unknown_${relativePath.replace(/[\\\/]/g, '_') || 'root'}`,
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
    const excelData: { pageId: string; pageName: string; chinese: string; key: string }[] = [];
    
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
      // 判断 pageId 是否为有效数字，如果是则生成 key，否则为空
      const isValidPageId = /^\d+$/.test(pageId);
      const key = isValidPageId ? `key.${pageId}.` : '';
      chineseSet.forEach(chinese => {
        excelData.push({ pageId, pageName, chinese, key });
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
      { header: '中文', key: 'chinese', width: 50 },
      { header: 'key', key: 'key', width: 30 }
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

export function deactivate() {}

