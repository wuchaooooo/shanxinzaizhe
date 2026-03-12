// 迁移飞书图片到云存储
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { feishuImageKey, feishuToken, imageType = 'avatar' } = event

  if (!feishuImageKey || !feishuToken) {
    return {
      success: false,
      error: 'Missing required parameters: feishuImageKey or feishuToken'
    }
  }

  try {
    // 1. 从飞书下载图片
    const imageUrl = `https://open.feishu.cn/open-apis/im/v1/images/${feishuImageKey}?type=origin`

    console.log(`[迁移] 开始下载飞书图片: ${feishuImageKey}`)

    const response = await axios.get(imageUrl, {
      headers: {
        'Authorization': `Bearer ${feishuToken}`
      },
      responseType: 'arraybuffer'
    })

    // 2. 上传到云存储（根据类型选择文件夹）
    const folder = imageType === 'event' ? 'images/event' : 'images/avatar'
    const cloudPath = `${folder}/${feishuImageKey}.png`

    console.log(`[迁移] 开始上传到云存储: ${cloudPath}`)

    const buffer = Buffer.from(response.data)

    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    console.log(`[迁移] 上传成功: ${uploadResult.fileID}`)

    return {
      success: true,
      fileID: uploadResult.fileID,
      originalImageKey: feishuImageKey
    }
  } catch (err) {
    console.error(`[迁移] 失败: ${feishuImageKey}`, err)
    return {
      success: false,
      error: err.message || err.toString(),
      originalImageKey: feishuImageKey
    }
  }
}
