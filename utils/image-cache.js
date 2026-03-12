// utils/image-cache.js
// 统一图片缓存层：使用 fileID 作为缓存标识
//
// 接口：
//   getCached(fileID)                              → string|null  同步，文件存在返回路径，否则 null
//   getImage(cloudFileID)                          → Promise<string>  命中直接返回，未命中下载后返回
//   prefetchImages(items, onEach, concurrency)     → Promise<void>  批量预下载，每张完成后回调
//   evict(fileID)                                  → void  删除本地文件（图片更新时调用）

function _localPath(fileID) {
  // 清理 fileID：移除 cloud:// 前缀，替换特殊字符
  const cleanID = fileID
    .replace(/^cloud:\/\//, '')  // 移除 cloud:// 前缀
    .replace(/[\/\\:]/g, '_')     // 替换路径分隔符和冒号

  return `${wx.env.USER_DATA_PATH}/img_${cleanID}`
}

function _fileExists(path) {
  try { wx.getFileSystemManager().accessSync(path); return true } catch (e) { return false }
}

/**
 * 同步检查缓存文件是否存在
 * @param {string} fileID - 云存储 fileID
 * @returns {string|null}
 */
function getCached(fileID) {
  if (!fileID) return null

  const path = _localPath(fileID)
  for (let i = 0; i < 3; i++) {
    if (_fileExists(path)) return path
    if (i < 2) {
      const start = Date.now()
      while (Date.now() - start < 10) {}
    }
  }

  return null
}

/**
 * 获取图片本地路径（优先本地缓存，未命中从云存储下载）
 * @param {string} cloudFileID - 云存储 fileID（必需）
 * @returns {Promise<string>}
 */
async function getImage(cloudFileID) {
  if (!cloudFileID) {
    throw new Error('cloudFileID 不能为空，所有图片必须先迁移到云存储')
  }

  // 1. 检查本地缓存
  const cached = getCached(cloudFileID)
  if (cached) return cached

  // 2. 从云存储下载（使用 fileID 作为缓存文件名）
  const path = await downloadFromCloudStorage(cloudFileID, cloudFileID)
  console.log(`[图片缓存] 云存储下载成功: ${cloudFileID}`)
  return path
}

/**
 * 批量预下载图片（并发控制）。已缓存的跳过，未缓存的下载。
 * @param {Array<{imageKey: string, cloudFileID: string}>} items - 包含 cloudFileID 的对象数组
 * @param {Function} [onEach] (imageKey, localPath) => void
 * @param {number} [concurrency]
 */
async function prefetchImages(items, onEach, concurrency = 10) {
  if (!items || items.length === 0) return

  const tasks = items.filter(item => item && item.cloudFileID).map(item => async () => {
    const { imageKey, cloudFileID } = item

    const cached = getCached(cloudFileID)
    if (cached) {
      if (onEach) onEach(imageKey, cached)
      return
    }

    try {
      const path = await downloadFromCloudStorage(cloudFileID, cloudFileID)
      if (onEach) onEach(imageKey, path)
    } catch (err) {
      console.error(`[ImageCache] 下载失败 ${cloudFileID}:`, err)
    }
  })

  await _downloadWithLimit(tasks, concurrency)
}

/**
 * 删除 fileID 对应的本地文件（图片更新时调用）
 * @param {string} fileID - 云存储 fileID
 */
function evict(fileID) {
  if (!fileID) return
  try { wx.getFileSystemManager().unlinkSync(_localPath(fileID)) } catch (e) { /* 忽略 */ }
}

async function _downloadWithLimit(tasks, limit) {
  for (let i = 0; i < tasks.length; i += limit) {
    await Promise.allSettled(tasks.slice(i, i + limit).map(t => t()))
  }
}

/**
 * 从云存储下载图片（带重试机制）
 * @param {string} fileID - 云存储 fileID
 * @param {string} cacheIdentifier - 缓存文件名标识（使用 fileID）
 * @returns {Promise<string>}
 */
async function downloadFromCloudStorage(fileID, cacheIdentifier) {
  const maxRetries = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用云存储的 downloadFile 接口直接下载
      const downloadRes = await new Promise((resolve, reject) => {
        wx.cloud.downloadFile({
          fileID: fileID,
          success: resolve,
          fail: reject
        })
      })

      console.log(`[云存储] 下载响应:`, {
        statusCode: downloadRes.statusCode,
        tempFilePath: downloadRes.tempFilePath,
        fileID: fileID
      })

      if (downloadRes.statusCode !== 200) {
        throw new Error(`Download failed with status ${downloadRes.statusCode}`)
      }

      // 持久化保存（使用 fileID 作为文件名）
      const localPath = _localPath(cacheIdentifier)

      try {
        await new Promise((resolve, reject) => {
          wx.getFileSystemManager().saveFile({
            tempFilePath: downloadRes.tempFilePath,
            filePath: localPath,
            success: resolve,
            fail: reject
          })
        })
      } catch (saveErr) {
        console.warn(`[云存储] 持久化失败，使用临时路径`, saveErr)
        return downloadRes.tempFilePath
      }

      return localPath
    } catch (err) {
      lastError = err
      console.warn(`[云存储] 下载失败 (尝试 ${attempt}/${maxRetries}): ${fileID}`, err)

      if (attempt < maxRetries) {
        // 等待后重试（指数退避：1s, 2s, 4s）
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // 所有重试都失败
  throw new Error(`云存储下载失败，已重试 ${maxRetries} 次: ${lastError.message}`)
}

module.exports = { getCached, getImage, prefetchImages, evict }
