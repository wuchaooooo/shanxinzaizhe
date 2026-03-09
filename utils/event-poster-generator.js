// utils/event-poster-generator.js
// 活动分享海报生成逻辑

const { getAssetPath } = require('./assets-loader.js')

/**
 * 生成活动分享海报
 * @param {Object} page - 调用页面的 this
 * @param {string} canvasId - canvas 的 canvas-id
 * @param {Object} event - 活动数据
 */
async function generateEventPoster(page, canvasId, event) {
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
    const organizerBadges = organizer?.badges || []

    // 获取小程序码和用户二维码
    const qrcodeImageUrl = getAssetPath('mini_program_qr_code')
    const userQRCode = currentUser?.qrcode || ''

    if (!qrcodeImageUrl) {
      wx.showToast({ title: '资源加载中，请稍后重试', icon: 'none' })
      return
    }

    // Canvas 尺寸
    const canvasWidth = 750
    let imageHeight = 1000 // 默认活动图片高度
    const infoHeight = 350 // 信息区域高度（增加以容纳两个二维码）

    // 如果有图片，根据图片实际比例计算高度
    let actualImageHeight = imageHeight
    if (event.image) {
      try {
        const imgInfo = await wx.getImageInfo({ src: event.image })
        // 按宽度适配，计算实际高度
        actualImageHeight = Math.floor(canvasWidth * imgInfo.height / imgInfo.width)
        imageHeight = actualImageHeight
      } catch (e) {
        console.error('获取图片信息失败:', e)
      }
    }

    const canvasHeight = imageHeight + infoHeight

    page.setData({ canvasHeight })
    await new Promise(resolve => setTimeout(resolve, 100))

    const ctx = wx.createCanvasContext(canvasId, page)

    // 1. 绘制活动图片（完整显示，不裁剪）
    if (event.image) {
      try {
        // 按宽度适配，完整显示图片
        ctx.drawImage(event.image, 0, 0, canvasWidth, imageHeight)
      } catch (e) {
        console.error('绘制活动图片失败:', e)
        // 绘制占位背景
        ctx.setFillStyle('#f5f5f5')
        ctx.fillRect(0, 0, canvasWidth, imageHeight)
      }
    } else {
      // 无图片时绘制占位背景
      ctx.setFillStyle('#f5f5f5')
      ctx.fillRect(0, 0, canvasWidth, imageHeight)
    }

    // 2. 绘制底部信息区域（渐变背景）
    const gradient = ctx.createLinearGradient(0, imageHeight, 0, canvasHeight)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#f8f9fa')
    ctx.setFillStyle(gradient)
    ctx.fillRect(0, imageHeight, canvasWidth, infoHeight)

    // 3. 绘制活动信息（左侧）和二维码（右侧）
    const padding = 40
    const qrSize = 140 // 二维码尺寸
    const qrGap = 20 // 两个二维码之间的间距
    const qrAreaWidth = qrSize * 2 + qrGap + padding // 右侧二维码区域宽度
    const textAreaWidth = canvasWidth - qrAreaWidth - padding // 左侧文字区域宽度

    let currentY = imageHeight + 50

    // 组织者
    if (event.organizer) {
      ctx.setFillStyle('#0f172a')
      ctx.setFontSize(36)
      ctx.setTextAlign('left')
      ctx.setTextBaseline('top')
      ctx.fillText(`👤 ${event.organizer}`, padding, currentY)
      currentY += 50

      // 绘制荣誉徽章（最多显示前3个）
      if (organizerBadges.length > 0) {
        const badgesToShow = organizerBadges.slice(0, 3)
        ctx.setFillStyle('#64748b')
        ctx.setFontSize(24)

        badgesToShow.forEach((badge, index) => {
          const badgeText = `${badge.icon} ${badge.title}`
          ctx.fillText(badgeText, padding + 60, currentY + index * 35)
        })

        currentY += badgesToShow.length * 35 + 10
      } else {
        currentY += 10
      }
    }

    // 活动时间
    if (event.time) {
      ctx.setFillStyle('#64748b')
      ctx.setFontSize(28)
      const timeStr = formatTime(event.time)
      ctx.fillText(`📅 ${timeStr}`, padding, currentY)
      currentY += 50
    }

    // 活动地点（星享会固定地点）
    const location = event.type === '星享会'
      ? '杭州市英蓝中心B座'
      : (event.address || '待定')

    ctx.setFillStyle('#64748b')
    ctx.setFontSize(28)

    // 计算地址文字的最大宽度（左侧文字区域宽度 - 图标宽度）
    const maxTextWidth = textAreaWidth - 60 // 减去图标和间距
    const locationText = `📍 ${location}`

    // 绘制地址（支持换行）
    drawWrappedText(ctx, locationText, padding, currentY, maxTextWidth, 40)

    // 4. 绘制二维码区域（右侧，与文字信息同一水平线）
    const qrStartY = imageHeight + 50
    const qrStartX = canvasWidth - qrSize * 2 - qrGap - padding

    // 绘制用户二维码（左边）
    if (userQRCode) {
      try {
        // 白色背景
        ctx.setFillStyle('#ffffff')
        ctx.fillRect(qrStartX - 10, qrStartY - 10, qrSize + 20, qrSize + 20)

        // 绘制用户二维码
        ctx.drawImage(userQRCode, qrStartX, qrStartY, qrSize, qrSize)

        // 提示文字
        ctx.setFillStyle('#94a3b8')
        ctx.setFontSize(20)
        ctx.setTextAlign('center')
        ctx.fillText('联系我', qrStartX + qrSize / 2, qrStartY + qrSize + 25)
      } catch (e) {
        console.error('绘制用户二维码失败:', e)
      }
    }

    // 绘制小程序码（右边）
    if (qrcodeImageUrl) {
      try {
        const miniQrX = qrStartX + qrSize + qrGap

        // 白色背景
        ctx.setFillStyle('#ffffff')
        ctx.fillRect(miniQrX - 10, qrStartY - 10, qrSize + 20, qrSize + 20)

        // 绘制小程序码
        ctx.drawImage(qrcodeImageUrl, miniQrX, qrStartY, qrSize, qrSize)

        // 提示文字
        ctx.setFillStyle('#94a3b8')
        ctx.setFontSize(20)
        ctx.setTextAlign('center')
        ctx.fillText('扫码查看', miniQrX + qrSize / 2, qrStartY + qrSize + 25)
      } catch (e) {
        console.error('绘制小程序码失败:', e)
      }
    }

    // 5. 绘制并导出
    ctx.draw(false, async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 500))
        const res = await wx.canvasToTempFilePath({
          canvasId: canvasId,
          fileType: 'png',
          quality: 1
        }, page)

        page.setData({ posterImage: res.tempFilePath })
      } catch (err) {
        console.error('导出海报失败:', err)
        wx.showToast({ title: '生成失败，请重试', icon: 'none' })
        page.setData({ showPoster: false })
      }
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
