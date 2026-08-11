/**
 * AI-OCR文字起こしツール用 GASテンプレート保存バックエンド
 *
 * このスクリプトをGoogleスプレッドシートに紐づくApps Scriptとして設置し、
 * 「ウェブアプリ」としてデプロイすると、AI-OCRツールの設定画面から
 * 抽出領域テンプレートをクラウド保存・再利用できるようになります。
 *
 * セットアップ手順は ../GAS_SETUP.md を参照してください。
 */

const SHEET_NAME = 'Templates';

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify(getAllTemplates()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result = { status: 'ok' };
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'saveTemplate') {
      saveTemplate(body);
    } else {
      throw new Error('未対応のactionです: ' + body.action);
    }
  } catch (err) {
    result = { status: 'error', message: String(err.message || err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['name', 'regionsJson', 'updatedAt']);
  }
  return sheet;
}

function getAllTemplates() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var templates = [];
  for (var i = 1; i < values.length; i++) {
    var name = values[i][0];
    var regionsJson = values[i][1];
    if (!name || !regionsJson) continue;
    templates.push({ name: name, regions: JSON.parse(regionsJson) });
  }
  return templates;
}

function saveTemplate(body) {
  if (!body.name || !body.regions) {
    throw new Error('テンプレート名または領域データがありません。');
  }

  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var regionsJson = JSON.stringify(body.regions);
  var now = new Date();

  var targetRow = -1;
  if (body.isUpdate && body.originalName) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === body.originalName) {
        targetRow = i + 1; // シート上の行番号（ヘッダー分+1、0始まり分+1）
        break;
      }
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, 3).setValues([[body.name, regionsJson, now]]);
    return;
  }

  // 新規保存: 同名テンプレートが既にあれば拒否
  for (var j = 1; j < values.length; j++) {
    if (values[j][0] === body.name) {
      throw new Error('同名のテンプレートが既に存在します: ' + body.name);
    }
  }
  sheet.appendRow([body.name, regionsJson, now]);
}
