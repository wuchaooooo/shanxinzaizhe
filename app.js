// app.js
const { DATA_SOURCE_CONFIG } = require('./utils/data-source-config.js')
const { fetchFeishuPartnersText, downloadImagesBackground, getPartnersFromCache } = require('./utils/partners-data-loader.js')
const { fetchFeishuAssets, getAssetsFromCache } = require('./utils/assets-loader.js')

App({
  async onLaunch() {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'shanxinzaizhe-1g0sxfo695003783',
      traceUser: true
    })

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
    if (!partners || partners.length === 0) return
    const matched = partners.find(p => p.wxOpenid && p.wxOpenid.trim() === openid.trim()) || null
    this.globalData.currentUser = matched
    console.log('身份识别结果:', matched ? `联合创始人 ${matched.name}` : '普通用户')
    this.globalData.currentUserListeners.forEach(cb => cb(matched))
  },

  async onShow() {
    // 每次显示时重新拉取飞书数据，优先加载静态资源
    if (DATA_SOURCE_CONFIG.source === 'feishu') {
      await this.preloadFeishuAssets()
      await this.preloadFeishuData()
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
    assetsDataListeners: []      // 静态资源刷新回调列表
  }
})
