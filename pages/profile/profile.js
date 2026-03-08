// pages/profile/profile.js
const { getPartnersDataSync, fetchFeishuPartnersText, downloadImagesBackground } = require('../../utils/partners-data-loader.js')
const { getAssetPath } = require('../../utils/assets-loader.js')
const { generateTeamPoster } = require('../../utils/poster-generator.js')

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
    isCofounder: false,
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
    const app = getApp()

    // 是否是联合创始人
    this.setData({ isCofounder: !!app.globalData.currentUser })

    // 加载善心 logo（代码：shanxinzheli）
    const shanxinLogoPath = getAssetPath('shanxinzheli')
    if (shanxinLogoPath) {
      this.setData({ shanxinLogoUrl: shanxinLogoPath })
    }

    // 注册静态资源下载完成回调
    this._assetsDataCb = (assets) => {
      if (assets && assets['shanxinzheli']) {
        const path = typeof assets['shanxinzheli'] === 'string' ? assets['shanxinzheli'] : assets['shanxinzheli'].path
        this.setData({ shanxinLogoUrl: path })
      }
    }
    app.globalData.assetsDataListeners.push(this._assetsDataCb)

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

    // 清理监听器
    const listeners = [
      { list: 'imageReadyListeners', cb: '_imageReadyCb' },
      { list: 'partnersDataListeners', cb: '_partnersDataCb' },
      { list: 'assetsDataListeners', cb: '_assetsDataCb' }
    ]

    listeners.forEach(({ list, cb }) => {
      if (this[cb]) {
        app.globalData[list] = app.globalData[list].filter(callback => callback !== this[cb])
        this[cb] = null
      }
    })
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
    const partners = getPartnersDataSync()

    // 查找当前合伙人
    const currentPartnerIndex = this.useEmployeeId
      ? partners.findIndex(p => p.employeeId === this.partnerId)
      : this.partnerId

    const currentPartner = this.useEmployeeId
      ? (currentPartnerIndex >= 0 ? partners[currentPartnerIndex] : null)
      : (partners[currentPartnerIndex] || partners[0])

    // 同步页面中已加载的图片路径
    if (currentPartner) {
      if (this.data.avatar) currentPartner.image = this.data.avatar
      if (this.data.qrcodeImage) currentPartner.qrcode = this.data.qrcodeImage
    }

    generateTeamPoster(this, 'posterCanvas', currentPartner, partners)
  },

  onHidePoster() {
    this.setData({ showPoster: false })
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
