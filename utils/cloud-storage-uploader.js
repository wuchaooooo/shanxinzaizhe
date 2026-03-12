// utils/cloud-storage-uploader.js
// 云存储上传工具函数

const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 上传图片到云存储
 * @param {string} tempFilePath - 临时文件路径
 * @param {string} cloudPath - 云存储路径（如 'avatars/xxx.png'）
 * @returns {Promise<{fileID: string, success: boolean}>}
 */
async function uploadToCloudStorage(tempFilePath, cloudPath) {
  if (!DATA_SOURCE_CONFIG.useCloudStorage) {
    return { success: false, reason: 'Cloud storage disabled' }
  }

  try {
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    })

    console.log(`[云存储] 上传成功: ${cloudPath} -> ${result.fileID}`)
    return { success: true, fileID: result.fileID }
  } catch (err) {
    console.error(`[云存储] 上传失败: ${cloudPath}`, err)
    return { success: false, error: err }
  }
}

module.exports = { uploadToCloudStorage }
