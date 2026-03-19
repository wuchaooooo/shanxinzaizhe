// app.js
const { DATA_SOURCE_CONFIG } = require('./utils/data-source-config.js')
const { loadAllProfilesText } = require('./utils/profile-loader.js')
const { fetchAssets } = require('./utils/assets-loader.js')
const { fetchFeishuEventsText, getEventsFromCache } = require('./utils/events-data-loader.js')
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
    }

    // 获取 openid 并与飞书联合创始人数据比对身份（尽早发起网络请求）
    // 身份识别完成后统一上报浏览记录（会话级，每次启动上报一次）
    this.fetchOpenidAndMatchUser(shareParams.shareFrom || null)

    // 如果使用飞书数据源，先从本地缓存恢复数据（立即可用），再异步拉取最新
    if (DATA_SOURCE_CONFIG.source === 'feishu') {
      // 加载活动缓存
      const cachedEvents = getEventsFromCache()
      if (cachedEvents.length > 0) {
        this.globalData.eventsData = cachedEvents
      }

      // 三个任务并行启动，互不阻塞，各自内部有锁防止重复执行
      this.preloadFeishuAssets()
      this.preloadFeishuTeam()
      this.preloadFeishuEvents()
    }

    // 小程序启动时执行
    console.log('AIA Excellence 小程序启动')

    // 获取系统信息
    this.globalData.systemInfo = wx.getWindowInfo()

    // 检查更新
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()
      updateManager.onUpdateReady(() => {
        // 标记即将更新,下次启动时清除缓存
        wx.setStorageSync('app_will_update', true)

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

    // 检查是否刚更新完成,如果是则清除图片缓存
    try {
      const willUpdate = wx.getStorageSync('app_will_update')
      if (willUpdate) {
        console.log('[App] 检测到小程序刚更新,清除图片缓存')
        // 清除更新标记
        wx.removeStorageSync('app_will_update')
        // 清除活动文本缓存
        wx.removeStorageSync('events_cache_v1')
        // 清除团队文本缓存
        wx.removeStorageSync('partners_cache_v1')
      }
    } catch (e) {
      console.error('[App] 检查更新标记失败:', e)
    }
  },

  // 预加载飞书数据（从新表加载：文本数据先返回，图片后台下载）
  async preloadFeishuTeam() {
    if (this._fetchingFeishuData) return
    this._fetchingFeishuData = true
    try {
      // 加载文本数据（包含 changedIds 和 changedImageIds）
      const { profiles, changedIds } = await loadAllProfilesText()

      // 保留现有的图片路径（如果有的话）
      const existingData = this.globalData.partnersData || []
      if (existingData.length > 0) {
        profiles.forEach(profile => {
          const existing = existingData.find(p => p.employeeId === profile.employeeId)
          if (existing) {
            if (existing.image) profile.image = existing.image
            if (existing.qrcode) profile.qrcode = existing.qrcode
            if (existing.loaded) profile.loaded = existing.loaded
          }
        })
      }
      this.globalData.partnersData = profiles

      // 飞书数据更新后，若已有 openid，重新比对身份
      if (this.globalData.openid) {
        this._matchCurrentUser(this.globalData.openid)
      }

      // 判断是否是首次加载（globalData 中还没有 partnersDataTimestamp）
      const isFirstLoad = !this.globalData.partnersDataTimestamp
      this.globalData.partnersDataTimestamp = Date.now()

      // 检测是否有记录被删除（记录数量减少）
      const hasDeleted = existingData.length > 0 && profiles.length < existingData.length

      // 首次加载时，即使没有变化也要通知页面（让页面获取初始数据）
      // 后续加载时，只在有变化时通知页面刷新（避免不必要的重新渲染）
      // 变化包括：记录修改、新增、删除
      if (isFirstLoad || changedIds.size > 0 || hasDeleted) {
        this.globalData.partnersDataListeners.forEach(cb => cb(profiles))
      }

      // 头像已通过 CDN URL 直接内嵌在 profile.image，无需下载

    } catch (error) {
      console.error('预加载飞书数据失败:', error)
    } finally {
      this._fetchingFeishuData = false
    }
  },

  // 预加载静态资源（根据配置从飞书或腾讯云加载）
  async preloadFeishuAssets() {
    if (this._fetchingFeishuAssets) return
    this._fetchingFeishuAssets = true
    try {
      const { assets } = await fetchAssets()

      // 更新全局数据并通知页面
      this.globalData.assetsData = assets
      this.globalData.assetsDataListeners.forEach(cb => cb(assets))
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
      const { events, changedIds } = await fetchFeishuEventsText()

      const existingData = this.globalData.eventsData || []
      this.globalData.eventsData = events

      // 判断是否是首次加载
      const isFirstLoad = !this.globalData.eventsDataTimestamp
      this.globalData.eventsDataTimestamp = Date.now()

      // 检查活动数量是否变化（用于检测删除）
      const countChanged = existingData.length !== events.length

      if (isFirstLoad || changedIds.size > 0 || countChanged) {
        this.globalData.eventsDataListeners.forEach(cb => cb(events))
      }

    } catch (error) {
      console.error('预加载飞书活动数据失败:', error)
    } finally {
      this._fetchingFeishuEvents = false
    }
  },

  // 获取当前登录用户的 openid，并与飞书联合创始人数据比对身份
  // shareFrom: 本次启动的分享来源工号（无则为 null）
  fetchOpenidAndMatchUser(shareFrom) {
    wx.cloud.callFunction({
      name: 'getOpenid',
      success: (r) => {
        const openid = r.result && r.result.openid
        if (!openid) return
        this.globalData.openid = openid
        this._matchCurrentUser(openid, shareFrom)
      },
      fail: (err) => {
        console.error('获取 openid 失败:', err)
      }
    })
  },

  // 根据 openid 查找对应的联合创始人记录，识别完成后上报浏览记录
  _matchCurrentUser(openid, shareFrom) {
    const partners = this.globalData.partnersData
    if (!partners || partners.length === 0) return

    const matched = partners.find(p => p.wxOpenid && p.wxOpenid.trim() === openid.trim()) || null
    this.globalData.currentUser = matched
    this.globalData.currentUserResolved = true
    console.log('身份识别:', matched ? `联合创始人 ${matched.name}` : '普通用户')
    // 始终通知 listeners，即使是 null（普通用户）
    this.globalData.currentUserListeners.forEach(cb => cb(matched))

    // 身份识别完成后，上报本次会话浏览记录
    this._trackVisit(shareFrom)
  },

  onShow(options) {
    // 解析分享来源参数（从后台切换回来时）
    if (options) {
      const shareParams = this.parseShareParams(options)
      if (shareParams.shareFrom && shareParams.shareFrom !== this.globalData.lastTrackedShareFrom) {
        this.globalData.initialShareFrom = shareParams.shareFrom
        console.log('分享来源（onShow）:', shareParams.shareFrom)
        // 新的分享来源，重置标记后上报
        this._visitTracked = false
        this._trackVisit(shareParams.shareFrom)
      }
    }

    // 每次显示时重新拉取飞书数据，三个任务并发执行
    if (DATA_SOURCE_CONFIG.source === 'feishu') {
      this.preloadFeishuAssets()
      this.preloadFeishuTeam()
      this.preloadFeishuEvents()
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

  // 上报本次会话浏览记录（每次启动只调用一次）
  async _trackVisit(shareFrom) {
    // 防止重复上报
    if (this._visitTracked) return
    this._visitTracked = true

    let visitorEmployeeId = ''
    let visitorName = '普通用户'

    if (shareFrom && shareFrom !== 'guest') {
      // 通过分享链接进入：上报分享者
      const partner = (this.globalData.partnersData || []).find(p => p.employeeId === shareFrom)
      visitorEmployeeId = shareFrom
      visitorName = partner ? partner.name : '普通用户'
      console.log(`浏览上报：分享来源 ${visitorName}(${visitorEmployeeId})`)
    } else if (this.globalData.currentUser) {
      // 直接打开且是联合创始人：上报自己
      visitorEmployeeId = this.globalData.currentUser.employeeId || ''
      visitorName = this.globalData.currentUser.name || '联合创始人'
      console.log(`浏览上报：联合创始人 ${visitorName}(${visitorEmployeeId})`)
    } else {
      // 普通用户
      console.log('浏览上报：普通用户')
    }

    try {
      const result = await updateShareTracking(visitorEmployeeId, visitorName)
      console.log('浏览上报成功:', result)
    } catch (error) {
      console.error('浏览上报失败:', error)
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
    currentUserResolved: false,  // 身份识别是否已完成
    currentUserListeners: [],    // 身份识别完成回调列表
    partnersData: null,          // 飞书数据缓存
    partnersDataTimestamp: null, // 团队数据加载时间戳
    imageReadyListeners: [],     // 头像下载完成回调列表，team/profile 页面注册
    partnersDataListeners: [],   // 文本数据刷新回调列表，home/team 页面注册
    assetsData: {},              // 静态资源缓存
    assetsDataListeners: [],     // 静态资源刷新回调列表
    eventsData: null,            // 活动数据缓存
    eventsDataTimestamp: null,   // 活动数据加载时间戳
    eventsImageReadyListeners: [], // 活动图片下载完成回调列表
    eventsDataListeners: [],     // 活动数据刷新回调列表
    initialShareFrom: null,      // 小程序启动时的分享来源
    lastTrackedShareFrom: null   // 最近一次统计的分享来源（避免重复统计）
  }
})
