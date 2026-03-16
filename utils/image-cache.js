// utils/image-cache.js
// 图片工具层
//
// 接口：
//   fileIDToCdnUrl(fileID)  → string  将 cloud:// fileID 转为公开 CDN HTTPS URL
//   getImage(cloudFileID)   → Promise<string>  通过 wx.cloud.downloadFile 下载（用于二维码等按需场景）
//   evict(fileID)           → void  清理本地文件（兼容旧逻辑，CDN 模式下为空操作）

const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 将 cloud:// fileID 转为公开 CDN HTTPS URL
 * 需要云存储文件权限设为"所有用户可读"
 * @param {string} fileID - cloud:// 格式的 fileID
 * @returns {string} HTTPS CDN URL，或空字符串
 */
function fileIDToCdnUrl(fileID) {
  if (!fileID || !DATA_SOURCE_CONFIG.useCdnUrl || !DATA_SOURCE_CONFIG.cdnBaseUrl) return ''
  if (fileID.startsWith('https://')) return fileID
  // cloud://<envId>.<region>-<envId>-<appId>/<path>  →  <cdnBaseUrl>/<path>
  const match = fileID.match(/^cloud:\/\/[^/]+\/(.+)$/)
  if (!match) return ''
  return `${DATA_SOURCE_CONFIG.cdnBaseUrl}/${match[1]}`
}

/**
 * 从云存储下载文件（用于二维码等按需下载场景）
 * @param {string} cloudFileID
 * @returns {Promise<string>} 临时文件路径
 */
async function getImage(cloudFileID) {
  if (!cloudFileID) throw new Error('cloudFileID 不能为空')

  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID: cloudFileID,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error(`下载失败: statusCode=${res.statusCode}`))
        }
      },
      fail: reject
    })
  })
}

/**
 * 空操作，保留接口兼容性（CDN 模式下无本地缓存文件需要清理）
 */
function evict() {}

module.exports = { fileIDToCdnUrl, getImage, evict }
