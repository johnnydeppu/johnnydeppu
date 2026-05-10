const APP_NAME = 'サッカー戦術4コマインフォグラフィック生成';
const INPUT_SHEET_NAME = '入力';
const SETTINGS_SHEET_NAME = '設定';
const DEFAULT_BATCH_SIZE = 3;
const INPUT_HEADERS = [
  'ID',
  'テーマ',
  '4コマ内容',
  '伝えたいこと',
  '生成プロンプト',
  'ステータス',
  '画像URL',
  'エラー',
];

const PROPERTY_KEYS = {
  apiKey: 'OPENAI_API_KEY',
  spreadsheetId: 'MANAGER_SPREADSHEET_ID',
  outputFolderId: 'OUTPUT_FOLDER_ID',
};

const STATUS = {
  pending: '未生成',
  processing: '処理中',
  done: '生成済み',
  error: 'エラー',
};

function onOpen() {
  addCustomMenu_();
}

function setup() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = SpreadsheetApp.create(`${APP_NAME} 管理シート`);
  const outputFolder = DriveApp.createFolder(`${APP_NAME} 出力画像`);

  properties.setProperties({
    [PROPERTY_KEYS.spreadsheetId]: spreadsheet.getId(),
    [PROPERTY_KEYS.outputFolderId]: outputFolder.getId(),
  });

  initializeSheets_(spreadsheet, outputFolder);
  installOpenTrigger_(spreadsheet);
  addCustomMenu_();

  Logger.log(`管理用スプレッドシート: ${spreadsheet.getUrl()}`);
  Logger.log(`出力先Google Driveフォルダ: ${outputFolder.getUrl()}`);

  return {
    spreadsheetUrl: spreadsheet.getUrl(),
    outputFolderUrl: outputFolder.getUrl(),
  };
}

function generateNextBatch() {
  const apiKey = getRequiredProperty_(PROPERTY_KEYS.apiKey);
  const spreadsheet = getManagerSpreadsheet_();
  const inputSheet = getOrCreateInputSheet_(spreadsheet);
  const settings = getSettings_(spreadsheet);
  const outputFolder = getOutputFolder_(settings);
  const maxBatchSize = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, Number(settings.batch_size) || DEFAULT_BATCH_SIZE));
  const targetRows = findPendingRows_(inputSheet, maxBatchSize);

  targetRows.forEach((target) => {
    inputSheet.getRange(target.rowNumber, columnIndex_('ステータス')).setValue(STATUS.processing);
    inputSheet.getRange(target.rowNumber, columnIndex_('エラー')).clearContent();
    SpreadsheetApp.flush();

    try {
      const prompt = buildImagePrompt_(target.values, settings);
      const imageBlob = requestOpenAiImage_(apiKey, prompt, settings);
      const imageUrl = saveImageToDrive_(imageBlob, outputFolder, target.values.ID || `row-${target.rowNumber}`);

      inputSheet.getRange(target.rowNumber, columnIndex_('生成プロンプト')).setValue(prompt);
      inputSheet.getRange(target.rowNumber, columnIndex_('ステータス')).setValue(STATUS.done);
      inputSheet.getRange(target.rowNumber, columnIndex_('画像URL')).setValue(imageUrl);
    } catch (error) {
      inputSheet.getRange(target.rowNumber, columnIndex_('ステータス')).setValue(STATUS.error);
      inputSheet.getRange(target.rowNumber, columnIndex_('エラー')).setValue(error.message || String(error));
    }
  });

  return `${targetRows.length}件を処理しました。`;
}

function setOpenAiApiKey(apiKey) {
  if (!apiKey) {
    throw new Error('APIキーを指定してください。');
  }
  PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS.apiKey, apiKey.trim());
}

function addCustomMenu_() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('4コマ画像生成')
      .addItem('初期セットアップ', 'setup')
      .addItem('未生成を最大3件生成', 'generateNextBatch')
      .addSeparator()
      .addItem('OpenAI APIキーを保存', 'showApiKeyPrompt_')
      .addToUi();
  } catch (error) {
    Logger.log(`カスタムメニューを追加できませんでした: ${error.message}`);
  }
}

function showApiKeyPrompt_() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('OpenAI APIキーを保存', 'Script Propertiesに保存するAPIキーを入力してください。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  setOpenAiApiKey(response.getResponseText());
  ui.alert('OpenAI APIキーをScript Propertiesに保存しました。');
}

function initializeSheets_(spreadsheet, outputFolder) {
  const inputSheet = getOrCreateInputSheet_(spreadsheet);
  inputSheet.clear();
  inputSheet.getRange(1, 1, 1, INPUT_HEADERS.length).setValues([INPUT_HEADERS]);
  inputSheet.setFrozenRows(1);
  inputSheet.getRange(1, 1, 1, INPUT_HEADERS.length).setFontWeight('bold').setBackground('#d9ead3');
  inputSheet.autoResizeColumns(1, INPUT_HEADERS.length);

  const sampleRow = [
    Utilities.getUuid(),
    '偽9番が中盤に降りてCBを迷わせる動き',
    '1コマ目: 相手CBが人につくか迷う。\n2コマ目: 偽9番が中盤で受ける。\n3コマ目: WGが背後へ走る。\n4コマ目: スルーパスで決定機。',
    '相手最終ラインを動かすことで背後のスペースを作れる。',
    '',
    STATUS.pending,
    '',
    '',
  ];
  inputSheet.getRange(2, 1, 1, INPUT_HEADERS.length).setValues([sampleRow]);
  inputSheet.getRange('C:C').setWrap(true);
  inputSheet.getRange('E:E').setWrap(true);

  const settingsSheet = getOrCreateSettingsSheet_(spreadsheet);
  settingsSheet.clear();
  settingsSheet.getRange(1, 1, 1, 3).setValues([['キー', '値', '説明']]);
  settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#cfe2f3');
  settingsSheet.getRange(2, 1, 8, 3).setValues([
    ['model', 'gpt-image-1', 'OpenAI Images APIで使うモデル'],
    ['image_size', '1024x1536', '縦長画像サイズ。9:16構図をプロンプトで指定します。'],
    ['quality', 'high', '画像品質。必要に応じてauto/medium/highなどに変更してください。'],
    ['batch_size', String(DEFAULT_BATCH_SIZE), '1回の実行で処理する最大件数。コード側でも最大3件に制限します。'],
    ['output_folder_id', outputFolder.getId(), '生成画像を保存するGoogle DriveフォルダID'],
    ['output_folder_url', outputFolder.getUrl(), '生成画像を保存するGoogle DriveフォルダURL'],
    ['spreadsheet_id', spreadsheet.getId(), '管理用スプレッドシートID'],
    ['spreadsheet_url', spreadsheet.getUrl(), '管理用スプレッドシートURL'],
  ]);
  settingsSheet.autoResizeColumns(1, 3);
}

function getOrCreateInputSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(INPUT_SHEET_NAME) || spreadsheet.insertSheet(INPUT_SHEET_NAME);
}

function getOrCreateSettingsSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(SETTINGS_SHEET_NAME) || spreadsheet.insertSheet(SETTINGS_SHEET_NAME);
}

function installOpenTrigger_(spreadsheet) {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'onOpen')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(spreadsheet)
    .onOpen()
    .create();
}

function getManagerSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.spreadsheetId);
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    return activeSpreadsheet;
  }
  throw new Error('管理用スプレッドシートが見つかりません。先にsetup()を実行してください。');
}

function getSettings_(spreadsheet) {
  const settingsSheet = getOrCreateSettingsSheet_(spreadsheet);
  const values = settingsSheet.getDataRange().getValues();
  const settings = {};
  values.slice(1).forEach((row) => {
    if (row[0]) {
      settings[String(row[0]).trim()] = String(row[1] || '').trim();
    }
  });
  return settings;
}

function getOutputFolder_(settings) {
  const folderId = settings.output_folder_id || PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.outputFolderId);
  if (!folderId) {
    throw new Error('出力先Google DriveフォルダIDが見つかりません。先にsetup()を実行してください。');
  }
  return DriveApp.getFolderById(folderId);
}

function findPendingRows_(inputSheet, limit) {
  const lastRow = inputSheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = inputSheet.getRange(2, 1, lastRow - 1, INPUT_HEADERS.length).getValues();
  return values
    .map((row, index) => ({
      rowNumber: index + 2,
      values: rowToObject_(row),
    }))
    .filter((target) => isPendingStatus_(target.values['ステータス']))
    .slice(0, limit);
}

function rowToObject_(row) {
  return INPUT_HEADERS.reduce((object, header, index) => {
    object[header] = row[index];
    return object;
  }, {});
}

function isPendingStatus_(status) {
  const normalized = String(status || '').trim();
  return normalized === '' || normalized === STATUS.pending;
}

function buildImagePrompt_(row, settings) {
  if (row['生成プロンプト']) {
    return String(row['生成プロンプト']);
  }

  return [
    'サッカー戦術を説明する縦長9:16の4コマインフォグラフィックを日本語で作成してください。',
    '1枚の画像内を上から下へ4つのパネルに分割し、各パネルに短い見出し、矢印、選手アイコン、ピッチ図を入れてください。',
    'SNSで読みやすいように余白を広めに取り、文字は大きく、配色は緑のピッチ、白い線、アクセントに黄色を使ってください。',
    '実在選手の顔写真やクラブロゴは使わず、抽象的なユニフォームと戦術ボード風の表現にしてください。',
    `テーマ: ${row['テーマ'] || '未指定'}`,
    `4コマ内容: ${row['4コマ内容'] || '未指定'}`,
    `伝えたいこと: ${row['伝えたいこと'] || '未指定'}`,
    settings.additional_prompt ? `追加指示: ${settings.additional_prompt}` : '',
  ].filter(Boolean).join('\n');
}

function requestOpenAiImage_(apiKey, prompt, settings) {
  const payload = {
    model: settings.model || 'gpt-image-1',
    prompt,
    n: 1,
    size: settings.image_size || '1024x1536',
    quality: settings.quality || 'high',
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/images/generations', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`OpenAI Images API error (${statusCode}): ${bodyText}`);
  }

  const body = JSON.parse(bodyText);
  const firstImage = body.data && body.data[0];
  if (!firstImage) {
    throw new Error('OpenAI Images APIから画像データが返りませんでした。');
  }

  if (firstImage.b64_json) {
    const bytes = Utilities.base64Decode(firstImage.b64_json);
    return Utilities.newBlob(bytes, 'image/png', 'generated.png');
  }

  if (firstImage.url) {
    const imageResponse = UrlFetchApp.fetch(firstImage.url);
    return imageResponse.getBlob().setName('generated.png');
  }

  throw new Error('OpenAI Images APIのレスポンスにb64_jsonまたはurlがありません。');
}

function saveImageToDrive_(imageBlob, outputFolder, rowId) {
  const safeId = String(rowId).replace(/[\\/:*?"<>|#%{}~&]/g, '-').slice(0, 80);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const file = outputFolder.createFile(imageBlob.setName(`${safeId}-${timestamp}.png`));
  return file.getUrl();
}

function getRequiredProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`${key} がScript Propertiesに設定されていません。setOpenAiApiKey('YOUR_API_KEY')を実行するか、メニューから保存してください。`);
  }
  return value;
}

function columnIndex_(header) {
  const index = INPUT_HEADERS.indexOf(header);
  if (index === -1) {
    throw new Error(`列が見つかりません: ${header}`);
  }
  return index + 1;
}
