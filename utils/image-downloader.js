// utils/image-downloader.js
// 公共图片下载工具 - 从飞书 IM 下载图片

const feishuApi = require('./feishu-api.js')

/**
 * 根据 image_key 获取图片下载 URL
 * @param {string} imageKey - 飞书图片的 image_key
 * @returns {string} - 返回下载链接
 */
function getImageDownloadUrl(imageKey) {
  return `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`
}

/**
 * 下载图片并持久化存储（带认证）
 * @param {string} url - 图片下载URL
 * @param {string} token - 飞书访问令牌
 * @param {string} prefix - 文件名前缀（如 'profile', 'event'）
 * @param {string} id - 标识符（如 employeeId, eventId）
 * @returns {Promise<string>} - 返回持久化文件路径
 */
function downloadImageWithAuth(url, token, prefix = 'image', id = '') {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: url,
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          console.log(`[${prefix}_${id}] 图片下载成功（临时文件）:`, res.tempFilePath)

          // 持久化存储到 USER_DATA_PATH（固定文件名，避免重复累积）
          const fs = wx.getFileSystemManager()
          const fileName = `${prefix}_${id}.png`
          const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

          // 如果旧文件存在，先删除再保存（避免 saveFile 在文件已存在时报错）
          try { fs.unlinkSync(filePath) } catch (e) { /* 文件不存在，忽略 */ }

          fs.saveFile({
            tempFilePath: res.tempFilePath,
            filePath: filePath,
            success: (saveRes) => {
              console.log(`[${prefix}_${id}] 图片持久化成功:`, saveRes.savedFilePath)
              resolve(saveRes.savedFilePath)
            },
            fail: (saveErr) => {
              console.error(`[${prefix}_${id}] 图片持久化失败，使用临时路径:`, saveErr)
              // 持久化失败，返回临时路径（虽然可能会失效）
              resolve(res.tempFilePath)
            }
          })
        } else {
          console.error(`[${prefix}_${id}] 图片下载失败，状态码:`, res.statusCode)
          reject(new Error(`下载失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        console.error(`[${prefix}_${id}] 图片下载网络失败:`, err)
        reject(err)
      }
    })
  })
}

/**
 * 带重试的下载（失败后最多重试 maxRetries 次，间隔递增）
 * @param {string} url - 图片下载URL
 * @param {string} token - 飞书访问令牌
 * @param {string} prefix - 文件名前缀
 * @param {string} id - 标识符
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<string>} - 返回本地文件路径
 */
function downloadWithRetry(url, token, prefix = 'image', id = '', maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const tryDownload = () => {
      attempt++
      downloadImageWithAuth(url, token, prefix, id)
        .then(resolve)
        .catch(error => {
          if (attempt < maxRetries) {
            const delay = attempt * 1000 // 1s, 2s, 3s...
            console.warn(`下载失败，${delay}ms 后重试 (${attempt}/${maxRetries}):`, url)
            setTimeout(tryDownload, delay)
          } else {
            console.error(`下载失败，已重试 ${maxRetries} 次，放弃:`, url)
            reject(error)
          }
        })
    }
    tryDownload()
  })
}

/**
 * 从 image_key 下载图片（便捷方法）
 * @param {string} imageKey - 飞书图片的 image_key
 * @param {string} prefix - 文件名前缀
 * @param {string} id - 标识符
 * @returns {Promise<string>} - 返回本地文件路径
 */
async function downloadImageByKey(imageKey, prefix = 'image', id = '') {
  if (!imageKey) {
    throw new Error('imageKey 不能为空')
  }
  const token = await feishuApi.getTenantAccessToken()
  const url = getImageDownloadUrl(imageKey)
  return downloadWithRetry(url, token, prefix, id)
}

module.exports = {
  getImageDownloadUrl,
  downloadImageWithAuth,
  downloadWithRetry,
  downloadImageByKey
}
