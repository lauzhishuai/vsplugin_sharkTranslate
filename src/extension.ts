import * as vscode from 'vscode';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

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

    // 匹配非注释部分英文引号中的字符
    const chinesePattern = /['"]((?=[^'"\n]*[\u4e00-\u9fa5])[^'"\n]+)['"]/g;

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
      const newText = text.replace(chinesePattern, (match, p1, p2, offset) => {
        const isInComment = comments.some(comment => p2 >= comment.start && p2 <= comment.end);
        if (!isInComment) {
          const content = match.slice(1, -1); // 去掉引号
          for (const { Origin, TransKey } of result) {
            if (Origin === content) {
              const hasPrefix = sharkPrefix.find(item => TransKey.startsWith(item));
              if (hasPrefix) {
                return `${sharkStoreVar}['${removeText(TransKey, hasPrefix)}']`;
              } else {
                return `${sharkStoreVar}['${TransKey}']`;
              }
            }
          }
        }
        return match;
      });

      // 创建一个编辑器编辑操作
      editor.edit(editBuilder => {
          const firstLine = document.lineAt(0);
          const lastLine = document.lineAt(document.lineCount - 1);
          const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
          editBuilder.replace(textRange, newText);
      });
    }
  });

  context.subscriptions.push(disposableOneSharkReplace);
  context.subscriptions.push(disposableAllSharkReplace);
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

  if (editor && result.length) {

    const currentCursorPosition = editor.selection.active;
    const selectedText = editor.document.getText(editor.selection) || '';
    const currentWord = editor.document.getText(editor.document.getWordRangeAtPosition(currentCursorPosition));
    
    const sharkObj = result.find(item=>item['Origin'] === selectedText) || {};

    if (sharkObj['Origin']) {
      const replaceOption = {
          title: 'Shark Replace',
          tooltip: `确定使用 "${sharkObj['TransKey']||''}" 替换 "${selectedText}"`,
      };

      vscode.window.showInformationMessage(`确定使用 "${sharkObj['TransKey']||''}" 替换 "${selectedText}"`, replaceOption)
          .then((value) => {
              if (value === replaceOption && currentCursorPosition) {
                editor.edit((editBuilder) => {
                    editBuilder.replace(editor.selection, sharkObj['TransKey']||'');
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

export function deactivate() {}
