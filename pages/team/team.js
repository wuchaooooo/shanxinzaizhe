// pages/team/team.js
const { getPartnersDataSync, fetchFeishuPartnersText, downloadImagesBackground } = require('../../utils/partners-data-loader.js')
const { getAssetPath } = require('../../utils/assets-loader.js')
const { animateNumbers } = require('../../utils/animate.js')
const { generateTeamPoster, generateShareImage } = require('../../utils/poster-generator.js')

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

// 处理合伙人数据,将school和title拆分成数组
// team页面只显示第一个
function processPartnerData(partner) {
  const schoolLines = splitBySymbols(partner.school)
  const titleLines = splitBySymbols(partner.title)

  return {
    ...partner,
    schoolLines: schoolLines.length > 0 ? [schoolLines[0]] : [''],
    titleLines: titleLines.length > 0 ? [titleLines[0]] : ['']
  }
}

// 生成占位符数据（用于首次加载时显示骨架屏）
function generatePlaceholders(count = 15) {
  return Array.from({ length: count }, (_, i) => ({
    name: `加载中...`,
    school: '',
    title: '',
    image: '',
    loaded: false,
    schoolLines: [''],
    titleLines: [''],
    employeeId: `placeholder_${i}`
  }))
}

function getInitialPartners() {
  const cached = getPartnersDataSync()
  if (cached.length > 0) {
    return cached.map(partner => processPartnerData({
      ...partner,
      loaded: false  // 初始设为 false，等待图片实际加载完成后再设为 true
    }))
  }
  // 如果没有缓存数据，返回占位符
  return generatePlaceholders()
}

Page({
  data: {
    searchQuery: '',
    partners: getInitialPartners(),
    filteredPartners: getInitialPartners(),  // 使用缓存的图片初始化
    teamCount: 0,
    totalBadges: 0,
    uniqueSkills: 0,
    searchPlaceholder: '搜索善心浙里联合创始人',
    isApplyMode: false,
    isCofounder: false,  // 当前用户是否为联合创始人
    loading: false,
    allImagesLoaded: false, // 是否所有合伙人头像已加载完成
    shanxinLogoUrl: '', // 善心logo
    posterBtnLogoLoaded: false, // 海报按钮logo是否加载完成
    posterScrollReady: true, // 控制scroll-view的渲染，用于重置滚动位置
    shareImageUrl: '' // 分享图片路径
  },

  checkAllImagesLoaded(partners) {
    if (!partners || partners.length === 0) return false
    return partners.every(p => p.loaded)
  },

  onLoad() {
    // 加载善心 logo（代码：shanxinzheli）
    const shanxinLogoPath = getAssetPath('shanxinzheli')
    if (shanxinLogoPath) {
      this.setData({ shanxinLogoUrl: shanxinLogoPath })
    }

    const app = getApp()
    // 注册静态资源下载完成回调
    this._assetsDataCb = (assets) => {
      if (assets && assets['shanxinzheli']) {
        const path = typeof assets['shanxinzheli'] === 'string' ? assets['shanxinzheli'] : assets['shanxinzheli'].path
        this.setData({ shanxinLogoUrl: path })
      }
    }
    app.globalData.assetsDataListeners.push(this._assetsDataCb)

    const partnersData = getPartnersDataSync()

    if (partnersData.length > 0) {
      const partners = partnersData.map(partner => processPartnerData({
        ...partner,
        loaded: false  // 初始设为 false，等待图片实际加载完成
      }))
      this.setData({
        partners,
        filteredPartners: partners,
        allImagesLoaded: false
      })
      this.calculateStats()
    } else {
      this.loadFeishuData()
    }

    // 注册头像下载完成回调，每下载好一张就更新对应卡片（只处理头像，不处理二维码）
    this._imageReadyCb = (name, path) => {
      console.log('_imageReadyCb 被调用:', name, path)
      const partners = this.data.partners
      const idx = partners.findIndex(p => p.name === name)
      if (idx === -1) {
        console.log('_imageReadyCb: 未找到合伙人:', name)
        return
      }

      console.log(`_imageReadyCb: 更新 partners[${idx}] 的图片路径`)

      // 同时更新 globalData，确保其他页面能获取到最新数据
      const globalPartners = app.globalData.partnersData || []
      const globalIdx = globalPartners.findIndex(p => p.name === name)
      if (globalIdx !== -1) {
        globalPartners[globalIdx].image = path
        app.globalData.partnersData = globalPartners
        console.log(`_imageReadyCb: 同步更新 globalData.partnersData[${globalIdx}]`)
      }

      const updates = {
        [`partners[${idx}].image`]: path
        // 不在这里设置 loaded: true，等待 onImageLoad 事件触发
      }
      const fidx = this.data.filteredPartners.findIndex(p => p.name === name)
      if (fidx !== -1) {
        updates[`filteredPartners[${fidx}].image`] = path
      }

      this.setData(updates, () => {
        console.log(`_imageReadyCb: ${name} 图片路径更新完成，等待图片加载`)
      })
    }
    app.globalData.imageReadyListeners.push(this._imageReadyCb)

    // 注册文本数据刷新回调，飞书数据更新时重建列表
    this._partnersDataCb = (partnersData) => {
      const partners = partnersData.map(partner => processPartnerData({
        ...partner,
        loaded: !!partner.image
      }))
      this.setData({
        partners,
        filteredPartners: partners,
        searchQuery: '',
        allImagesLoaded: this.checkAllImagesLoaded(partners)
      })
      this.calculateStats()
    }
    app.globalData.partnersDataListeners.push(this._partnersDataCb)

    // 注册身份识别回调，更新底部按钮
    this._currentUserCb = (user) => {
      this.setData({ isCofounder: !!user })
    }
    app.globalData.currentUserListeners.push(this._currentUserCb)

    // 立即应用已有结果（如果身份识别已完成）
    // 注意：只有当 openid 和 partnersData 都存在时，才能确定身份识别已完成
    if (app.globalData.openid && app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      this.setData({ isCofounder: !!app.globalData.currentUser })
    }
  },

  onUnload() {
    const app = getApp()

    // 清理监听器
    const listeners = [
      { list: 'imageReadyListeners', cb: '_imageReadyCb' },
      { list: 'partnersDataListeners', cb: '_partnersDataCb' },
      { list: 'currentUserListeners', cb: '_currentUserCb' },
      { list: 'assetsDataListeners', cb: '_assetsDataCb' }
    ]

    listeners.forEach(({ list, cb }) => {
      if (this[cb]) {
        app.globalData[list] = app.globalData[list].filter(callback => callback !== this[cb])
        this[cb] = null
      }
    })

    // 清理定时器
    const timers = ['_animateTimer', '_posterCheckInterval']
    const timeouts = ['_posterTimeout']

    timers.forEach(timer => {
      if (this[timer]) {
        clearInterval(this[timer])
        this[timer] = null
      }
    })

    timeouts.forEach(timeout => {
      if (this[timeout]) {
        clearTimeout(this[timeout])
        this[timeout] = null
      }
    })
  },

  // 加载飞书数据（缓存为空时的冷启动路径）
  async loadFeishuData() {
    this.setData({ loading: true })
    try {
      // 阶段一：先拿文本数据，立即展示
      const { partners: partnersData, changedIds } = await fetchFeishuPartnersText()
      const app = getApp()
      app.globalData.partnersData = partnersData

      const partners = partnersData.map(partner => processPartnerData({
        ...partner,
        loaded: false  // 图片还没下载
      }))
      this.setData({ partners, filteredPartners: partners, loading: false })
      this.calculateStats()

      // 阶段二：后台下载图片，只对有变更的合伙人触发重渲染
      downloadImagesBackground(partnersData, (name, path) => {
        app.globalData.imageReadyListeners.forEach(cb => cb(name, path))
      }, changedIds)
    } catch (error) {
      console.error('加载飞书数据失败:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载数据失败', icon: 'error' })
    }
  },

  onShow() {
    getApp().preloadFeishuData()
  },

  calculateStats() {
    // 计算团队统计数据
    const teamCount = this.data.partners.length

    // 计算总徽章数
    const totalBadges = this.data.partners.reduce((sum, partner) => {
      return sum + (partner.badges ? partner.badges.length : 0)
    }, 0)

    // 计算独特技能数
    const allSkills = this.data.partners.reduce((skills, partner) => {
      return skills.concat(partner.skills || [])
    }, [])
    const uniqueSkills = Array.from(new Set(allSkills)).length

    animateNumbers(this, {
      teamCount: { to: teamCount },
      totalBadges: { to: totalBadges },
      uniqueSkills: { to: uniqueSkills }
    })

    // 数据变化时清空分享图，触发重新生成
    this.setData({ shareImageUrl: '' })

    // 生成分享图
    if (teamCount > 0) {
      this.generateShareImageIfNeeded()
    }
  },

  // 生成分享图（如果还没有生成）
  generateShareImageIfNeeded() {
    const stats = {
      teamCount: this.data.teamCount,
      totalBadges: this.data.totalBadges,
      uniqueSkills: this.data.uniqueSkills
    }
    // 只传递已加载的合伙人
    const loadedPartners = this.data.partners.filter(p => p.loaded && p.image)
    if (loadedPartners.length > 0) {
      generateShareImage(this, 'shareCanvas', stats, loadedPartners)
    }
  },

  onSearchInput(e) {
    const query = e.detail.value.toLowerCase()
    this.setData({
      searchQuery: query
    })

    // 根据搜索关键词过滤合伙人
    if (query === '') {
      // 如果搜索框为空，显示所有合伙人
      this.setData({
        filteredPartners: this.data.partners
      })
    } else {
      // 根据姓名、学校或职位过滤
      const filtered = this.data.partners.filter(partner => {
        return partner.name.toLowerCase().includes(query) ||
          partner.school.toLowerCase().includes(query) ||
          partner.title.toLowerCase().includes(query)
      })
      this.setData({
        filteredPartners: filtered
      })
    }
  },

  onPartnerTap(e) {
    const name = e.currentTarget.dataset.name
    // 在原始partners数组中查找对应的合伙人
    const partner = this.data.partners.find(p => p.name === name)
    if (partner && partner.employeeId) {
      // 使用营销员工号作为唯一标识
      wx.navigateTo({
        url: `/pages/profile/profile?employeeId=${partner.employeeId}`
      })
    } else if (partner) {
      // 如果没有营销员工号，降级使用索引
      const index = this.data.partners.findIndex(p => p.name === name)
      wx.navigateTo({
        url: `/pages/profile/profile?id=${index}`
      })
    }
  },

  onApplyPartner() {
    // 切换到申请模式
    this.setData({
      isApplyMode: true,
      searchPlaceholder: '请输入引荐人名字',
      searchQuery: ''
    })

    // 聚焦到搜索框
    // 注意：小程序中需要通过设置 focus 属性来实现
  },

  // 点击容器空白处,恢复搜索框状态
  onContainerTap() {
    if (this.data.isApplyMode) {
      this.setData({
        isApplyMode: false,
        searchPlaceholder: '搜索善心浙里联合创始人',
        searchQuery: '',
        filteredPartners: this.data.partners
      })
    }
  },

  // 阻止搜索框点击事件冒泡
  onSearchTap() {
    // 空方法,用于阻止事件冒泡到容器
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: `善心浙里-${this.data.teamCount}位联合创始人`,
      path: '/pages/team/team',
      imageUrl: this.data.shareImageUrl || this.data.shanxinLogoUrl || ''
    }
  },

  // 等待所有头像加载完成
  waitForImagesLoaded(callback) {
    wx.showLoading({ title: '等待头像加载...' })

    this._posterCheckInterval = setInterval(() => {
      if (this.checkAllImagesLoaded(this.data.partners)) {
        clearInterval(this._posterCheckInterval)
        this._posterCheckInterval = null
        wx.hideLoading()
        callback()
      }
    }, 300)

    // 设置超时（30秒后强制执行）
    this._posterTimeout = setTimeout(() => {
      if (this._posterCheckInterval) {
        clearInterval(this._posterCheckInterval)
        this._posterCheckInterval = null
      }
      wx.hideLoading()
      wx.showToast({ title: '部分头像未加载完成', icon: 'none', duration: 2000 })
      setTimeout(callback, 2000)
    }, 30000)
  },

  // 海报按钮点击处理
  onPosterBtnTap() {
    if (!this.data.allImagesLoaded) {
      wx.showToast({
        title: '头像加载中...',
        icon: 'loading',
        duration: 1500
      })
    } else {
      this.onGeneratePoster()
    }
  },

  // 联合创始人：生成团队海报
  onGeneratePoster() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    if (!currentUser) return

    const generatePoster = () => {
      // 先卸载scroll-view，强制重置滚动位置
      this.setData({ posterScrollReady: false }, () => {
        // 立即重新挂载scroll-view
        this.setData({ posterScrollReady: true }, () => {
          // 然后生成海报
          generateTeamPoster(this, 'posterCanvas', currentUser, this.data.partners)
        })
      })
    }

    // 检查是否所有头像都已加载
    if (!this.data.allImagesLoaded) {
      this.waitForImagesLoaded(generatePoster)
    } else {
      generatePoster()
    }
  },

  onHidePoster() {
    this.setData({
      showPoster: false,
      posterImage: ''
    })
  },

  // 阻止事件冒泡
  onStopPropagation() {
    // 空方法，用于阻止事件冒泡
  },

  // 海报按钮logo加载完成
  onPosterBtnLogoLoad() {
    this.setData({
      posterBtnLogoLoaded: true
    })
  },

  // 图片加载成功
  onImageLoad(e) {
    const name = e.currentTarget.dataset.name
    console.log('图片加载成功:', name)
    const partners = this.data.partners
    const idx = partners.findIndex(p => p.name === name)
    if (idx === -1) {
      console.log('未找到合伙人:', name)
      return
    }

    console.log(`设置 partners[${idx}].loaded = true`)
    const updates = {
      [`partners[${idx}].loaded`]: true
    }
    const fidx = this.data.filteredPartners.findIndex(p => p.name === name)
    if (fidx !== -1) {
      updates[`filteredPartners[${fidx}].loaded`] = true
    }

    this.setData(updates, () => {
      console.log(`${name} loaded 状态已更新`)
      this.setData({ allImagesLoaded: this.checkAllImagesLoaded(this.data.partners) })

      // 如果还没有生成分享图，且有足够的头像，尝试生成
      if (!this.data.shareImageUrl && this.data.teamCount > 0) {
        const loadedCount = this.data.partners.filter(p => p.loaded).length
        if (loadedCount >= 3) { // 至少3个头像加载完成后生成分享图
          this.generateShareImageIfNeeded()
        }
      }
    })
  },

  // 图片加载失败
  onImageError(e) {
    const name = e.currentTarget.dataset.name
    console.log('图片加载失败:', name)
    // 图片加载失败时，保持 loaded: false，继续显示骨架屏
    // 后台的 imageReadyListeners 会重新下载图片
  }
})
