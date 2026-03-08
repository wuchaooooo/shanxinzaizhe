// pages/home/home.js
const { getPartnersDataSync } = require('../../utils/partners-data-loader.js')
const { animateNumbers } = require('../../utils/animate.js')
const { getAssetPath } = require('../../utils/assets-loader.js')

Page({
  data: {
    shanxinzheliLogoUrl: '',
    aiaLogoUrl: '',
    logoLoaded: false,
    logoAnimate: false,
    teamCount: 0,
    totalCustomers: '0+',
    instructorCount: 0,
    values: [
      {
        icon: '🚩',
        title: '我们的使命',
        desc: '务必以合作、互助的态度，实现伙伴完美人生；\n务必以专业、用心的态度，锁住客户幸福生活。',
        image: '',
        loaded: false
      },
      {
        icon: '👁️',
        title: '我们的愿景',
        desc: '成为创业者和客户最受信赖的金融保险代理平台；\n树立金融保险行业标杆，造就国际业界典范！',
        image: '',
        loaded: false
      },
      {
        icon: '❤️',
        title: '核心价值观',
        desc: '利他精神，\n培养有价值的人',
        image: '',
        loaded: false
      }
    ]
  },

  calculateStats() {
    const partnersData = getPartnersDataSync()
    if (!partnersData.length) return

    const teamCount = partnersData.length

    let totalCustomersCount = 0
    partnersData.forEach(partner => {
      if (partner.customersServed) {
        const match = partner.customersServed.match(/\d+/)
        if (match) totalCustomersCount += parseInt(match[0])
      }
    })
    const roundedCustomers = Math.floor(totalCustomersCount / 100) * 100

    const instructorCount = partnersData.filter(p => p.isInstructor).length

    animateNumbers(this, {
      teamCount: { to: teamCount },
      totalCustomers: { to: roundedCustomers, suffix: '+' },
      instructorCount: { to: instructorCount }
    })
  },

  onLoad() {
    const app = getApp()
    this.calculateStats()

    // 注册数据刷新回调，飞书数据更新时重算统计
    this._partnersDataCb = () => this.calculateStats()
    app.globalData.partnersDataListeners.push(this._partnersDataCb)

    // 注册静态资源刷新回调
    this._assetsDataCb = () => this.loadAssetsFromFeishu()
    app.globalData.assetsDataListeners.push(this._assetsDataCb)

    // 从飞书 base 加载静态资源(立即加载一次,后续通过监听器更新)
    this.loadAssetsFromFeishu()
  },

  // 从飞书 base 加载静态资源
  loadAssetsFromFeishu() {
    console.log('home.loadAssetsFromFeishu 开始加载资源')

    // 加载善心浙里 logo（代码：shanxinzheli）
    const logoPath = getAssetPath('shanxinzheli')
    console.log('shanxinzheli 路径:', logoPath)
    if (logoPath) {
      this.setData({ shanxinzheliLogoUrl: logoPath, logoLoaded: true, logoAnimate: true })
    }

    // 加载 AIA logo（代码：aia）
    const aiaLogoPath = getAssetPath('aia')
    console.log('aia 路径:', aiaLogoPath)
    if (aiaLogoPath) {
      this.setData({ aiaLogoUrl: aiaLogoPath })
    }

    // 加载 banner 图片（代码：mission_banner, vision_banner, value_banner）
    const missionPath = getAssetPath('mission_banner')
    const visionPath = getAssetPath('vision_banner')
    const valuesPath = getAssetPath('value_banner')

    console.log('banner 路径:', { missionPath, visionPath, valuesPath })

    const updates = {}
    if (missionPath) {
      updates['values[0].image'] = missionPath
      updates['values[0].loaded'] = true
    }
    if (visionPath) {
      updates['values[1].image'] = visionPath
      updates['values[1].loaded'] = true
    }
    if (valuesPath) {
      updates['values[2].image'] = valuesPath
      updates['values[2].loaded'] = true
    }

    if (Object.keys(updates).length > 0) {
      this.setData(updates)
    }
  },

  onUnload() {
    const app = getApp()
    app.globalData.partnersDataListeners = app.globalData.partnersDataListeners.filter(cb => cb !== this._partnersDataCb)
    app.globalData.assetsDataListeners = app.globalData.assetsDataListeners.filter(cb => cb !== this._assetsDataCb)
    this._partnersDataCb = null
    this._assetsDataCb = null
    if (this._animateTimer) {
      clearInterval(this._animateTimer)
      this._animateTimer = null
    }
  },

  onShow() {
    // 数据可能在后台加载完成后才可用，重新计算统计
    this.calculateStats()

    // 重置动画状态，让logo重新播放心跳动画（只重置动画class，不影响显示）
    if (this.data.logoLoaded) {
      this.setData({ logoAnimate: false })
      setTimeout(() => this.setData({ logoAnimate: true }), 50)
    }
  },

  onSearch() {
    wx.showToast({
      title: '搜索功能开发中',
      icon: 'none'
    })
  },

  onNotification() {
    wx.showToast({
      title: '暂无新通知',
      icon: 'none'
    })
  },

  onConsult() {
    wx.switchTab({
      url: '/pages/team/team'
    })
  },

  onLearnMore() {
    wx.navigateTo({
      url: '/pages/about-aia/about-aia'
    })
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '善心浙里 - 与您共创丰盛未来',
      path: '/pages/home/home',
      imageUrl: this.data.shanxinzheliLogoUrl || ''
    }
  }
})
