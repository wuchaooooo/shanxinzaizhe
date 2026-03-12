// utils/cloud-storage-uploader.js
// 云存储上传工具函数

const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 上传图片到云存储
 * @param {string} tempFilePath - 临时文件路径
 * @param {string} cloudPath - 云存储路径（如 'avatars/xxx.png'）
 * @param {Object} options - 可选参数
 * @param {string} options.employeeId - 员工工号（用于文件命名）
 * @param {number} options.index - 图片序号（多图上传时使用）
 * @returns {Promise<{fileID: string, success: boolean}>}
 */
async function uploadToCloudStorage(tempFilePath, cloudPath, options = {}) {
  if (!DATA_SOURCE_CONFIG.useCloudStorage) {
    return { success: false, reason: 'Cloud storage disabled' }
  }

  // 优化文件命名：工号 + 时间戳 + 序号
  let finalCloudPath = cloudPath
  if (options.employeeId) {
    const timestamp = Date.now()
    const index = options.index !== undefined ? `_${options.index}` : ''
    const ext = cloudPath.substring(cloudPath.lastIndexOf('.'))
    const folder = cloudPath.substring(0, cloudPath.lastIndexOf('/') + 1)
    finalCloudPath = `${folder}${options.employeeId}_${timestamp}${index}${ext}`
  } else {
    // 兜底逻辑：如果没有工号，使用时间戳
    const timestamp = Date.now()
    const index = options.index !== undefined ? `_${options.index}` : ''
    const ext = cloudPath.substring(cloudPath.lastIndexOf('.'))
    const folder = cloudPath.substring(0, cloudPath.lastIndexOf('/') + 1)
    finalCloudPath = `${folder}guest_${timestamp}${index}${ext}`
  }

  // 清理 cloudPath 中的空格和特殊字符，避免下载时出错
  const cleanCloudPath = finalCloudPath.replace(/\s+/g, '_')

  try {
    const result = await wx.cloud.uploadFile({
      cloudPath: cleanCloudPath,
      filePath: tempFilePath
    })

    console.log(`[云存储] 上传成功: ${cleanCloudPath} -> ${result.fileID}`)
    return { success: true, fileID: result.fileID }
  } catch (err) {
    console.error(`[云存储] 上传失败: ${cleanCloudPath}`, err)
    return { success: false, error: err }
  }
}

/**
 * 从云存储删除文件
 * @param {string|string[]} fileIDs - 要删除的 fileID 或 fileID 数组
 * @returns {Promise<{success: boolean, deletedCount: number}>}
 */
async function deleteFromCloudStorage(fileIDs) {
  if (!fileIDs) {
    return { success: false, deletedCount: 0, reason: 'No fileIDs provided' }
  }

  // 统一处理为数组
  const fileIDArray = Array.isArray(fileIDs) ? fileIDs : [fileIDs]

  // 过滤掉空值
  const validFileIDs = fileIDArray.filter(id => id && String(id).trim())

  if (validFileIDs.length === 0) {
    return { success: true, deletedCount: 0, reason: 'No valid fileIDs' }
  }

  try {
    const result = await wx.cloud.deleteFile({
      fileList: validFileIDs
    })

    const successCount = result.fileList.filter(f => f.status === 0).length
    const failCount = result.fileList.filter(f => f.status !== 0).length

    if (failCount > 0) {
      console.warn(`[云存储] 删除部分失败: 成功 ${successCount}, 失败 ${failCount}`)
      result.fileList.forEach(f => {
        if (f.status !== 0) {
          console.error(`[云存储] 删除失败: ${f.fileID}`, f.errMsg)
        }
      })
    } else {
      console.log(`[云存储] 删除成功: ${successCount} 个文件`)
    }

    return {
      success: failCount === 0,
      deletedCount: successCount,
      failedCount: failCount
    }
  } catch (err) {
    console.error(`[云存储] 删除失败:`, err)
    return { success: false, deletedCount: 0, error: err }
  }
}

module.exports = { uploadToCloudStorage, deleteFromCloudStorage }
