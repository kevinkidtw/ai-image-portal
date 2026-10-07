// tests/load-gas.js — 使用 node:vm 與 node:fs 載入 Apps Script 檔案
// 不依賴任何外部 npm 套件

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * 載入單一 GAS 檔案至獨立的 VM context
 * @param {string} relativePath - 例如 'gas/Logic.gs'
 * @param {Object} [contextAdditions={}] - 額外注入的物件
 * @returns {Object} 包含該檔案中宣告之全域變數與函式的 context 物件
 */
function loadGasScript(relativePath, contextAdditions = {}) {
  const filePath = path.resolve(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');

  const context = vm.createContext({
    console,
    JSON,
    ...contextAdditions
  });

  vm.runInContext(code, context);
  return context;
}

/**
 * 載入所有核心 GAS 檔案至同一個 VM context
 * 模擬 Apps Script 專案內檔案共用全域範疇的行為
 * @param {Object} [contextAdditions={}]
 * @returns {Object}
 */
function loadAllGasScripts(contextAdditions = {}) {
  const context = vm.createContext({
    console,
    ...contextAdditions
  });

  const files = ['gas/Logic.gs', 'gas/Providers.gs'];
  for (const rel of files) {
    const fullPath = path.resolve(__dirname, '..', rel);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      vm.runInContext(code, context);
    }
  }

  return context;
}

module.exports = {
  loadGasScript,
  loadAllGasScripts
};
