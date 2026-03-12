// utils/image-cache.js
// 统一图片缓存层：以 imageKey 为唯一 ID 管理所有飞书图片的本地缓存
//
// 接口：
//   getCached(imageKey)                           → string|null  同步，文件存在返回路径，否则 null
//   getImage(imageKey, cloudFileID)               → Promise<string>  命中直接返回，未命中下载后返回
//   prefetchImages(imageKeys, onEach, concurrency) → Promise<void>  批量预下载，每张完成后回调
//   evict(imageKey)                               → void  删除本地文件（图片更新时调用）

const { downloadImageByKey } = require('./image-downloader.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

function _localPath(imageKey) {
  return `${wx.env.USER_DATA_PATH}/img_${imageKey}.png`
}

function _fileExists(path) {
  try { wx.getFileSystemManager().accessSync(path); return true } catch (e) { return false }
}

/**
 * 同步检查 imageKey 对应的文件是否存在。
 * 添加重试机制以应对文件系统延迟。
 * @param {string} imageKey
 * @returns {string|null}
 */
function getCached(imageKey) {
  if (!imageKey) return null
  const path = _localPath(imageKey)

  // 尝试 3 次，每次间隔 10ms
  for (let i = 0; i < 3; i++) {
    if (_fileExists(path)) return path
    if (i < 2) {
      // 简单的同步延迟（应对文件系统延迟）
      const start = Date.now()
      while (Date.now() - start < 10) {}
    }
  }

  return null
}

/**
 * 获取图片本地路径（优先本地缓存，然后根据是否有 cloudFileID 选择下载源）
 * @param {string} imageKey - 飞书 image_key（用于缓存文件名）
 * @param {string} cloudFileID - 云存储 fileID（可选）
 * @returns {Promise<string>}
 */
async function getImage(imageKey, cloudFileID = null) {
  if (!imageKey) throw new Error('imageKey 不能为空')

  // 1. 检查本地缓存
  const cached = getCached(imageKey)
  if (cached) return cached

  // 2. 如果开关开启且有 cloudFileID，从云存储下载（带重试）
  if (DATA_SOURCE_CONFIG.useCloudStorage && cloudFileID) {
    const path = await downloadFromCloudStorage(cloudFileID, imageKey)
    console.log(`[图片缓存] 云存储下载成功: ${imageKey}`)
    return path
  }

  // 3. 没有 cloudFileID，从飞书下载（旧数据）
  await downloadImageByKey(imageKey, 'img', imageKey)
  const saved = getCached(imageKey)
  if (!saved) throw new Error(`图片持久化失败: ${imageKey}`)
  return saved
}

/**
 * 批量预下载图片（并发控制）。已缓存的跳过，未缓存的下载。
 * @param {Array<string|{imageKey: string, cloudFileID: string}>} imageKeys - imageKey 数组或包含 cloudFileID 的对象数组
 * @param {Function} [onEach] (imageKey, localPath) => void
 * @param {number} [concurrency]
 */
async function prefetchImages(imageKeys, onEach, concurrency = 10) {
  if (!imageKeys || imageKeys.length === 0) return

  const tasks = imageKeys.filter(k => k).map(item => async () => {
    // 兼容旧格式（纯字符串）和新格式（对象）
    const imageKey = typeof item === 'string' ? item : item.imageKey
    const cloudFileID = typeof item === 'object' ? item.cloudFileID : null

    const cached = getCached(imageKey)
    if (cached) {
      if (onEach) onEach(imageKey, cached)
      return
    }
    try {
      // 如果开关开启且有 cloudFileID，从云存储下载（带重试）
      if (DATA_SOURCE_CONFIG.useCloudStorage && cloudFileID) {
        const path = await downloadFromCloudStorage(cloudFileID, imageKey)
        if (onEach) onEach(imageKey, path)
        return
      }

      // 没有 cloudFileID，从飞书下载（旧数据）
      await downloadImageByKey(imageKey, 'img', imageKey)
      // 验证文件确实保存到了预期路径（saveFile 失败时会 fallback 返回 tempFilePath）
      const saved = getCached(imageKey)
      if (saved) {
        if (onEach) onEach(imageKey, saved)
      } else {
        console.error(`[ImageCache] 文件未持久化，跳过 ${imageKey}`)
      }
    } catch (err) {
      console.error(`[ImageCache] 下载失败 ${imageKey}:`, err)
    }
  })

  await _downloadWithLimit(tasks, concurrency)
}

/**
 * 删除 imageKey 对应的本地文件（图片更新时调用）。
 * @param {string} imageKey
 */
function evict(imageKey) {
  if (!imageKey) return
  try { wx.getFileSystemManager().unlinkSync(_localPath(imageKey)) } catch (e) { /* 忽略 */ }
}

async function _downloadWithLimit(tasks, limit) {
  for (let i = 0; i < tasks.length; i += limit) {
    await Promise.allSettled(tasks.slice(i, i + limit).map(t => t()))
  }
}

/**
 * 从云存储下载图片（带重试机制）
 * @param {string} fileID - 云存储 fileID
 * @param {string} imageKey - 飞书 image_key（用于缓存文件名）
 * @returns {Promise<string>}
 */
async function downloadFromCloudStorage(fileID, imageKey) {
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

      if (downloadRes.statusCode !== 200) {
        throw new Error(`Download failed with status ${downloadRes.statusCode}`)
      }

      // 持久化保存（使用 imageKey 作为文件名，保持一致性）
      const localPath = _localPath(imageKey)

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
      console.warn(`[云存储] 下载失败 (尝试 ${attempt}/${maxRetries}): ${imageKey}`, err)

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
