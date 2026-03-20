// cloudfunctions/generateQRCode/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { employeeId, page = 'pages/home/home' } = event

  try {
    // scene 参数：有 employeeId 则带上，否则用固定值生成通用小程序码
    const scene = employeeId ? `e${employeeId}` : 'guest'

    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: scene,
      page: page,
      width: 430,
      autoColor: false,
      lineColor: { r: 0, g: 0, b: 0 },
      isHyaline: true // 透明底色
    })

    // 返回 Buffer
    return {
      success: true,
      buffer: result.buffer,
      contentType: result.contentType
    }
  } catch (error) {
    console.error('生成小程序码失败:', error)
    return {
      success: false,
      message: error.message || '生成小程序码失败'
    }
  }
}
