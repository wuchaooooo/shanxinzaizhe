// utils/image-cache.js
// 统一图片缓存层：使用 fileID 作为缓存标识
//
// 接口：
//   getCached(fileID)                              → string|null  同步，文件存在返回路径，否则 null
//   getImage(cloudFileID)                          → Promise<string>  命中直接返回，未命中下载后返回
//   prefetchImages(items, onEach, concurrency)     → Promise<void>  批量预下载，每张完成后回调
//   evict(fileID)                                  → void  删除本地文件（图片更新时调用）

// 内存缓存：用于开发者工具环境（http://tmp/ 路径）
const _memoryCache = {}

function _localPath(fileID) {
  // 清理 fileID：移除空格换行符、cloud:// 前缀，替换特殊字符
  const cleanID = String(fileID || '')
    .trim()                           // 移除首尾空格和换行符
    .replace(/^cloud:\/\//, '')       // 移除 cloud:// 前缀
    .replace(/[\/\\:]/g, '_')         // 替换路径分隔符和冒号

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

  // 先检查内存缓存（开发者工具环境的 http://tmp/ 路径）
  if (_memoryCache[fileID]) {
    return _memoryCache[fileID]
  }

  // 再检查文件系统缓存
  const path = _localPath(fileID)
  return _fileExists(path) ? path : null
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
  if (cached) {
    console.log(`[图片缓存] 命中缓存: ${cloudFileID.substring(0, 50)}...`)
    return cached
  }

  // 2. 从云存储下载（使用 fileID 作为缓存文件名）
  console.log(`[图片缓存] 缓存未命中，开始下载: ${cloudFileID.substring(0, 50)}...`)
  const path = await downloadFromCloudStorage(cloudFileID, cloudFileID)
  console.log(`[图片缓存] 云存储下载成功: ${cloudFileID}`)
  return path
}

/**
 * 批量预下载图片（并发控制）。已缓存的跳过，未缓存的下载。
 * @param {Array<{cloudFileID: string}>} items - 包含 cloudFileID 的对象数组
 * @param {Function} [onEach] (cloudFileID, localPath) => void
 * @param {number} [concurrency]
 */
async function prefetchImages(items, onEach, concurrency = 10) {
  if (!items || items.length === 0) return

  const tasks = items.filter(item => item && item.cloudFileID).map(item => async () => {
    const { cloudFileID } = item

    const cached = getCached(cloudFileID)
    if (cached) {
      if (onEach) onEach(cloudFileID, cached)
      return
    }

    try {
      const path = await downloadFromCloudStorage(cloudFileID, cloudFileID)
      if (onEach) onEach(cloudFileID, path)
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

  // 清除内存缓存
  delete _memoryCache[fileID]

  // 删除文件系统缓存
  try { wx.getFileSystemManager().unlinkSync(_localPath(fileID)) } catch (e) { /* 忽略 */ }
}

async function _downloadWithLimit(tasks, limit) {
  for (let i = 0; i < tasks.length; i += limit) {
    await Promise.allSettled(tasks.slice(i, i + limit).map(t => t()))
  }
}

/**
 * 同步持久化文件（阻塞直到完成）
 * @param {string} tempPath - 临时文件路径
 * @param {string} localPath - 持久化目标路径
 * @param {string} cacheIdentifier - 缓存标识
 * @returns {string} 持久化后的路径
 */
function _persistFileSync(tempPath, localPath, cacheIdentifier) {
  try {
    wx.getFileSystemManager().saveFileSync(tempPath, localPath)
    console.log(`[图片缓存] 持久化成功: ${cacheIdentifier}`)
    // 更新内存缓存为永久路径
    _memoryCache[cacheIdentifier] = localPath
    return localPath
  } catch (err) {
    console.warn(`[图片缓存] 持久化失败: ${cacheIdentifier}`, err)
    // 持久化失败，返回临时路径（仍然可用）
    _memoryCache[cacheIdentifier] = tempPath
    return tempPath
  }
}

/**
 * 从云存储下载图片（带重试机制）
 * @param {string} fileID - 云存储 fileID
 * @param {string} cacheIdentifier - 缓存文件名标识（使用 fileID）
 * @returns {Promise<string>}
 */
async function downloadFromCloudStorage(fileID, cacheIdentifier) {
  // 清理 fileID 的空格、换行符、以及可能的 JSON 数组标记
  let cleanFileID = String(fileID || '').trim()

  // 移除可能的 JSON 数组标记（如果 fileID 被错误地当作数组字符串）
  cleanFileID = cleanFileID.replace(/^[\["\s]+|[\]"\s]+$/g, '')

  if (!cleanFileID) {
    throw new Error('fileID is empty')
  }

  console.log(`[云存储] 开始下载:`, {
    原始fileID: fileID,
    清理后: cleanFileID
  })

  const maxRetries = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 方法1：直接使用 wx.cloud.downloadFile
      const downloadRes = await new Promise((resolve, reject) => {
        wx.cloud.downloadFile({
          fileID: cleanFileID,
          success: resolve,
          fail: (err) => {
            console.error(`[云存储] downloadFile 失败:`, err)
            reject(err)
          }
        })
      })

      console.log(`[云存储] 下载响应:`, {
        statusCode: downloadRes.statusCode,
        tempFilePath: downloadRes.tempFilePath,
        fileID: cleanFileID
      })

      if (downloadRes.statusCode !== 200) {
        throw new Error(`Download failed with status ${downloadRes.statusCode}`)
      }

      // 检查 tempFilePath 是否有效
      if (!downloadRes.tempFilePath) {
        throw new Error('tempFilePath is empty')
      }

      const tempPath = downloadRes.tempFilePath

      // 立即存入内存缓存（避免在持久化完成之前重复下载）
      _memoryCache[cacheIdentifier] = tempPath

      // 如果 tempFilePath 是 http:// 开头，说明是开发者工具的模拟路径
      // 无法持久化，直接返回
      if (tempPath.startsWith('http://')) {
        console.log(`[图片缓存] 开发者工具环境，存入内存缓存: ${cacheIdentifier}`)
        return tempPath
      }

      // 真机环境：同步持久化（阻塞直到完成）
      const localPath = _localPath(cacheIdentifier)
      const persistedPath = _persistFileSync(tempPath, localPath, cacheIdentifier)

      return persistedPath
    } catch (err) {
      lastError = err
      console.error(`[云存储] 下载失败 (尝试 ${attempt}/${maxRetries}):`, {
        errCode: err.errCode,
        errMsg: err.errMsg,
        fileID: cleanFileID
      })

      // 如果是第一次失败，尝试使用备选方案：getTempFileURL + wx.downloadFile
      if (attempt === 1) {
        console.log(`[云存储] 尝试备选方案：getTempFileURL + wx.downloadFile`)
        try {
          // 获取临时下载链接
          const tempUrlRes = await new Promise((resolve, reject) => {
            wx.cloud.getTempFileURL({
              fileList: [cleanFileID],
              success: resolve,
              fail: (err) => {
                console.error(`[云存储] getTempFileURL 失败:`, err)
                reject(err)
              }
            })
          })

          console.log(`[云存储] getTempFileURL 响应:`, tempUrlRes)

          if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
            const fileInfo = tempUrlRes.fileList[0]
            console.log(`[云存储] 文件信息:`, {
              fileID: fileInfo.fileID,
              tempFileURL: fileInfo.tempFileURL,
              status: fileInfo.status,
              errMsg: fileInfo.errMsg
            })

            if (fileInfo.status === 0 && fileInfo.tempFileURL) {
              const tempFileURL = fileInfo.tempFileURL
              console.log(`[云存储] 获取临时链接成功，开始下载: ${tempFileURL}`)

              // 使用 wx.downloadFile 下载
              const downloadRes = await new Promise((resolve, reject) => {
                wx.downloadFile({
                  url: tempFileURL,
                  success: resolve,
                  fail: (err) => {
                    console.error(`[云存储] wx.downloadFile 失败:`, err)
                    reject(err)
                  }
                })
              })

              if (downloadRes.statusCode === 200 && downloadRes.tempFilePath) {
                const tempPath = downloadRes.tempFilePath
                const localPath = _localPath(cacheIdentifier)

                // 同步持久化（阻塞直到完成）
                const persistedPath = _persistFileSync(tempPath, localPath, cacheIdentifier)

                console.log(`[云存储] 备选方案下载成功`)
                return persistedPath
              }
            }
          }
        } catch (backupErr) {
          console.error(`[云存储] 备选方案也失败:`, backupErr)
        }
      }

      if (attempt < maxRetries) {
        // 等待后重试（指数退避：1s, 2s, 4s）
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // 所有重试都失败
  throw new Error(`云存储下载失败，已重试 ${maxRetries} 次: ${lastError.message || lastError.errMsg || JSON.stringify(lastError)}`)
}

module.exports = { getCached, getImage, prefetchImages, evict }
