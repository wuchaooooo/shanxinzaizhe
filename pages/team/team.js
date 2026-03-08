// pages/team/team.js
const { getPartnersDataSync, fetchFeishuPartnersText, downloadImagesBackground } = require('../../utils/partners-data-loader.js')
const { animateNumbers } = require('../../utils/animate.js')

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

function getInitialPartners() {
  return getPartnersDataSync().map(partner => processPartnerData({
    ...partner,
    loaded: !!partner.image
  }))
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
    loading: false
  },

  onLoad() {
    const partnersData = getPartnersDataSync()

    if (partnersData.length > 0) {
      const partners = partnersData.map(partner => processPartnerData({
        ...partner,
        loaded: !!partner.image
      }))
      this.setData({ partners, filteredPartners: partners })
      this.calculateStats()
    } else {
      this.loadFeishuData()
    }

    // 注册头像下载完成回调，每下载好一张就更新对应卡片（只处理头像，不处理二维码）
    const app = getApp()
    this._imageReadyCb = (name, path) => {
      const partners = this.data.partners
      const idx = partners.findIndex(p => p.name === name)
      if (idx === -1) return

      const updates = {
        [`partners[${idx}].image`]: path,
        [`partners[${idx}].loaded`]: true
      }
      const fidx = this.data.filteredPartners.findIndex(p => p.name === name)
      if (fidx !== -1) {
        updates[`filteredPartners[${fidx}].image`] = path
        updates[`filteredPartners[${fidx}].loaded`] = true
      }
      this.setData(updates)
    }
    app.globalData.imageReadyListeners.push(this._imageReadyCb)

    // 注册文本数据刷新回调，飞书数据更新时重建列表
    this._partnersDataCb = (partnersData) => {
      const partners = partnersData.map(partner => processPartnerData({
        ...partner,
        loaded: !!partner.image
      }))
      this.setData({ partners, filteredPartners: partners, searchQuery: '' })
      this.calculateStats()
    }
    app.globalData.partnersDataListeners.push(this._partnersDataCb)
  },

  onUnload() {
    const app = getApp()
    app.globalData.imageReadyListeners = app.globalData.imageReadyListeners.filter(cb => cb !== this._imageReadyCb)
    this._imageReadyCb = null
    app.globalData.partnersDataListeners = app.globalData.partnersDataListeners.filter(cb => cb !== this._partnersDataCb)
    this._partnersDataCb = null
    if (this._animateTimer) {
      clearInterval(this._animateTimer)
      this._animateTimer = null
    }
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

    // 重置头像动画状态，让头像重新播放入场动画
    const partners = this.data.partners
    if (partners.some(p => p.loaded)) {
      const resetUpdates = {}
      partners.forEach((p, i) => { if (p.loaded) resetUpdates[`partners[${i}].loaded`] = false })
      const filteredPartners = this.data.filteredPartners
      filteredPartners.forEach((p, i) => { if (p.loaded) resetUpdates[`filteredPartners[${i}].loaded`] = false })
      this.setData(resetUpdates)

      setTimeout(() => {
        const restoreUpdates = {}
        this.data.partners.forEach((p, i) => { if (p.image) restoreUpdates[`partners[${i}].loaded`] = true })
        this.data.filteredPartners.forEach((p, i) => { if (p.image) restoreUpdates[`filteredPartners[${i}].loaded`] = true })
        this.setData(restoreUpdates)
      }, 50)
    }
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
      title: `善心浙里团队 - ${this.data.teamCount}位联合创始人`,
      path: '/pages/team/team',
      imageUrl: ''
    }
  }
})
