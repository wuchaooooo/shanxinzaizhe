// pages/profile/profile.js
const { getPartnersDataSync, fetchFeishuPartnersText, downloadImagesBackground } = require('../../utils/partners-data-loader.js')
const { getAssetPath } = require('../../utils/assets-loader.js')

// 从时间字符串提取年月，支持 "2024-01"、"2024年1月"、"2024.01" 等格式
function extractYearMonth(timeStr) {
  if (!timeStr) return null
  const m = timeStr.match(/(\d{4})[年\-\./](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  return timeStr.slice(0, 7)
}

// 给时间线数组每一项标记 isNewMonth（月份切换时为 true）
function markNewMonths(items) {
  let lastMonth = null
  return (items || []).map(item => {
    const month = extractYearMonth(item.time)
    const isNewMonth = month !== lastMonth
    if (isNewMonth) lastMonth = month
    return Object.assign({}, item, { isNewMonth })
  })
}

// 将包含符号的文本拆分成数组
function splitBySymbols(text) {
  if (!text) return [text]

  // 常见的中文分隔符号
  const chineseSymbols = /[、，；]/

  // 如果包含中文符号,按这些符号拆分
  if (chineseSymbols.test(text)) {
    return text.split(chineseSymbols).filter(item => item.trim())
  }

  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(text)

  // 如果包含中文且有空格,按空格拆分(中文之间的空格)
  if (hasChinese && /\s/.test(text)) {
    return text.split(/\s+/).filter(item => item.trim())
  }

  // 其他情况(纯英文、英文空格等),不拆分
  return [text]
}

Page({
  data: {
    coverImage: '',
    avatar: '',
    name: '',
    school: '',
    title: '',
    activeTab: '成就荣誉',
    tabs: ['成就荣誉', '最近动态', '个人概览'],
    badges: [],
    timeline: [],
    activities: [],
    skills: [],
    contacts: [],
    showQRCode: false,
    showBadgesModal: false,
    showPoster: false,
    posterImage: '',
    canvasHeight: 2000,
    qrcodeImage: 'https://via.placeholder.com/400x400?text=QR+Code',
    headerClipPath: 'inset(0 0 0 0)',
    avatarScale: 1,
    avatarTop: 384,
    tenure: '', // 司龄
    customersServed: '', // 服务客户
    bio: '', // 个人简介
    shanxinLogoUrl: '' // 善心logo
  },

  // 计算司龄
  calculateTenure(joinDate) {
    if (!joinDate) return '未知'

    const join = new Date(joinDate)
    const now = new Date()

    // 计算月份差
    let months = (now.getFullYear() - join.getFullYear()) * 12
    months += now.getMonth() - join.getMonth()

    // 如果当前日期小于入职日期，减去一个月
    if (now.getDate() < join.getDate()) {
      months--
    }

    // 不满1个月显示为1月
    if (months < 1) {
      return '1月'
    }

    // 计算年和月
    const years = Math.floor(months / 12)
    const remainingMonths = months % 12

    if (years === 0) {
      return `${months}月`
    } else if (remainingMonths === 0) {
      return `${years}年`
    } else {
      return `${years}年${remainingMonths}月`
    }
  },

  async onLoad(options) {
    this.options = options

    // 加载善心 logo（代码：shanxinzheli）
    const shanxinLogoPath = getAssetPath('shanxinzheli')
    if (shanxinLogoPath) {
      this.setData({ shanxinLogoUrl: shanxinLogoPath })
    }

    await this.loadFeishuPartner(options)
  },

  // 加载飞书数据源的合伙人
  async loadFeishuPartner(options) {
    try {
      const app = getApp()

      // 先用同步缓存，有就立即展示（图片可能还未下载）
      let partnersData = getPartnersDataSync()

      if (!partnersData.length) {
        // 冷启动：快速拉取文本数据
        const { partners, changedIds } = await fetchFeishuPartnersText()
        partnersData = partners
        app.globalData.partnersData = partnersData

        // 触发后台图片下载，只对有变更的合伙人触发重渲染
        downloadImagesBackground(partnersData, (name, path) => {
          app.globalData.imageReadyListeners.forEach(cb => cb(name, path))
        }, changedIds)
      }

      // 查找当前合伙人
      let partner
      if (options.employeeId) {
        partner = partnersData.find(p => p.employeeId === options.employeeId)
        this.partnerId = options.employeeId
        this.useEmployeeId = true
      } else {
        const id = parseInt(options.id) || 0
        partner = partnersData[id] || partnersData[0]
        this.partnerId = id
        this.useEmployeeId = false
      }
      if (!partner) partner = partnersData[0]

      // 立即展示文本数据（图片有则展示，无则空白等待）
      const badges = partner.badges || []
      this.setData({
        avatar: partner.image || '',
        coverImage: partner.image || '',
        name: partner.name,
        school: partner.school,
        title: partner.title,
        schoolLines: splitBySymbols(partner.school),
        titleLines: splitBySymbols(partner.title),
        badges,
        timeline: markNewMonths(partner.timeline),
        activities: markNewMonths(partner.activities),
        skills: partner.skills || [],
        contacts: partner.contacts || [],
        qrcodeImage: partner.qrcode || '',
        tenure: this.calculateTenure(partner.joinDate),
        customersServed: partner.customersServed || '',
        bio: partner.bio || ''
      })

      // 若头像/二维码还未下载，注册监听，下载完成后自动更新
      if (!partner.image || !partner.qrcode) {
        const partnerName = partner.name
        this._imageReadyCb = (name, path) => {
          if (name !== partnerName) return
          // 根据当前合伙人的 image/qrcode 字段判断是头像还是二维码
          const current = (app.globalData.partnersData || []).find(p => p.name === name)
          if (!current) return
          const update = {}
          if (current.image === path) {
            update.avatar = path
            update.coverImage = path
          }
          if (current.qrcode === path) {
            update.qrcodeImage = path
          }
          if (Object.keys(update).length) this.setData(update)
        }
        app.globalData.imageReadyListeners.push(this._imageReadyCb)
      }

      // 注册数据变更监听：飞书有更新时刷新当前合伙人的文本信息
      this._partnersDataCb = (partnersData) => {
        let updated
        if (this.useEmployeeId) {
          updated = partnersData.find(p => p.employeeId === this.partnerId)
        } else {
          updated = partnersData[this.partnerId] || partnersData[0]
        }
        if (!updated) return
        this.setData({
          name: updated.name,
          school: updated.school,
          title: updated.title,
          schoolLines: splitBySymbols(updated.school),
          titleLines: splitBySymbols(updated.title),
          badges: updated.badges || [],
          timeline: markNewMonths(updated.timeline),
          activities: markNewMonths(updated.activities),
          skills: updated.skills || [],
          contacts: updated.contacts || [],
          tenure: this.calculateTenure(updated.joinDate),
          customersServed: updated.customersServed || '',
          bio: updated.bio || ''
        })
      }
      app.globalData.partnersDataListeners.push(this._partnersDataCb)
    } catch (error) {
      console.error('加载飞书合伙人数据失败:', error)
      wx.showToast({ title: '加载数据失败', icon: 'error' })
    }
  },

  onShow() {
    getApp().preloadFeishuData()
  },

  onUnload() {
    const app = getApp()
    if (this._imageReadyCb) {
      app.globalData.imageReadyListeners = app.globalData.imageReadyListeners.filter(cb => cb !== this._imageReadyCb)
      this._imageReadyCb = null
    }
    if (this._partnersDataCb) {
      app.globalData.partnersDataListeners = app.globalData.partnersDataListeners.filter(cb => cb !== this._partnersDataCb)
      this._partnersDataCb = null
    }
  },

  onBack() {
    // 获取当前页面栈
    const pages = getCurrentPages()

    // 如果页面栈只有一页，说明是通过分享链接直接进入的
    // 此时应该跳转到团队页面，而不是返回
    if (pages.length === 1) {
      wx.switchTab({
        url: '/pages/team/team'
      })
    } else {
      // 否则正常返回上一页
      wx.navigateBack()
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab
    })
  },

  onShowQRCode() {
    this.setData({
      showQRCode: true
    })
  },

  onHideQRCode() {
    this.setData({
      showQRCode: false
    })
  },

  onShowBadgesModal() {
    this.setData({ showBadgesModal: true })
  },

  onHideBadgesModal() {
    this.setData({ showBadgesModal: false })
  },

  onStopPropagation() {
    // 阻止事件冒泡，防止点击卡片时关闭弹窗
  },

  onGeneratePoster() {
    // 先生成海报，生成完成后再显示弹窗
    this.generateTeamPoster()
  },

  onHidePoster() {
    this.setData({ showPoster: false })
  },

  // 绘制金色稻穗装饰
  drawWheatDecoration(ctx, x, y, direction) {
    const scale = direction === 'left' ? 1 : -1
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, 1)

    // 金色
    const goldColor = '#FFD700'
    const darkGold = '#DAA520'

    // 绘制主茎
    ctx.setStrokeStyle(darkGold)
    ctx.setLineWidth(3)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 80)
    ctx.stroke()

    // 绘制麦穗颗粒 (使用圆形代替椭圆)
    for (let i = 0; i < 8; i++) {
      const yPos = 10 + i * 9
      const xOffset = 15 + Math.sin(i * 0.5) * 5

      // 左侧颗粒
      ctx.setFillStyle(goldColor)
      ctx.beginPath()
      ctx.arc(-xOffset, yPos, 10, 0, 2 * Math.PI)
      ctx.fill()

      // 右侧颗粒
      ctx.beginPath()
      ctx.arc(xOffset, yPos, 10, 0, 2 * Math.PI)
      ctx.fill()

      // 添加高光
      ctx.setFillStyle('rgba(255, 255, 255, 0.3)')
      ctx.beginPath()
      ctx.arc(-xOffset - 2, yPos - 3, 4, 0, 2 * Math.PI)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(xOffset - 2, yPos - 3, 4, 0, 2 * Math.PI)
      ctx.fill()
    }

    // 绘制叶子
    ctx.setStrokeStyle(darkGold)
    ctx.setLineWidth(2)
    for (let i = 0; i < 3; i++) {
      const leafY = 30 + i * 20
      ctx.beginPath()
      ctx.moveTo(0, leafY)
      ctx.quadraticCurveTo(-20, leafY - 10, -25, leafY - 20)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, leafY)
      ctx.quadraticCurveTo(20, leafY - 10, 25, leafY - 20)
      ctx.stroke()
    }

    ctx.restore()
  },

  async generateTeamPoster() {
    try {
      wx.showLoading({ title: '生成中...' })

      // 获取所有团队成员数据
      const { getPartnersDataSync } = require('../../utils/partners-data-loader.js')
      let partners = getPartnersDataSync()

      // 获取当前合伙人
      let currentPartner
      let currentPartnerIndex = -1
      if (this.useEmployeeId) {
        currentPartnerIndex = partners.findIndex(p => p.employeeId === this.partnerId)
        currentPartner = currentPartnerIndex >= 0 ? partners[currentPartnerIndex] : null
      } else {
        currentPartnerIndex = this.partnerId
        currentPartner = partners[currentPartnerIndex] || partners[0]
      }

      // 将当前合伙人移到第一个位置
      if (currentPartner && currentPartnerIndex > 0) {
        partners = [
          currentPartner,
          ...partners.slice(0, currentPartnerIndex),
          ...partners.slice(currentPartnerIndex + 1)
        ]
      }

      const personalQRCode = currentPartner ? currentPartner.qrcode : ''

      // 从飞书 base 获取头部图片和二维码（代码：team_post_header, mini_program_qr_code）
      const headerImageUrl = getAssetPath('team_post_header')
      const qrcodeImageUrl = getAssetPath('mini_program_qr_code')

      if (!headerImageUrl || !qrcodeImageUrl) {
        wx.showToast({
          title: '资源加载中，请稍后重试',
          icon: 'none'
        })
        return
      }

      const headerHeight = 400 // 头部图片高度，根据实际图片调整

      // 动态计算高度
      const cols = 3
      const avatarSize = 150 // 缩小头像尺寸
      const avatarBgSize = avatarSize + 20 // 背景圆形比头像大一圈
      const gap = 30
      const startX = 60
      const startY = headerHeight + 60 // 头部图片高度 + 间距
      const canvasWidth = 750
      const itemWidth = (canvasWidth - startX * 2 - gap * (cols - 1)) / cols
      const itemHeight = avatarSize + 120 // 头像 + 姓名 + 学校高度
      const rows = Math.ceil(partners.length / cols)
      const gridHeight = rows * (itemHeight + gap)
      const canvasHeight = startY + gridHeight + 500 // 头部图片 + 网格 + 底部空间

      // 设置 Canvas 高度
      this.setData({ canvasHeight })

      // 等待 Canvas 尺寸更新
      await new Promise(resolve => setTimeout(resolve, 100))

      // 创建 Canvas 上下文
      const ctx = wx.createCanvasContext('posterCanvas', this)

      // 绘制渐变背景（深色在上，浅色在下）
      const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
      gradient.addColorStop(0, '#911C13') // RGB(145, 28, 19) - 与头部图片衔接
      gradient.addColorStop(0.5, '#a00000')
      gradient.addColorStop(1, '#c20000')
      ctx.setFillStyle(gradient)
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      // 绘制头部图片（保持宽高比，居中裁剪）
      if (headerImageUrl) {
        try {
          // 获取图片信息
          const imgInfo = await wx.getImageInfo({ src: headerImageUrl })
          const imgWidth = imgInfo.width
          const imgHeight = imgInfo.height
          const imgRatio = imgWidth / imgHeight
          const targetRatio = canvasWidth / headerHeight

          let drawWidth, drawHeight, drawX, drawY

          if (imgRatio > targetRatio) {
            // 图片更宽，按高度缩放
            drawHeight = headerHeight
            drawWidth = drawHeight * imgRatio
            drawX = (canvasWidth - drawWidth) / 2
            drawY = 0
          } else {
            // 图片更高，按宽度缩放
            drawWidth = canvasWidth
            drawHeight = drawWidth / imgRatio
            drawX = 0
            drawY = (headerHeight - drawHeight) / 2
          }

          // 裁剪区域
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, canvasWidth, headerHeight)
          ctx.clip()
          ctx.drawImage(headerImageUrl, drawX, drawY, drawWidth, drawHeight)
          ctx.restore()

          // 在头部图片底部添加渐变遮罩，实现平滑过渡
          const maskHeight = 80
          const maskGradient = ctx.createLinearGradient(0, headerHeight - maskHeight, 0, headerHeight)
          maskGradient.addColorStop(0, 'rgba(145, 28, 19, 0)') // 透明
          maskGradient.addColorStop(1, 'rgba(145, 28, 19, 1)') // 与背景色衔接
          ctx.setFillStyle(maskGradient)
          ctx.fillRect(0, headerHeight - maskHeight, canvasWidth, maskHeight)
        } catch (e) {
          console.error('绘制头部图片失败:', e)
        }
      } else {
        // 如果图片下载失败，显示提示文字
        ctx.setFillStyle('#ffffff')
        ctx.setFontSize(32)
        ctx.setTextAlign('center')
        ctx.fillText('头部图片加载失败', canvasWidth / 2, headerHeight / 2)
      }

      // 预先批量获取所有头像的图片信息（优化性能）
      const avatarInfoMap = new Map()
      await Promise.all(
        partners.map(async (partner) => {
          if (partner.image) {
            try {
              const info = await wx.getImageInfo({ src: partner.image })
              avatarInfoMap.set(partner.image, {
                width: info.width,
                height: info.height,
                ratio: info.width / info.height
              })
            } catch (e) {
              console.error('获取头像信息失败:', partner.name, e)
            }
          }
        })
      )

      // 绘制成员网格 (3列)
      for (let i = 0; i < partners.length; i++) {
        const partner = partners[i]
        const row = Math.floor(i / cols)
        const col = i % cols
        const x = startX + col * (itemWidth + gap)
        const y = startY + row * (itemHeight + gap)

        // 绘制金色背景圆形
        ctx.setFillStyle('#E9AE73') // RGB(233, 174, 115)
        ctx.beginPath()
        ctx.arc(x + itemWidth / 2, y + avatarBgSize / 2, avatarBgSize / 2, 0, 2 * Math.PI)
        ctx.fill()

        // 绘制头像 (参考 team 页面实现：容器高度大于宽度，保证人脸不被裁剪)
        if (partner.image) {
          const avatarInfo = avatarInfoMap.get(partner.image)
          if (avatarInfo) {
            try {
              const imgRatio = avatarInfo.ratio

              // 参考 team 页面：容器宽度 140，高度 175 (比例约 1:1.25)
              const containerWidth = avatarSize
              const containerHeight = avatarSize * 1.25
              const containerRatio = containerWidth / containerHeight

              // 计算绘制参数（aspectFill 模式：保持宽高比填充容器）
              let drawWidth, drawHeight, drawX, drawY
              const avatarCenterY = y + avatarBgSize / 2
              const avatarLeft = x + (itemWidth - avatarSize) / 2
              const avatarTop = avatarCenterY - avatarSize / 2

              if (imgRatio > containerRatio) {
                // 图片更宽，按容器高度缩放
                drawHeight = containerHeight
                drawWidth = drawHeight * imgRatio
                drawX = avatarLeft - (drawWidth - containerWidth) / 2
                drawY = avatarTop
              } else {
                // 图片更高，按容器宽度缩放
                drawWidth = containerWidth
                drawHeight = drawWidth / imgRatio
                drawX = avatarLeft
                drawY = avatarTop
              }

              ctx.save()
              // 绘制圆形头像（与背景圆形同心）
              ctx.beginPath()
              ctx.arc(x + itemWidth / 2, avatarCenterY, avatarSize / 2, 0, 2 * Math.PI)
              ctx.clip()
              // 绘制图片
              ctx.drawImage(partner.image, drawX, drawY, drawWidth, drawHeight)
              ctx.restore()
            } catch (e) {
              console.error('绘制头像失败:', partner.name, e)
            }
          }
        }

        // 绘制人物信息：名字气泡在头像右上角，学校和title在下方
        const leftMargin = 10
        const maxTextWidth = itemWidth - leftMargin * 2

        // 辅助函数：截断文字并添加省略号
        const truncateText = (text, maxWidth, fontSize) => {
          ctx.setFontSize(fontSize)
          if (ctx.measureText(text).width <= maxWidth) {
            return text
          }
          let truncated = text
          while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
            truncated = truncated.slice(0, -1)
          }
          return truncated + '...'
        }

        // 绘制圆圈下面1/4的金色区域（作为名字背景）
        const circleCenterX = x + itemWidth / 2
        const circleCenterY = y + avatarBgSize / 2
        const circleRadius = avatarBgSize / 2

        ctx.save()
        ctx.setFillStyle('#E9AE73')
        ctx.beginPath()

        // 计算水平线的位置（圆心下方，覆盖下面约1/4区域）
        const chordY = circleCenterY + circleRadius * 0.5
        // 计算水平线与圆的交点
        const chordHalfWidth = circleRadius * Math.sqrt(0.75) // sqrt(r^2 - (0.5r)^2)
        const leftX = circleCenterX - chordHalfWidth
        const rightX = circleCenterX + chordHalfWidth

        // 计算角度（用于绘制圆弧）
        const startAngle = Math.atan2(chordY - circleCenterY, rightX - circleCenterX)
        const endAngle = Math.atan2(chordY - circleCenterY, leftX - circleCenterX)

        // 绘制弓形：从右交点开始，沿圆弧到左交点，然后用直线连回
        ctx.arc(circleCenterX, circleCenterY, circleRadius, startAngle, endAngle)
        ctx.lineTo(rightX, chordY) // 用直线连回起点（水平线）
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        // 绘制名字文字（白色，在金色区域中）
        // 名字位置：黄色区域的中心位置
        const nameY = circleCenterY + circleRadius * 0.75

        ctx.setFontSize(22)
        ctx.font = 'bold 22px sans-serif'

        // 截断名字为最多3个字符（不加省略号）
        let displayName = partner.name || ''
        if (displayName.length > 3) {
          displayName = displayName.substring(0, 3)
        }

        // 绘制名字文字（白色，居中）
        ctx.setFillStyle('#ffffff')
        ctx.setTextAlign('center')
        ctx.fillText(displayName, circleCenterX, nameY + 6)

        // 绘制学校和title（在头像正下方，居中展示）
        const infoStartY = y + avatarBgSize + 30

        // 绘制学校
        if (partner.school) {
          const schoolLines = partner.school.split(/[、，；\n]/).filter(s => s.trim())
          if (schoolLines.length > 0) {
            ctx.setFillStyle('#E9AE73')
            ctx.setFontSize(16)
            ctx.font = 'normal 16px sans-serif'
            ctx.setTextAlign('center')
            const schoolText = truncateText(schoolLines[0], maxTextWidth, 16)
            ctx.fillText(schoolText, x + itemWidth / 2, infoStartY)
          }
        }

        // 绘制title
        if (partner.title) {
          const titleLines = partner.title.split(/[、，；\n]/).filter(s => s.trim())
          if (titleLines.length > 0) {
            ctx.setFillStyle('#E9AE73')
            ctx.setFontSize(16)
            ctx.font = 'normal 16px sans-serif'
            ctx.setTextAlign('center')
            const titleText = truncateText(titleLines[0], maxTextWidth, 16)
            ctx.fillText(titleText, x + itemWidth / 2, infoStartY + 25)
          }
        }
      }

      // 绘制底部文案（三句话）
      const bottomTextY = startY + gridHeight + 60
      const lineHeight = 50

      ctx.setFillStyle('#E9AE73')
      ctx.setFontSize(30)
      ctx.font = '900 30px sans-serif'
      ctx.setTextAlign('center')

      // 辅助函数：绘制带字间距的文字
      const drawTextWithSpacing = (text, x, y, letterSpacing) => {
        const chars = text.split('')
        let currentX = x - (ctx.measureText(text).width + letterSpacing * (chars.length - 1)) / 2

        chars.forEach((char) => {
          const charWidth = ctx.measureText(char).width
          // 绘制填充文字
          ctx.fillText(char, currentX + charWidth / 2, y)
          // 绘制描边增加粗细效果
          ctx.setLineWidth(1)
          ctx.setStrokeStyle('#E9AE73')
          ctx.strokeText(char, currentX + charWidth / 2, y)

          currentX += charWidth + letterSpacing
        })
      }

      const letterSpacing = 4 // 字间距

      drawTextWithSpacing('以合作互助的态度实现伙伴完美人生，', canvasWidth / 2, bottomTextY, letterSpacing)
      drawTextWithSpacing('以专业用心的态度锁住客户幸福生活，', canvasWidth / 2, bottomTextY + lineHeight, letterSpacing)
      drawTextWithSpacing('善心浙里与您共创丰盛未来！', canvasWidth / 2, bottomTextY + lineHeight * 2, letterSpacing)

      // 绘制两个二维码（团队二维码和个人二维码）
      const qrSize = 150
      const qrGap = 30
      const qrTotalWidth = qrSize * 2 + qrGap
      const qrStartX = (canvasWidth - qrTotalWidth) / 2
      const qrY = bottomTextY + lineHeight * 2 + 50

      // 绘制团队二维码（左侧）
      if (qrcodeImageUrl) {
        try {
          // 先绘制白色背景
          ctx.setFillStyle('#ffffff')
          ctx.fillRect(qrStartX - 5, qrY - 5, qrSize + 10, qrSize + 10)

          // 绘制二维码
          ctx.drawImage(qrcodeImageUrl, qrStartX, qrY, qrSize, qrSize)
        } catch (e) {
          console.error('绘制团队二维码失败:', e)
        }
      }

      // 绘制个人二维码（右侧）
      if (personalQRCode) {
        try {
          const personalQrX = qrStartX + qrSize + qrGap

          // 先绘制白色背景
          ctx.setFillStyle('#ffffff')
          ctx.fillRect(personalQrX - 5, qrY - 5, qrSize + 10, qrSize + 10)

          // 绘制二维码
          ctx.drawImage(personalQRCode, personalQrX, qrY, qrSize, qrSize)
        } catch (e) {
          console.error('绘制个人二维码失败:', e)
        }
      }

      // 绘制完成，转换为图片
      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'posterCanvas',
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            destWidth: canvasWidth * 2,
            destHeight: canvasHeight * 2,
            success: (res) => {
              this.setData({
                posterImage: res.tempFilePath,
                showPoster: true
              })
              wx.hideLoading()
            },
            fail: (err) => {
              console.error('生成海报失败:', err)
              wx.hideLoading()
              wx.showToast({ title: '生成失败', icon: 'none' })
            }
          }, this)
        }, 500)
      })

    } catch (error) {
      console.error('生成海报出错:', error)
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  // 分享功能
  onShareAppMessage() {
    const path = this.useEmployeeId
      ? `/pages/profile/profile?employeeId=${this.partnerId}`
      : `/pages/profile/profile?id=${this.partnerId || 0}`

    return {
      title: `${this.data.name} - ${this.data.school} - ${this.data.title}`,
      path: path,
      imageUrl: this.data.avatar || ''
    }
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop
    const systemInfo = wx.getSystemInfoSync()
    const screenHeight = systemInfo.windowHeight
    const rpxRatio = systemInfo.windowWidth / 750

    // 初始高度512rpx，目标高度为屏幕的1/5
    const initialHeightPx = 512 * rpxRatio
    const targetHeightPx = screenHeight * 0.2
    const targetHeightRpx = targetHeightPx / rpxRatio

    // 最大滚动距离：背景图从512rpx减少到目标高度
    const maxScroll = initialHeightPx - targetHeightPx

    // 计算滚动进度（0到1）
    const progress = Math.min(scrollTop / maxScroll, 1)

    // 计算当前背景图高度
    const currentHeight = 512 - progress * (512 - targetHeightRpx)

    // 使用 clip-path 裁剪背景图（从底部裁剪）
    const clipBottom = 512 - currentHeight
    const headerClipPath = `inset(0 0 ${clipBottom}rpx 0)`

    // 头像缩放：从1缩小到0.5
    const avatarScale = 1 - progress * 0.5

    // 头像中心始终在背景图底部
    const avatarRadius = 128 // 头像半径保持128rpx（中心点位置不变）
    const avatarTop = currentHeight - avatarRadius

    this.setData({
      headerClipPath: headerClipPath,
      avatarScale: avatarScale,
      avatarTop: avatarTop
    })
  }
})
