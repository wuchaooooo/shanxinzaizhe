// utils/cache-helper.js
// 通用缓存工具 - 用于团队和活动数据的缓存管理

/**
 * 创建一个缓存管理器
 * @param {string} cacheKey - 缓存键名
 * @returns {Object} - 包含 get 和 save 方法的对象
 */
function createCacheManager(cacheKey) {
  return {
    /**
     * 获取缓存
     * @returns {Object} - 缓存对象，如果不存在则返回空对象
     */
    get() {
      try {
        return wx.getStorageSync(cacheKey) || {}
      } catch (e) {
        console.error(`读取缓存失败 (${cacheKey}):`, e)
        return {}
      }
    },

    /**
     * 保存缓存
     * @param {Object} cache - 要保存的缓存对象
     */
    save(cache) {
      try {
        wx.setStorageSync(cacheKey, cache)
      } catch (e) {
        console.error(`保存缓存失败 (${cacheKey}):`, e)
      }
    },

    /**
     * 清除缓存
     */
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
 * 验证文件路径是否存在
 * @param {string} path - 文件路径
 * @returns {boolean} - 文件是否存在
 */
function validateFilePath(path) {
  if (!path) return false
  try {
    const fs = wx.getFileSystemManager()
    fs.accessSync(path)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 检查记录是否需要更新（基于 lastModified）
 * @param {Object} cache - 缓存对象
 * @param {string} cacheKey - 记录的缓存键
 * @param {string} lastModified - 当前记录的 lastModified
 * @returns {boolean} - 是否需要更新
 */
function isRecordChanged(cache, cacheKey, lastModified) {
  if (!cacheKey || !cache[cacheKey]) return true
  return cache[cacheKey].lastModified !== lastModified
}

/**
 * 检查图片 key 是否变化
 * @param {Object} cache - 缓存对象
 * @param {string} cacheKey - 记录的缓存键
 * @param {string|Array} imageKey - 当前的图片 key（可以是字符串或数组）
 * @returns {boolean} - 图片 key 是否变化
 */
function isImageKeyChanged(cache, cacheKey, imageKey) {
  if (!cacheKey || !cache[cacheKey]) return false

  const cachedKey = cache[cacheKey].imageKey
  const cachedKeys = cache[cacheKey].imageKeys

  // 处理单个 imageKey
  if (typeof imageKey === 'string') {
    return cachedKey && cachedKey !== imageKey
  }

  // 处理 imageKeys 数组
  if (Array.isArray(imageKey)) {
    if (!cachedKeys || cachedKeys.length !== imageKey.length) return true
    return imageKey.some((key, i) => cachedKeys[i] !== key)
  }

  return false
}

/**
 * 从缓存中恢复图片路径（验证文件是否存在）
 * @param {Object} cache - 缓存对象
 * @param {string} cacheKey - 记录的缓存键
 * @param {boolean} isMultiImage - 是否是多图片（返回数组）
 * @returns {string|Array} - 图片路径或路径数组
 */
function restoreImagePaths(cache, cacheKey, isMultiImage = false) {
  if (!cacheKey || !cache[cacheKey]) {
    return isMultiImage ? [] : ''
  }

  if (isMultiImage) {
    // 多图片：返回路径数组
    const cachedPaths = cache[cacheKey].imagePaths || []
    const validPaths = []

    cachedPaths.forEach(path => {
      if (validateFilePath(path)) {
        validPaths.push(path)
      }
    })

    return validPaths
  } else {
    // 单图片：返回路径字符串
    const cachedPath = cache[cacheKey].imagePath || ''
    if (validateFilePath(cachedPath)) {
      return cachedPath
    }
    return ''
  }
}

/**
 * 更新缓存条目
 * @param {Object} cache - 缓存对象
 * @param {string} cacheKey - 记录的缓存键
 * @param {Object} data - 要缓存的数据
 * @param {string} lastModified - lastModified 时间戳
 * @param {string|Array} imageKey - 图片 key（可以是字符串或数组）
 * @param {string|Array} imagePath - 图片路径（可以是字符串或数组）
 */
function updateCacheEntry(cache, cacheKey, data, lastModified, imageKey, imagePath) {
  if (!cacheKey) return

  if (!cache[cacheKey]) {
    cache[cacheKey] = {}
  }

  cache[cacheKey].lastModified = lastModified
  cache[cacheKey].data = data

  // 处理单个图片
  if (typeof imageKey === 'string') {
    cache[cacheKey].imageKey = imageKey
    cache[cacheKey].imagePath = imagePath || ''
  }

  // 处理多个图片
  if (Array.isArray(imageKey)) {
    cache[cacheKey].imageKeys = imageKey
    cache[cacheKey].imagePaths = Array.isArray(imagePath) ? imagePath : []
  }
}

/**
 * 删除旧的图片文件
 * @param {string|Array} oldPath - 旧的图片路径（可以是字符串或数组）
 * @param {string|Array} newPath - 新的图片路径（可以是字符串或数组）
 */
function deleteOldImageFile(oldPath, newPath) {
  const fs = wx.getFileSystemManager()

  const deleteSingleFile = (path, skipPath) => {
    if (path && path !== skipPath) {
      try {
        fs.unlinkSync(path)
      } catch (e) {
        // 文件可能已经不存在
      }
    }
  }

  if (typeof oldPath === 'string') {
    deleteSingleFile(oldPath, newPath)
  } else if (Array.isArray(oldPath)) {
    const newPaths = Array.isArray(newPath) ? newPath : []
    oldPath.forEach(path => {
      if (!newPaths.includes(path)) {
        deleteSingleFile(path, null)
      }
    })
  }
}

module.exports = {
  createCacheManager,
  validateFilePath,
  isRecordChanged,
  isImageKeyChanged,
  restoreImagePaths,
  updateCacheEntry,
  deleteOldImageFile
}
