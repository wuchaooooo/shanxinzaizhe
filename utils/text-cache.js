// utils/text-cache.js
// 文字数据缓存工具 - 用于团队和活动文字数据的缓存管理
// 图片缓存请使用 image-cache.js

/**
 * 创建一个缓存管理器
 * @param {string} cacheKey - 缓存键名
 * @returns {Object} - 包含 get、save、clear 方法的对象
 */
function createCacheManager(cacheKey) {
  return {
    get() {
      try {
        return wx.getStorageSync(cacheKey) || {}
      } catch (e) {
        console.error(`读取缓存失败 (${cacheKey}):`, e)
        return {}
      }
    },
    save(cache) {
      try {
        wx.setStorageSync(cacheKey, cache)
      } catch (e) {
        console.error(`保存缓存失败 (${cacheKey}):`, e)
      }
    },
    clear() {
      try {
        wx.removeStorageSync(cacheKey)
      } catch (e) {
        console.error(`清除缓存失败 (${cacheKey}):`, e)
      }
    }
  }
}

/**
 * 检查记录是否需要更新（基于 lastModified）
 * @param {Object} cache - 缓存对象
 * @param {string} cacheKey - 记录的缓存键
 * @param {string} lastModified - 当前记录的 lastModified
 * @returns {boolean}
 */
function isRecordChanged(cache, cacheKey, lastModified) {
  if (!cacheKey || !cache[cacheKey]) return true
  return cache[cacheKey].lastModified !== lastModified
}

module.exports = { createCacheManager, isRecordChanged }
