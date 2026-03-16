// utils/event-poster-generator.js
// 活动分享海报生成逻辑

const { getAssetPath } = require('./assets-loader.js')
const { generateMiniProgramCode } = require('./qrcode-generator.js')

/**
 * 生成活动分享海报
 * @param {Object} page - 调用页面的 this
 * @param {string} canvasId - canvas 的 canvas-id
 * @param {Object} event - 活动数据
 * @param {Object} options - 额外选项，如 { shareFrom: '员工号' }
 */
async function generateEventPoster(page, canvasId, event, options = {}) {
  try {
    // 立即显示弹窗（骨架屏状态）
    page.setData({
      showPoster: true,
      posterImage: ''
    })

    // 获取当前用户信息和合伙人数据
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const partnersData = app.globalData.partnersData || []

    // 根据组织者姓名查找对应的合伙人数据
    const organizer = partnersData.find(p => p.name === event.organizer)

    // 确定海报中"联系"二维码的优先级：
    // 1. 当前用户是联合创始人 → 用自己的个人微信二维码
    // 2. 普通用户 + 链接有 shareFrom → 用分享者的个人微信二维码
    // 3. 兜底 → 用组织者的个人微信二维码
    let contactQRCode = organizer?.qrcode || ''
    if (currentUser && currentUser.qrcode) {
      contactQRCode = currentUser.qrcode
    } else if (options.shareFrom) {
      const shareFromPartner = partnersData.find(p => p.employeeId === options.shareFrom)
      if (shareFromPartner && shareFromPartner.qrcode) {
        contactQRCode = shareFromPartner.qrcode
      }
    }

    // 生成动态小程序码（如果是联合创始人）
    let qrcodeImageUrl = null
    if (currentUser && currentUser.employeeId) {
      qrcodeImageUrl = await generateMiniProgramCode(currentUser.employeeId)
    }

    // 如果动态生成失败，降级到静态小程序码
    if (!qrcodeImageUrl) {
      qrcodeImageUrl = getAssetPath('mini_program_qr_code')
    }

    if (!qrcodeImageUrl) {
      wx.showToast({ title: '资源加载中，请稍后重试', icon: 'none' })
      return
    }

    // Canvas 尺寸
    const canvasWidth = 750
    let imageHeight = 1000 // 默认活动图片高度
    const infoHeight = 400 // 信息区域：名称 + 分割线 + 时间地点&二维码行

    // 确保 event.image 有值（fallback 到 images[0]）
    if (!event.image && event.images && event.images.length > 0) {
      event = { ...event, image: event.images[0] }
    }

    // 如果有图片，根据图片实际比例计算高度
    let actualImageHeight = imageHeight
    let localImagePath = event.image || ''
    if (event.image) {
      try {
        const imgInfo = await wx.getImageInfo({ src: event.image })
        actualImageHeight = Math.floor(canvasWidth * imgInfo.height / imgInfo.width)
        imageHeight = actualImageHeight
        localImagePath = imgInfo.path // 使用本地缓存路径，drawImage 才能正常渲染
      } catch (e) {
        console.error('获取图片信息失败:', e)
      }
    }

    const canvasHeight = imageHeight + infoHeight

    page.setData({ canvasHeight })
    await new Promise(resolve => setTimeout(resolve, 300))

    const ctx = wx.createCanvasContext(canvasId, page)

    // 1. 绘制活动图片
    if (localImagePath) {
      try {
        ctx.drawImage(localImagePath, 0, 0, canvasWidth, imageHeight)
      } catch (e) {
        console.error('绘制活动图片失败:', e)
        ctx.setFillStyle('#f5f5f5')
        ctx.fillRect(0, 0, canvasWidth, imageHeight)
      }
    } else {
      ctx.setFillStyle('#f5f5f5')
      ctx.fillRect(0, 0, canvasWidth, imageHeight)
    }

    // 2. 绘制底部信息区域（白色背景）
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, imageHeight, canvasWidth, infoHeight)

    const padding = 48
    const qrSize = 130 // 二维码尺寸（缩小）
    const qrGap = 24   // 两个二维码之间的间距

    // 3. 活动名称（全宽，单独一行）
    let currentY = imageHeight + 40
    if (event.name) {
      ctx.setFillStyle('#1e293b')
      ctx.font = 'bold 40px sans-serif'
      ctx.setTextAlign('left')
      ctx.setTextBaseline('top')
      drawWrappedText(ctx, event.name, padding, currentY, canvasWidth - padding * 2, 52)
      currentY += 72
    }

    // 分割线
    ctx.setStrokeStyle('#e2e8f0')
    ctx.setLineWidth(2)
    ctx.beginPath()
    ctx.moveTo(padding, currentY)
    ctx.lineTo(canvasWidth - padding, currentY)
    ctx.stroke()
    currentY += 24

    // 4. 第二行：左侧时间&地点，右侧二维码（垂直居中对齐）
    const qrStartX = canvasWidth - qrSize * 2 - qrGap - padding
    const qrStartY = currentY
    const textAreaWidth = qrStartX - padding - 40 // 增加右侧间距，避免被二维码遮盖

    // 计算左侧文字区域的总高度，用于垂直居中
    const textLineHeight = 52 // 增加行间距
    const textTotalHeight = event.time ? textLineHeight * 2 : textLineHeight
    const textStartY = qrStartY + (qrSize - textTotalHeight) / 2

    // 左侧：时间 & 地点（垂直居中）
    ctx.setFillStyle('#475569')
    ctx.font = '28px sans-serif'
    ctx.setTextAlign('left')
    ctx.setTextBaseline('top')

    let textY = textStartY
    if (event.time) {
      const timeStr = formatTime(event.time)
      ctx.fillText(`📅  ${timeStr}`, padding, textY)
      textY += textLineHeight
    }

    const location = event.address || '待定'
    drawWrappedText(ctx, `📍  ${location}`, padding, textY, textAreaWidth, 40)

    // 右侧：联系人二维码（当前用户 > 分享者 > 组织者）
    if (contactQRCode) {
      try {
        ctx.setFillStyle('#f8fafc')
        ctx.fillRect(qrStartX - 10, qrStartY - 10, qrSize + 20, qrSize + 20)
        ctx.drawImage(contactQRCode, qrStartX, qrStartY, qrSize, qrSize)
        ctx.setFillStyle('#64748b')
        ctx.font = 'bold 22px sans-serif'
        ctx.setTextAlign('center')
        ctx.fillText('联系我', qrStartX + qrSize / 2, qrStartY + qrSize + 18)
      } catch (e) {
        console.error('绘制联系二维码失败:', e)
      }
    }

    // 右侧：小程序码（右）
    if (qrcodeImageUrl) {
      try {
        const miniQrX = qrStartX + qrSize + qrGap
        ctx.setFillStyle('#f8fafc')
        ctx.fillRect(miniQrX - 10, qrStartY - 10, qrSize + 20, qrSize + 20)
        ctx.drawImage(qrcodeImageUrl, miniQrX, qrStartY, qrSize, qrSize)
        ctx.setFillStyle('#64748b')
        ctx.font = 'bold 22px sans-serif'
        ctx.setTextAlign('center')
        ctx.fillText('查看更多', miniQrX + qrSize / 2, qrStartY + qrSize + 18)
      } catch (e) {
        console.error('绘制小程序码失败:', e)
      }
    }

    // 5. 绘制并导出
    console.log('[海报] 开始 draw，canvasId:', canvasId, 'canvasWidth:', canvasWidth, 'canvasHeight:', canvasHeight)
    ctx.draw(false, () => {
      console.log('[海报] draw 回调触发，准备导出')
      setTimeout(() => {
        console.log('[海报] 调用 canvasToTempFilePath')
        wx.canvasToTempFilePath({
          canvasId: canvasId,
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
          destWidth: canvasWidth * 2,
          destHeight: canvasHeight * 2,
          fileType: 'png',
          quality: 1,
          success: (res) => {
            console.log('[海报] 导出成功:', res.tempFilePath)
            page.setData({ posterImage: res.tempFilePath })
          },
          fail: (err) => {
            console.error('[海报] 导出失败:', JSON.stringify(err))
            wx.showToast({ title: '生成失败，请重试', icon: 'none' })
            page.setData({ showPoster: false })
          }
        })
      }, 300)
    })
  } catch (error) {
    console.error('生成活动海报失败:', error)
    wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    page.setData({ showPoster: false })
  }
}

/**
 * 绘制支持换行的文本
 * @param {CanvasContext} ctx - Canvas 上下文
 * @param {string} text - 要绘制的文本
 * @param {number} x - 起始 x 坐标
 * @param {number} y - 起始 y 坐标
 * @param {number} maxWidth - 最大宽度
 * @param {number} lineHeight - 行高
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split('')
  let line = ''
  let currentY = y

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i]
    const metrics = ctx.measureText(testLine)
    const testWidth = metrics.width

    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line, x, currentY)
      line = words[i]
      currentY += lineHeight
    } else {
      line = testLine
    }
  }
  ctx.fillText(line, x, currentY)
}

/**
 * 格式化时间（东8区）
 */
function formatTime(timeStr) {
  if (!timeStr) return '待定'
  try {
    const date = new Date(timeStr)
    // 转换为东8区时间
    const offset = 8 * 60 // 东8区偏移量（分钟）
    const localOffset = date.getTimezoneOffset() // 本地时区偏移量（分钟）
    const targetTime = new Date(date.getTime() + (offset + localOffset) * 60 * 1000)

    const year = targetTime.getFullYear()
    const month = String(targetTime.getMonth() + 1).padStart(2, '0')
    const day = String(targetTime.getDate()).padStart(2, '0')
    const hour = String(targetTime.getHours()).padStart(2, '0')
    const minute = String(targetTime.getMinutes()).padStart(2, '0')
    return `${year}年${month}月${day}日 ${hour}:${minute}`
  } catch (e) {
    return timeStr
  }
}

module.exports = {
  generateEventPoster
}
