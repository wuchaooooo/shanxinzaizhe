// app.js
const { DATA_SOURCE_CONFIG } = require('./utils/data-source-config.js')
const { loadAllProfilesText, downloadAllProfileImages } = require('./utils/profile-loader.js')
const { fetchAssets, getAssetsFromCache } = require('./utils/assets-loader.js')
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

      // 加载活动缓存
      const cachedEvents = getEventsFromCache()
      if (cachedEvents.length > 0) {
        this.globalData.eventsData = cachedEvents
      }

      // 三个任务并行启动，互不阻塞，各自内部有锁防止重复执行
      this.preloadFeishuAssets()
      this.preloadFeishuData()
      this.preloadFeishuEvents()
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
        // 清除活动图片缓存(临时文件已被清除)
        wx.removeStorageSync('events_cache_v1')
        // 清除团队图片缓存
        wx.removeStorageSync('partners_cache_v1')
        // 标记需要强制重新下载所有图片
        this.globalData.forceRedownloadImages = true
      }
    } catch (e) {
      console.error('[App] 检查更新标记失败:', e)
    }
  },

  // 预加载飞书数据（从新表加载：文本数据先返回，图片后台下载）
  async preloadFeishuData() {
    if (this._fetchingFeishuData) return
    this._fetchingFeishuData = true
    try {
      // 加载文本数据（包含 changedIds 和 changedImageIds）
      const { profiles, changedIds, changedImageIds } = await loadAllProfilesText()

      // 保留现有的图片路径（如果有的话）
      const existingData = this.globalData.partnersData || []
      if (existingData.length > 0) {
        const existingWithImages = existingData.filter(p => p.image).length
        console.log(`[App] preloadFeishuData: 现有数据 ${existingData.length} 条，其中 ${existingWithImages} 条有图片`)

        let preservedCount = 0
        profiles.forEach(profile => {
          const existing = existingData.find(p => p.employeeId === profile.employeeId)
          if (existing) {
            // 保留现有的图片路径（只要不是空字符串）
            if (existing.image) {
              profile.image = existing.image
              preservedCount++
            }
            if (existing.qrcode) {
              profile.qrcode = existing.qrcode
            }
            if (existing.loaded) {
              profile.loaded = existing.loaded
            }
          }
        })
        console.log(`[App] preloadFeishuData: 保留了 ${preservedCount} 条图片路径`)
      }

      // 始终更新引用，保证图片路径的修改能同步到 globalData
      const finalWithImages = profiles.filter(p => p.image).length
      console.log(`[App] preloadFeishuData: 最终数据 ${profiles.length} 条，其中 ${finalWithImages} 条有图片`)
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
        if (isFirstLoad) {
          console.log('[App] 首次加载，通知页面初始化')
        } else if (hasDeleted) {
          console.log(`[App] 检测到记录删除（${existingData.length} → ${profiles.length}），通知页面刷新`)
        } else {
          console.log(`[App] 检测到变化，通知页面刷新`)
        }
        this.globalData.partnersDataListeners.forEach(cb => cb(profiles))
      } else {
        console.log('[App] 数据无变化')
      }

      // 检查哪些记录需要下载图片：
      // 1. imageKey 变化的记录（changedImageIds）
      // 2. 有 imageKey 但没有图片路径的记录（首次加载或缓存丢失）
      // 注意：二维码按需下载，不在启动时下载
      const needDownload = profiles.filter(p => {
        if (changedImageIds.has(p.employeeId)) return true
        // 有 imageKey 但没有图片路径，需要下载
        if (p.imageKey && !p.image) return true
        return false
      }).sort((a, b) => {
        // 工号越大（越新入职）排越前，优先下载
        const numA = parseInt(a.employeeId, 10)
        const numB = parseInt(b.employeeId, 10)
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA
        return (b.employeeId || '').localeCompare(a.employeeId || '')
      })

      if (needDownload.length > 0) {
        console.log(`[飞书] 团队需要下载 ${needDownload.length} 张图片（图片变更${changedImageIds.size}张 + 缺失图片${needDownload.length - changedImageIds.size}张）`)

        // 等待图片下载完成
        downloadAllProfileImages(needDownload, (type, path, employeeId, name) => {
          // 更新 globalData 中对应的记录
          const profile = profiles.find(p => p.employeeId === employeeId)
          if (profile) {
            if (type === 'avatar') {
              profile.image = path
              profile.loaded = true
              // 只在头像下载完成时通知监听器（用于 team 页面更新头像）
              this.globalData.imageReadyListeners.forEach(cb => cb(type, employeeId, path))
            } else if (type === 'qrcode') {
              profile.qrcode = path
              // 二维码下载完成后，通知数据监听器更新显示
              this.globalData.partnersDataListeners.forEach(cb => cb(profiles))
            }
          }
        }, DATA_SOURCE_CONFIG.imageConcurrency || 2).then(() => {
          console.log(`[飞书] 团队图片下载完成`)
        })
      } else {
        console.log('[飞书] 团队所有图片已就绪，无需下载')
      }

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
      console.log('开始预加载静态资源...')

      const { assets } = await fetchAssets((code) => {
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

      const { events, changedIds, changedImageIds } = await fetchFeishuEventsText()

      // 保留现有的图片路径（如果有的话）
      const existingData = this.globalData.eventsData || []
      if (existingData.length > 0 && !this.globalData.forceRedownloadImages) {
        const existingWithImages = existingData.filter(e =>
          (e.imagePaths && e.imagePaths.length > 0) ||
          (e.images && e.images.length > 0) ||
          e.image
        ).length
        console.log(`[App] preloadFeishuEvents: 现有数据 ${existingData.length} 条，其中 ${existingWithImages} 条有图片`)

        let preservedCount = 0
        events.forEach(event => {
          const existing = existingData.find(e => e.id === event.id)
          if (existing) {
            // 保留现有的图片路径（兼容多种字段名）
            if (existing.imagePaths && existing.imagePaths.length > 0) {
              event.imagePaths = existing.imagePaths
              preservedCount++
            }
            if (existing.images && existing.images.length > 0) {
              event.images = existing.images
            }
            if (existing.image) {
              event.image = existing.image
            }
          }
        })
        console.log(`[App] preloadFeishuEvents: 保留了 ${preservedCount} 条图片路径`)
      } else if (this.globalData.forceRedownloadImages) {
        console.log('[App] preloadFeishuEvents: 强制重新下载所有图片（小程序刚更新）')
        // 清除所有活动的图片路径，强制重新下载
        events.forEach(event => {
          event.imagePaths = []
          event.images = []
          event.image = ''
        })
        // 重置标志
        this.globalData.forceRedownloadImages = false
      }

      // 始终更新引用，保证图片路径的修改能同步到 globalData
      const finalWithImages = events.filter(e => e.imagePaths && e.imagePaths.length > 0).length
      console.log(`[App] preloadFeishuEvents: 最终数据 ${events.length} 条，其中 ${finalWithImages} 条有图片`)
      this.globalData.eventsData = events

      // 判断是否是首次加载
      const isFirstLoad = !this.globalData.eventsDataTimestamp
      this.globalData.eventsDataTimestamp = Date.now()

      // 检查活动数量是否变化（用于检测删除）
      const countChanged = existingData.length !== events.length

      // 首次加载时，即使没有变化也要通知页面（让页面获取初始数据）
      // 后续加载时，在有变化或数量变化时通知页面刷新
      if (isFirstLoad || changedIds.size > 0 || countChanged) {
        if (isFirstLoad) {
          console.log('[App] 活动首次加载，通知页面初始化')
        } else if (countChanged) {
          console.log(`[App] 活动数量变化（${existingData.length} -> ${events.length}），通知页面刷新`)
        } else {
          console.log(`[App] 活动检测到变化，通知页面刷新`)
        }
        this.globalData.eventsDataListeners.forEach(cb => cb(events))
      } else {
        console.log('[App] 活动数据无变化')
      }

      // 检查哪些活动需要下载图片：
      // 1. imageKeys 变化的活动（changedImageIds）
      // 2. 有 imageKeys 但没有图片路径的活动（首次加载或缓存丢失）
      const needDownload = events.filter(e => {
        if (changedImageIds.has(e.id)) return true
        // 有 imageKeys 但没有图片路径，需要下载
        if (e.imageKeys && e.imageKeys.length > 0 && (!e.imagePaths || e.imagePaths.length === 0)) return true
        return false
      })

      if (needDownload.length > 0) {
        // 计算总共需要下载的图片数量
        const totalImages = needDownload.reduce((sum, e) => sum + (e.imageKeys?.length || 0), 0)
        console.log(`[飞书] 活动需要下载 ${totalImages} 张图片（图片变更${changedImageIds.size}条活动 + 缺失图片${needDownload.length - changedImageIds.size}条活动）`)

        // 等待活动图片下载完成
        downloadEventImagesBackground(needDownload, (eventId, path) => {
          // 通知监听器（用于活动页面更新图片）
          this.globalData.eventsImageReadyListeners.forEach(cb => cb(eventId, path))
        }).then(() => {
          console.log(`[飞书] 活动图片下载完成`)
        })
      } else {
        console.log('[飞书] 活动所有图片已就绪，无需下载')
      }

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
    if (!partners || partners.length === 0) return

    const matched = partners.find(p => p.wxOpenid && p.wxOpenid.trim() === openid.trim()) || null
    this.globalData.currentUser = matched
    console.log('身份识别:', matched ? `联合创始人 ${matched.name}` : '普通用户')
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
      // 从已加载的 partnersData 中查找对应的姓名
      const partnersData = this.globalData.partnersData
      if (partnersData && partnersData.length > 0) {
        const partner = partnersData.find(p => p.employeeId === shareFrom)
        if (partner) {
          shareFromName = partner.name
        }
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
    lastTrackedShareFrom: null,  // 最近一次统计的分享来源（避免重复统计）
    forceRedownloadImages: false // 强制重新下载所有图片（小程序更新后）
  }
})
