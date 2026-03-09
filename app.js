// app.js
const { DATA_SOURCE_CONFIG } = require('./utils/data-source-config.js')
const { fetchFeishuPartnersText, downloadImagesBackground, getPartnersFromCache } = require('./utils/partners-data-loader.js')
const { fetchFeishuAssets, getAssetsFromCache } = require('./utils/assets-loader.js')
const { fetchFeishuEventsText, downloadEventImagesBackground, getEventsFromCache } = require('./utils/events-data-loader.js')
const { updateShareTracking } = require('./utils/feishu-api.js')

App({
  async onLaunch(options) {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'shanxinzaizhe-1g0sxfo695003783',
      traceUser: true
    })

    // 解析分享来源参数
    const shareParams = this.parseShareParams(options)
    if (shareParams.shareFrom) {
      this.globalData.initialShareFrom = shareParams.shareFrom
      console.log('分享来源:', shareParams.shareFrom)
      // 调用统计接口
      this.trackShare(shareParams)
    }

    // 获取 openid 并与飞书联合创始人数据比对身份（尽早发起网络请求）
    this.fetchOpenidAndMatchUser()

    // 如果使用飞书数据源，先从本地缓存恢复数据（立即可用），再异步拉取最新
    if (DATA_SOURCE_CONFIG.source === 'feishu') {
      // 优先加载静态资源（logo、banner等）
      const cachedAssets = getAssetsFromCache()
      if (Object.keys(cachedAssets).length > 0) {
        this.globalData.assetsData = cachedAssets
      }

      // 等待静态资源下载完成后再下载头像,确保首页图片优先展示
      await this.preloadFeishuAssets()

      // 然后加载联合创始人数据和头像
      const cached = getPartnersFromCache()
      if (cached.length > 0) {
        this.globalData.partnersData = cached
      }
      await this.preloadFeishuData()

      // 最后加载活动数据
      const cachedEvents = getEventsFromCache()
      if (cachedEvents.length > 0) {
        this.globalData.eventsData = cachedEvents
      }
      await this.preloadFeishuEvents()
    }

    // 小程序启动时执行
    console.log('AIA Excellence 小程序启动')

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = systemInfo

    // 检查更新
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate()
            }
          }
        })
      })
    }
  },

  // 预加载飞书数据（两阶段：文本数据先返回，图片后台下载）
  async preloadFeishuData() {
    if (this._fetchingFeishuData) return
    this._fetchingFeishuData = true
    try {
      console.log('开始预加载飞书数据...')

      const { partners, changedIds } = await fetchFeishuPartnersText()

      // 始终更新引用，保证图片路径的修改（p.image = path）能同步到 globalData
      this.globalData.partnersData = partners

      // 飞书数据更新后，若已有 openid，重新比对身份
      if (this.globalData.openid) {
        this._matchCurrentUser(this.globalData.openid)
      }

      // 始终通知页面刷新（确保统计数字等信息更新）
      this.globalData.partnersDataListeners.forEach(cb => cb(partners))

      // 等待头像和二维码下载完成
      await downloadImagesBackground(partners, (name, path) => {
        this.globalData.imageReadyListeners.forEach(cb => cb(name, path))
      }, changedIds)
    } catch (error) {
      console.error('预加载飞书数据失败:', error)
    } finally {
      this._fetchingFeishuData = false
    }
  },

  // 预加载飞书静态资源
  async preloadFeishuAssets() {
    if (this._fetchingFeishuAssets) return
    this._fetchingFeishuAssets = true
    try {
      console.log('开始预加载飞书静态资源...')

      const { assets } = await fetchFeishuAssets((code) => {
        // 每个资源下载完成后立即更新 globalData 并通知页面
        console.log(`静态资源 [${code}] 就绪,立即通知页面`)
        this.globalData.assetsData = getAssetsFromCache()
        this.globalData.assetsDataListeners.forEach(cb => cb(this.globalData.assetsData))
      })

      // 最后再更新一次全局数据(确保所有资源都已加载)
      this.globalData.assetsData = assets
    } catch (error) {
      console.error('预加载飞书静态资源失败:', error)
    } finally {
      this._fetchingFeishuAssets = false
    }
  },

  // 预加载飞书活动数据（两阶段：文本数据先返回，图片后台下载）
  async preloadFeishuEvents() {
    if (this._fetchingFeishuEvents) return
    this._fetchingFeishuEvents = true
    try {
      console.log('开始预加载飞书活动数据...')

      const { events, changedIds } = await fetchFeishuEventsText()

      // 始终更新引用，保证图片路径的修改能同步到 globalData
      this.globalData.eventsData = events

      // 始终通知页面刷新
      this.globalData.eventsDataListeners.forEach(cb => cb(events))

      // 等待活动图片下载完成
      await downloadEventImagesBackground(events, (name, path) => {
        this.globalData.eventsImageReadyListeners.forEach(cb => cb(name, path))
      }, changedIds)
    } catch (error) {
      console.error('预加载飞书活动数据失败:', error)
    } finally {
      this._fetchingFeishuEvents = false
    }
  },

  // 获取当前登录用户的 openid，并与飞书联合创始人数据比对身份
  fetchOpenidAndMatchUser() {
    wx.cloud.callFunction({
      name: 'getOpenid',
      success: (r) => {
        const openid = r.result && r.result.openid
        if (!openid) return
        this.globalData.openid = openid
        this._matchCurrentUser(openid)
      },
      fail: (err) => {
        console.error('获取 openid 失败:', err)
      }
    })
  },

  // 根据 openid 查找对应的联合创始人记录
  _matchCurrentUser(openid) {
    const partners = this.globalData.partnersData
    if (!partners || partners.length === 0) {
      console.log('身份识别：等待合伙人数据加载...')
      return
    }
    const matched = partners.find(p => p.wxOpenid && p.wxOpenid.trim() === openid.trim()) || null
    this.globalData.currentUser = matched
    console.log('身份识别结果:', matched ? `联合创始人 ${matched.name}` : '普通用户')
    // 始终通知 listeners，即使是 null（普通用户）
    this.globalData.currentUserListeners.forEach(cb => cb(matched))
  },

  async onShow(options) {
    // 解析分享来源参数（从后台切换回来时）
    if (options) {
      const shareParams = this.parseShareParams(options)
      if (shareParams.shareFrom && shareParams.shareFrom !== this.globalData.lastTrackedShareFrom) {
        this.globalData.initialShareFrom = shareParams.shareFrom
        console.log('分享来源（onShow）:', shareParams.shareFrom)
        // 调用统计接口
        this.trackShare(shareParams)
      }
    }

    // 每次显示时重新拉取飞书数据，优先加载静态资源
    if (DATA_SOURCE_CONFIG.source === 'feishu') {
      await this.preloadFeishuAssets()
      await this.preloadFeishuData()
      await this.preloadFeishuEvents()
    }
  },

  // 解析分享参数
  parseShareParams(options) {
    let shareFrom = null
    let targetPage = options.path || ''

    // 场景1：分享链接（query参数）
    if (options.query && options.query.shareFrom) {
      shareFrom = options.query.shareFrom
    }

    // 场景2：小程序码（scene参数）
    if (options.scene) {
      const sceneStr = decodeURIComponent(options.scene)
      if (sceneStr.startsWith('e')) {
        shareFrom = sceneStr.slice(1) // e12345 -> 12345
      }
    }

    return { shareFrom, targetPage, scene: options.scene || '' }
  },

  // 调用分享统计接口
  async trackShare(shareParams) {
    const { shareFrom } = shareParams

    // 记录最近一次统计的分享来源，避免重复统计
    this.globalData.lastTrackedShareFrom = shareFrom

    // 确定分享者姓名
    let shareFromName = '普通用户'
    if (shareFrom && shareFrom !== 'guest') {
      // 如果 partnersData 还没加载，先从缓存加载
      let partnersData = this.globalData.partnersData
      if (!partnersData || partnersData.length === 0) {
        partnersData = getPartnersFromCache()
      }

      // 从合伙人数据中查找对应的姓名
      const partner = partnersData.find(p => p.employeeId === shareFrom)
      if (partner) {
        shareFromName = partner.name
      }
    }

    // 直接调用飞书 API 更新统计
    try {
      const result = await updateShareTracking(shareFrom, shareFromName)
      console.log('分享统计成功:', result)
    } catch (error) {
      console.error('分享统计失败:', error)
    }
  },

  onHide() {
    // 小程序隐藏时执行
  },

  globalData: {
    systemInfo: null,
    userInfo: null,
    openid: null,                // 当前登录用户的微信 openid
    currentUser: null,           // 匹配到的联合创始人对象，null 表示普通用户
    currentUserListeners: [],    // 身份识别完成回调列表
    partnersData: null,          // 飞书数据缓存
    imageReadyListeners: [],     // 头像下载完成回调列表，team/profile 页面注册
    partnersDataListeners: [],   // 文本数据刷新回调列表，home/team 页面注册
    assetsData: {},              // 静态资源缓存
    assetsDataListeners: [],     // 静态资源刷新回调列表
    eventsData: null,            // 活动数据缓存
    eventsImageReadyListeners: [], // 活动图片下载完成回调列表
    eventsDataListeners: [],     // 活动数据刷新回调列表
    initialShareFrom: null,      // 小程序启动时的分享来源
    lastTrackedShareFrom: null   // 最近一次统计的分享来源（避免重复统计）
  }
})
