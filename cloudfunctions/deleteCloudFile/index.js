// 云函数：删除云存储文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { fileIDs } = event

  if (!fileIDs || (Array.isArray(fileIDs) && fileIDs.length === 0)) {
    return {
      success: false,
      message: '未提供要删除的文件ID'
    }
  }

  // 统一处理为数组
  const fileIDArray = Array.isArray(fileIDs) ? fileIDs : [fileIDs]

  try {
    const result = await cloud.deleteFile({
      fileList: fileIDArray
    })

    const successCount = result.fileList.filter(f => f.status === 0).length
    const failCount = result.fileList.filter(f => f.status !== 0).length

    console.log(`删除文件结果: 成功 ${successCount}, 失败 ${failCount}`)

    if (failCount > 0) {
      result.fileList.forEach(f => {
        if (f.status !== 0) {
          console.error(`删除失败: ${f.fileID}`, f.errMsg)
        }
      })
    }

    return {
      success: failCount === 0,
      deletedCount: successCount,
      failedCount: failCount,
      details: result.fileList
    }
  } catch (err) {
    console.error('删除文件失败:', err)
    return {
      success: false,
      message: err.message,
      error: err
    }
  }
}
