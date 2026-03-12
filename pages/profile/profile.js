// pages/profile/profile.js
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
  return (items || []).map((item, index) => {
    const month = extractYearMonth(item.time)
    const isNewMonth = month !== lastMonth
    if (isNewMonth) lastMonth = month

    // 如果没有 icon，随机分配一个
    const icon = item.icon || getIcon(index)
    const color = item.color || (index % 2 === 0 ? 'blue' : 'green')

    return Object.assign({}, item, { isNewMonth, icon, color })
  })
}

const ICON_POOL = ['🏆', '⭐', '🎯', '💎', '🔥', '✨', '🌟', '💫', '🎖️', '🏅', '👑', '🎓']
function getIcon(index) { return ICON_POOL[index % ICON_POOL.length] }

// 解析徽章字符串：兼容 JSON 和旧 $ 格式
function parseBadges(data) {
  if (!data || typeof data !== 'string') return []
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        icon: getIcon(index),
        title: item.title || '',
        desc: item.desc || '',
        color: index % 2 === 0 ? 'amber' : 'blue'
      }))
    }
  } catch (e) {}
  // 旧格式
  if (!data.includes('$')) return []
  const badges = []
  data.split('&').filter(item => item.trim()).forEach((item, index) => {
    const parts = item.split('$').filter(p => p.trim())
    if (parts.length > 0) {
      badges.push({ icon: getIcon(index), title: parts[0].trim(), desc: parts.length > 1 ? parts[1].trim() : '', color: index % 2 === 0 ? 'amber' : 'blue' })
    }
  })
  return badges
}

// 解析时间线/动态字符串：兼容 JSON 和旧 $ 格式
function parseTimeline(data) {
  if (!data || typeof data !== 'string') return []
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      const items = parsed.map((item, index) => {
        const timeStart = item.timeStart || ''
        const timeEnd = item.timeEnd || ''
        let timeDisplay
        if (timeEnd) {
          timeDisplay = timeStart.slice(0, 7) + ' ~ ' + timeEnd.slice(0, 7)
        } else {
          timeDisplay = timeStart
        }
        return {
          time: timeDisplay,
          _sortKey: timeStart,
          title: item.title || '',
          desc: item.desc || '',
          icon: getIcon(index),
          color: index % 2 === 0 ? 'blue' : 'green'
        }
      })
      items.sort((a, b) => (!a._sortKey || !b._sortKey) ? 0 : b._sortKey.localeCompare(a._sortKey))
      return items
    }
  } catch (e) {}
  // 旧格式
  if (!data.includes('$')) return []
  const items = []
  data.split(/[\n]/).filter(line => line.trim()).forEach((line, index) => {
    const parts = line.split('$').filter(p => p.trim())
    if (parts.length > 0) {
      const rawTime = parts[0].trim()
      const tildeIdx = rawTime.indexOf('~')
      let timeDisplay, sortKey
      if (tildeIdx >= 0) {
        const start = rawTime.slice(0, tildeIdx).trim()
        const end = rawTime.slice(tildeIdx + 1).trim()
        timeDisplay = start.slice(0, 7) + ' ~ ' + end.slice(0, 7)
        sortKey = start
      } else {
        timeDisplay = rawTime
        sortKey = rawTime
      }
      items.push({
        time: timeDisplay,
        _sortKey: sortKey,
        title: parts.length > 1 ? parts[1].trim() : '',
        desc: parts.length > 2 ? parts[2].trim() : '',
        icon: getIcon(index),
        color: index % 2 === 0 ? 'blue' : 'green'
      })
    }
  })
  items.sort((a, b) => (!a._sortKey || !b._sortKey) ? 0 : b._sortKey.localeCompare(a._sortKey))
  return items
}

// 解析专业领域字符串：兼容 JSON 和旧 $ 格式
function parseSkills(data) {
  if (!data || typeof data !== 'string') return []
  try {
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {}
  return data.split('$').map(s => s.trim()).filter(s => s)
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
    qrcodeImage: '', // 初始为空，避免加载占位符 URL 失败
    headerClipPath: 'inset(0 0 0 0)',
    avatarScale: 1,
    avatarTop: 384,
    tenure: '', // 司龄
    customersServed: '', // 服务客户
    bio: '', // 个人简介
    shanxinLogoUrl: '', // 善心logo
    posterScrollReady: true, // 控制scroll-view的渲染，用于重置滚动位置
    canEdit: false, // 是否显示编辑按钮（开关开启且为本人时为 true）
    showActionSheet: false
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



    // 注册身份识别回调
    this._currentUserCb = (user) => {
      this.setData({ isCofounder: !!user })
      const { DATA_SOURCE_CONFIG } = require('../../utils/data-source-config.js')
      if (DATA_SOURCE_CONFIG.useNewProfileTable && this._currentPartnerEmployeeId) {
        // 只有当前用户是联合创始人且查看的是自己的页面时才能编辑
        const canEdit = !!user && user.employeeId === this._currentPartnerEmployeeId
        this.setData({ canEdit })
      }
    }
    app.globalData.currentUserListeners.push(this._currentUserCb)

    // 立即应用已有结果（如果身份识别已完成）
    if (app.globalData.openid && app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      this.setData({ isCofounder: !!app.globalData.currentUser })
    }

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

      // 使用 globalData 中的合伙人数据
      let partnersData = app.globalData.partnersData || []

      if (!partnersData.length) {
        // 如果 globalData 为空，显示错误
        wx.showToast({ title: '加载数据失败', icon: 'error' })
        return
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

      // 检查二维码文件是否存在（验证缓存路径的有效性）
      if (partner.qrcode) {
        try {
          const fs = wx.getFileSystemManager()
          fs.accessSync(partner.qrcode)
          console.log(`[${partner.name}] 二维码文件验证通过`)
        } catch (e) {
          console.log(`[${partner.name}] 二维码文件已失效，清空路径:`, partner.qrcode)
          partner.qrcode = '' // 清空失效的路径
        }
      }

      // 打印二维码状态日志
      console.log(`[${partner.name}] 二维码状态检查:`, {
        hasQrcodeKey: !!partner.qrcodeKey,
        qrcodeKey: partner.qrcodeKey || '无',
        hasQrcodePath: !!partner.qrcode,
        qrcodePath: partner.qrcode || '无',
        needDownload: !!(partner.qrcodeKey && !partner.qrcode)
      })

      // 立即展示文本数据（图片有则展示，无则空白等待）
      const badges = partner.badges || []
      const schoolArray = Array.isArray(partner.school) ? partner.school : [partner.school || '']
      const titleArray = Array.isArray(partner.title) ? partner.title : [partner.title || '']

      this.setData({
        avatar: partner.image || '',
        coverImage: partner.image || '',
        name: partner.name,
        school: partner.school,
        title: partner.title,
        schoolLines: schoolArray,
        titleLines: titleArray,
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

      // 按需下载二维码：如果有 qrcodeKey 但没有 qrcode 路径，立即下载
      if (partner.qrcodeKey && !partner.qrcode) {
        console.log(`[${partner.name}] 二维码未下载，开始按需下载...`)
        this.downloadQrcode(partner)
      }

      // 若头像还未下载，注册监听，下载完成后自动更新
      if (!partner.image) {
        const partnerEmployeeId = partner.employeeId
        this._imageReadyCb = (type, employeeId, path) => {
          if (employeeId !== partnerEmployeeId) return
          // 根据当前合伙人的 image/qrcode 字段判断是头像还是二维码
          const current = (app.globalData.partnersData || []).find(p => p.employeeId === employeeId)
          if (!current) return
          const update = {}
          if (type === 'avatar' && current.image === path) {
            update.avatar = path
            update.coverImage = path
          }
          if (type === 'qrcode' && current.qrcode === path) {
            update.qrcodeImage = path
          }
          if (Object.keys(update).length) this.setData(update)
        }
        app.globalData.imageReadyListeners.push(this._imageReadyCb)
      }

      // 注册数据变更监听：飞书有更新时刷新当前合伙人的文本信息和图片
      this._partnersDataCb = (partnersData) => {
        let updated
        if (this.useEmployeeId) {
          updated = partnersData.find(p => p.employeeId === this.partnerId)
        } else {
          updated = partnersData[this.partnerId] || partnersData[0]
        }
        if (!updated) return

        const schoolArray = Array.isArray(updated.school) ? updated.school : [updated.school || '']
        const titleArray = Array.isArray(updated.title) ? updated.title : [updated.title || '']

        const updateData = {
          name: updated.name,
          school: updated.school,
          title: updated.title,
          schoolLines: schoolArray,
          titleLines: titleArray,
          badges: updated.badges || [],
          timeline: markNewMonths(updated.timeline),
          activities: markNewMonths(updated.activities),
          skills: updated.skills || [],
          contacts: updated.contacts || [],
          tenure: this.calculateTenure(updated.joinDate),
          customersServed: updated.customersServed || '',
          bio: updated.bio || ''
        }

        // 只在图片有值时才更新，避免清空已显示的图片
        if (updated.image) {
          updateData.avatar = updated.image
          updateData.coverImage = updated.image
        }
        if (updated.qrcode) {
          updateData.qrcodeImage = updated.qrcode
        }

        this.setData(updateData)
      }
      app.globalData.partnersDataListeners.push(this._partnersDataCb)

      // 新表功能：存储当前合伙人 employeeId，设置 canEdit
      this._currentPartnerEmployeeId = partner.employeeId

      // 只有当前用户是联合创始人且查看的是自己的页面时才能编辑
      const currentUser = app.globalData.currentUser
      const canEdit = !!currentUser && currentUser.employeeId === partner.employeeId
      this.setData({ canEdit })
    } catch (error) {
      console.error('加载飞书合伙人数据失败:', error)
      wx.showToast({ title: '加载数据失败', icon: 'error' })
    }
  },

  // 按需下载二维码
  async downloadQrcode(partner) {
    const { ensureQrcodeDownloaded } = require('../../utils/profile-loader.js')

    try {
      const qrcodePath = await ensureQrcodeDownloaded(partner.employeeId)

      if (qrcodePath) {
        // 更新页面显示
        this.setData({ qrcodeImage: qrcodePath })
        console.log(`[${partner.name}] 二维码已准备好:`, qrcodePath)
      } else {
        console.error(`[${partner.name}] 二维码下载失败`)
      }
    } catch (error) {
      console.error(`[${partner.name}] 下载二维码出错:`, error)
    }
  },

  onShow() {
    getApp().preloadFeishuData()
  },

  onShowActionSheet() {
    this.setData({ showActionSheet: true })
  },

  onHideActionSheet() {
    this.setData({ showActionSheet: false })
  },

  onEditProfile() {
    this.setData({ showActionSheet: false })
    wx.navigateTo({
      url: `/pages/profile-edit/profile-edit?employeeId=${this._currentPartnerEmployeeId}`
    })
  },

  onUnload() {
    const app = getApp()

    // 清理监听器
    const listeners = [
      { list: 'imageReadyListeners', cb: '_imageReadyCb' },
      { list: 'partnersDataListeners', cb: '_partnersDataCb' },
      { list: 'assetsDataListeners', cb: '_assetsDataCb' },
      { list: 'currentUserListeners', cb: '_currentUserCb' }
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

  async onShowQRCode() {
    const app = getApp()
    const partnersData = app.globalData.partnersData || []

    // 查找当前合伙人
    let partner
    if (this.useEmployeeId) {
      partner = partnersData.find(p => p.employeeId === this.partnerId)
    } else {
      partner = partnersData[this.partnerId]
    }

    if (!partner) {
      wx.showToast({ title: '未找到合伙人信息', icon: 'error' })
      return
    }

    console.log(`[${partner.name}] 点击显示二维码，当前状态:`, {
      hasQrcodeKey: !!partner.qrcodeKey,
      hasQrcodePath: !!partner.qrcode,
      qrcodePath: partner.qrcode || '无',
      pageQrcodeImage: this.data.qrcodeImage || '无'
    })

    // 检查二维码文件是否存在（如果有路径的话）
    let qrcodeFileExists = false
    if (partner.qrcode) {
      try {
        const fs = wx.getFileSystemManager()
        fs.accessSync(partner.qrcode)
        qrcodeFileExists = true
        console.log(`[${partner.name}] 二维码文件存在，路径有效`)
      } catch (e) {
        console.log(`[${partner.name}] 二维码文件不存在，路径已失效:`, partner.qrcode)
        // 清空失效的路径
        partner.qrcode = ''
        this.setData({ qrcodeImage: '' })
      }
    }

    // 先显示弹窗
    this.setData({
      showQRCode: true
    })

    // 如果二维码未下载或文件已失效，显示加载提示并下载
    if (partner.qrcodeKey && (!partner.qrcode || !qrcodeFileExists)) {
      console.log(`[${partner.name}] 二维码需要下载，弹窗中开始下载...`)

      // 显示加载中的二维码占位
      this.setData({
        qrcodeImage: '' // 清空，显示加载状态
      })

      try {
        await this.downloadQrcode(partner)
        // 下载完成后，qrcodeImage 已在 downloadQrcode 中更新
        console.log(`[${partner.name}] 二维码下载完成，弹窗已更新显示`)
      } catch (error) {
        console.error(`[${partner.name}] 弹窗中下载二维码失败:`, error)
        wx.showToast({ title: '二维码加载失败', icon: 'error' })
      }
    } else if (partner.qrcode && qrcodeFileExists) {
      console.log(`[${partner.name}] 二维码已缓存且文件有效，直接显示`)
      // 确保页面数据是最新的
      this.setData({ qrcodeImage: partner.qrcode })
    } else {
      console.log(`[${partner.name}] 无 qrcodeKey，无法下载二维码`)
    }
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

  async onGeneratePoster() {
    const app = getApp()
    const partners = app.globalData.partnersData || []

    // 查找当前合伙人
    const currentPartnerIndex = this.useEmployeeId
      ? partners.findIndex(p => p.employeeId === this.partnerId)
      : this.partnerId

    const currentPartner = this.useEmployeeId
      ? (currentPartnerIndex >= 0 ? partners[currentPartnerIndex] : null)
      : (partners[currentPartnerIndex] || partners[0])

    if (!currentPartner) {
      wx.showToast({ title: '未找到合伙人信息', icon: 'error' })
      return
    }

    // 同步页面中已加载的图片路径
    if (this.data.avatar) currentPartner.image = this.data.avatar

    // 确保二维码已下载（使用统一接口）
    const { ensureQrcodeDownloaded } = require('../../utils/profile-loader.js')

    if (currentPartner.qrcodeKey) {
      wx.showLoading({ title: '准备中...', mask: true })

      try {
        const qrcodePath = await ensureQrcodeDownloaded(currentPartner.employeeId)

        if (qrcodePath) {
          currentPartner.qrcode = qrcodePath
          console.log(`[${currentPartner.name}] 二维码已准备好:`, qrcodePath)
        } else {
          console.log(`[${currentPartner.name}] 二维码下载失败，将不显示个人二维码`)
        }

        wx.hideLoading()
      } catch (error) {
        wx.hideLoading()
        console.error('下载二维码失败:', error)
        // 即使下载失败也继续生成海报
      }
    }

    // 调试日志：确认传递给海报生成器的数据
    console.log(`[生成海报] 准备生成海报，当前合伙人信息:`)
    console.log(`  - 姓名: ${currentPartner.name}`)
    console.log(`  - employeeId: ${currentPartner.employeeId}`)
    console.log(`  - qrcode: ${currentPartner.qrcode || '(空)'}`)
    console.log(`  - qrcodeKey: ${currentPartner.qrcodeKey || '(空)'}`)
    console.log(`  - image: ${currentPartner.image || '(空)'}`)

    // 先卸载scroll-view，强制重置滚动位置
    this.setData({ posterScrollReady: false }, () => {
      // 立即重新挂载scroll-view
      this.setData({ posterScrollReady: true }, () => {
        // 然后生成海报
        generateTeamPoster(this, 'posterCanvas', currentPartner, partners)
      })
    })
  },

  onHidePoster() {
    this.setData({
      showPoster: false,
      posterImage: ''
    })
  },



  // 分享功能
  onShareAppMessage() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const shareFrom = currentUser ? currentUser.employeeId : (app.globalData.initialShareFrom || 'guest')

    const basePath = this.useEmployeeId
      ? `/pages/profile/profile?employeeId=${this.partnerId}`
      : `/pages/profile/profile?id=${this.partnerId || 0}`

    const path = `${basePath}&shareFrom=${shareFrom}`

    // school 和 title 现在是数组，取第一个元素用于分享标题
    const schoolText = Array.isArray(this.data.school) ? (this.data.school[0] || '') : (this.data.school || '')
    const titleText = Array.isArray(this.data.title) ? (this.data.title[0] || '') : (this.data.title || '')

    return {
      title: `${this.data.name} - ${schoolText} - ${titleText}`,
      path: path,
      imageUrl: this.data.avatar || ''
    }
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop
    const windowInfo = wx.getWindowInfo()
    const screenHeight = windowInfo.windowHeight
    const rpxRatio = windowInfo.windowWidth / 750

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
  },

  // 头像/封面图片加载失败
  onAvatarError() {
    console.log('头像加载失败（可能是临时缓存已清理）')
    const app = getApp()
    const partnersData = app.globalData.partnersData || []

    // 找到当前合伙人
    let partner
    if (this.useEmployeeId) {
      partner = partnersData.find(p => p.employeeId === this.partnerId)
    } else {
      partner = partnersData[this.partnerId]
    }

    if (partner) {
      // 清除失效的图片路径
      partner.image = ''
      partner.loaded = false
      this.setData({ avatar: '', coverImage: '' })
      console.log('清除失效的头像路径，将触发重新下载')

      // 触发重新下载
      setTimeout(() => {
        app.preloadFeishuData()
      }, 100)
    }
  },

  // 二维码图片加载失败
  onQrcodeError() {
    console.log('二维码加载失败（可能是临时缓存已清理）')
    const app = getApp()
    const partnersData = app.globalData.partnersData || []

    // 找到当前合伙人
    let partner
    if (this.useEmployeeId) {
      partner = partnersData.find(p => p.employeeId === this.partnerId)
    } else {
      partner = partnersData[this.partnerId]
    }

    if (partner) {
      // 清除失效的二维码路径
      partner.qrcode = ''
      this.setData({ qrcodeImage: '' })
      console.log('清除失效的二维码路径，将触发重新下载')

      // 触发重新下载
      setTimeout(() => {
        app.preloadFeishuData()
      }, 100)
    }
  }
})
