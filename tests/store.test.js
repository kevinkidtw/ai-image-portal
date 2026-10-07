// tests/store.test.js — gas/Store.gs 之 getConfig 單元測試
// 驗證唯一型別轉換與預設值邏輯

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadGasScript } = require('./load-gas.js');

const StoreModule = loadGasScript('gas/Store.gs');
const Store = StoreModule.Store;

describe('Store.gs 單元測試', () => {
  describe('getConfig (型別轉換與預設值)', () => {
    test('空屬性時完整填補所有預設值並提供正確型別', () => {
      const config = Store.getConfig({});

      assert.strictEqual(config.provider, 'gemini');
      assert.strictEqual(config.geminiApiKey, '');
      assert.strictEqual(config.geminiModel, 'gemini-3.1-flash-image');
      assert.strictEqual(config.openaiApiKey, '');
      assert.strictEqual(config.openaiModel, 'gpt-image-1');
      assert.strictEqual(config.openaiQuality, 'low');
      assert.strictEqual(config.adminPasswordHash, '');
      assert.strictEqual(config.adminPasswordSalt, '');
      assert.strictEqual(config.classCode, '');
      assert.strictEqual(config.serviceOpen, false);
      assert.strictEqual(config.openUntil, null);
      assert.strictEqual(config.dailyLimitGlobal, 200);
      assert.strictEqual(config.dailyLimitPerDevice, 10);
      assert.strictEqual(config.cooldownSec, 20);
      assert.strictEqual(config.maxConcurrent, 8);
      assert.strictEqual(config.allowPhoto, true);
      assert.strictEqual(config.costPerImageUsd, null);
      assert.deepStrictEqual(config.blockedDevices, []);
      assert.strictEqual(config.inFlightTimeoutMs, 150000);
    });

    test('字串布林值正確轉換為原生 boolean', () => {
      const customProps = {
        SERVICE_OPEN: 'true',
        ALLOW_PHOTO: 'false'
      };
      const config = Store.getConfig(customProps);

      assert.strictEqual(config.serviceOpen, true);
      assert.strictEqual(config.allowPhoto, false);
    });

    test('字串數字與浮點數正確轉換為原生有限數字', () => {
      const customProps = {
        DAILY_LIMIT_GLOBAL: '350',
        DAILY_LIMIT_PER_DEVICE: '15',
        COOLDOWN_SEC: '30',
        MAX_CONCURRENT: '5',
        COST_PER_IMAGE_USD: '0.035'
      };
      const config = Store.getConfig(customProps);

      assert.strictEqual(config.dailyLimitGlobal, 350);
      assert.strictEqual(config.dailyLimitPerDevice, 15);
      assert.strictEqual(config.cooldownSec, 30);
      assert.strictEqual(config.maxConcurrent, 5);
      assert.strictEqual(config.costPerImageUsd, 0.035);
    });


    test('無效字串數字安全 fallback 到預設數字', () => {
      const customProps = {
        DAILY_LIMIT_GLOBAL: 'invalid-number',
        DAILY_LIMIT_PER_DEVICE: '',
        COOLDOWN_SEC: null
      };
      const config = Store.getConfig(customProps);

      assert.strictEqual(config.dailyLimitGlobal, 200);
      assert.strictEqual(config.dailyLimitPerDevice, 10);
      assert.strictEqual(config.cooldownSec, 20);
    });

    test('BLOCKED_DEVICES JSON 字串正確解析為陣列，無效時 fallback 為空陣列', () => {
      const validProps = {
        BLOCKED_DEVICES: '["dev-1", "dev-2"]'
      };
      const config1 = Store.getConfig(validProps);
      assert.deepStrictEqual(config1.blockedDevices, ['dev-1', 'dev-2']);

      const invalidProps = {
        BLOCKED_DEVICES: 'invalid-json{'
      };
      const config2 = Store.getConfig(invalidProps);
      assert.deepStrictEqual(config2.blockedDevices, []);
    });

    test('輸出屬性完全為 camelCase 鍵名，且可直接傳入 decideQuota', () => {
      const Logic = loadGasScript('gas/Logic.gs');
      const config = Store.getConfig({
        SERVICE_OPEN: 'true',
        CLASS_CODE: '8888',
        DAILY_LIMIT_GLOBAL: '100'
      });

      const state = {
        deviceId: 'dev-00000001',
        inputClassCode: '8888',
        dailyGlobalCount: 0,
        deviceDailyCount: 0,
        lastDeviceRequestTime: 0,
        inFlightRequests: []
      };

      const quotaRes = Logic.decideQuota(state, config, Date.now());
      assert.strictEqual(quotaRes.allowed, true);
    });
  });
});
