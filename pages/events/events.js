// pages/events/events.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const { animateNumbers } = require('../../utils/animate.js')

// 生成占位符数据（用于首次加载时显示骨架屏）
function generatePlaceholders(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    name: `加载中...`,
    organizer: '',
    type: '星享会',
    time: '',
    image: '',
    loaded: false,
    id: `placeholder_${i}`
  }))
}

function getInitialEvents() {
  const app = getApp()
  const cached = app.globalData.eventsData || []
  if (cached.length > 0) {
    return cached.map(event => {
      // 如果活动没有图片，直接设置为已加载
      const hasNoImages = !event.imageKeys || event.imageKeys.length === 0
      // 如果有图片且图片路径存在，也设置为已加载（从缓存恢复）
      const hasImage = event.image && event.image.length > 0

      // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
      const { loaded: _, ...eventWithoutLoaded } = event

      return {
        ...eventWithoutLoaded,
        // 没有图片或已有图片路径的活动直接显示，有图片但无路径的等待下载
        loaded: !!(hasNoImages || hasImage),  // 强制转换为布尔值
        organizerData: null
      }
    })
  }
  // 如果没有缓存数据，返回占位符
  return generatePlaceholders()
}

Page({
  data: {
    activeTab: '全部活动',
    tabs: ['全部活动', '星享会', '午餐会', '销售门诊', '销售建设', '客户活动'],
    events: getInitialEvents(),
    filteredEvents: [],
    leftColumn: [],
    rightColumn: [],
    tabScrollLeft: 0,
    scrollTop: 0,
    scrollTopCounter: 0,
    searchQuery: '',
    // 当前 tab 的统计数据
    currentTabInProgress: 0,
    currentTabUpcoming: 0,
    currentTabFinished: 0,
    loading: false,
    allImagesLoaded: false,
    isCofounder: false
  },

  checkAllImagesLoaded(events) {
    if (!events || events.length === 0) return false
    return events.every(e => e.loaded)
  },

  onLoad() {
    console.log('Events 页面加载')

    const app = getApp()
    const eventsData = app.globalData.eventsData || []

    if (eventsData.length > 0) {
      // 如果图片路径为空，尝试从缓存加载
      const { getEventsFromCache } = require('../../utils/events-data-loader.js')
      const cachedEvents = getEventsFromCache()
      const fs = wx.getFileSystemManager()

      // 合并缓存的图片路径到 eventsData，并验证文件是否存在
      eventsData.forEach(event => {
        if (!event.image || !event.images || event.images.length === 0) {
          const cached = cachedEvents.find(e => e.id === event.id)
          if (cached) {
            if (!event.image && cached.image) {
              event.image = cached.image
            }
            if ((!event.images || event.images.length === 0) && cached.images) {
              event.images = cached.images
            }
            if ((!event.imagePaths || event.imagePaths.length === 0) && cached.imagePaths) {
              event.imagePaths = cached.imagePaths
            }
          }
        }

        // 验证图片文件是否存在（参考个人二维码的下载逻辑）
        if (event.images && event.images.length > 0) {
          const validImages = []
          event.images.forEach((imagePath, index) => {
            if (imagePath) {
              try {
                fs.accessSync(imagePath)
                validImages.push(imagePath)
              } catch (e) {
                console.log(`[${event.name}] 图片 ${index + 1} 文件已失效，需要重新下载`)
              }
            }
          })

          // 更新为有效的图片列表
          if (validImages.length !== event.images.length) {
            event.images = validImages
            event.image = validImages[0] || ''
            console.log(`[${event.name}] 图片文件验证完成，有效图片数: ${validImages.length}`)
          }
        }
      })

      const events = eventsData.map(event => {
        // 如果活动没有图片，直接设置为已加载
        const hasNoImages = !event.imageKeys || event.imageKeys.length === 0
        // 如果有图片且图片路径存在，也设置为已加载（从缓存恢复）
        const hasImage = event.image && event.image.length > 0

        // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
        const { loaded: _, ...eventWithoutLoaded } = event

        return {
          ...eventWithoutLoaded,
          // 没有图片或已有图片路径的活动直接显示，有图片但无路径的等待下载
          loaded: !!(hasNoImages || hasImage),  // 强制转换为布尔值
          organizerData: this.findOrganizerData(event.organizer)
        }
      })

      this.setData({
        events,
        allImagesLoaded: this.checkAllImagesLoaded(events),
        isCofounder: !!app.globalData.currentUser
      }, () => {
        this.filterEvents()
        this.updateTabStatistics()
      })
    }

    this.registerListeners()
  },

  onUnload() {
    console.log('Events 页面卸载，清理监听器')
    this.cleanupListeners()
  },

  onShow() {
    const app = getApp()
    if (app.preloadFeishuEvents) {
      // 如果正在加载中，重置标志强制重新加载（确保删除后能刷新）
      if (app._fetchingFeishuEvents) {
        console.log('[Events] 检测到正在加载中，重置标志强制刷新')
        app._fetchingFeishuEvents = false
      }
      app.preloadFeishuEvents()
    }
  },

  // 根据组织者名称查找团队成员数据
  findOrganizerData(organizerName) {
    if (!organizerName) return null

    const app = getApp()
    const partnersData = app.globalData.partnersData

    if (!partnersData || partnersData.length === 0) {
      return null
    }

    // 根据姓名查找匹配的团队成员
    const partner = partnersData.find(p => p.name === organizerName)

    if (partner) {
      return {
        name: partner.name,
        avatar: partner.image,
        employeeId: partner.employeeId
      }
    }

    return null
  },

  // 注册监听器
  registerListeners() {
    const app = getApp()

    // 监听活动图片下载完成
    this._eventsImageReadyCb = (eventId, path) => {
      const events = this.data.events
      const idx = events.findIndex(e => e.id === eventId)
      if (idx === -1) return

      // 同时更新 globalData，确保其他页面能获取到最新数据
      const globalEvents = app.globalData.eventsData || []
      const globalIdx = globalEvents.findIndex(e => e.id === eventId)
      if (globalIdx !== -1) {
        globalEvents[globalIdx].image = path
        globalEvents[globalIdx].images = globalEvents[globalIdx].images || []
        if (globalEvents[globalIdx].images.length === 0) {
          globalEvents[globalIdx].images = [path]
        }
        app.globalData.eventsData = globalEvents
      }

      // 更新图片路径
      const updates = {}
      // 如果图片路径已经相同，不需要更新（避免闪烁）
      if (events[idx].image === path) return
      updates[`events[${idx}].image`] = path

      // 第一张图片下载完成，立即设置 loaded: true
      updates[`events[${idx}].loaded`] = true

      this.setData(updates, () => {
        this.setData({ allImagesLoaded: this.checkAllImagesLoaded(this.data.events) })
        // 图片加载完成后重新过滤，显示新加载的活动
        this.filterEvents()
      })
    }
    if (!app.globalData.eventsImageReadyListeners) {
      app.globalData.eventsImageReadyListeners = []
    }
    app.globalData.eventsImageReadyListeners.push(this._eventsImageReadyCb)

    // 监听活动文本数据刷新
    this._eventsDataCb = (eventsData) => {
      console.log('[Events] 收到活动数据刷新通知:', eventsData.length)

      // 保存当前的 events
      const currentEvents = this.data.events || []

      // 检查是否需要完全重建列表（活动数量变化、顺序变化等）
      const needRebuild =
        eventsData.length !== currentEvents.length ||
        eventsData.some((e, i) => {
          const curr = currentEvents[i]
          return !curr || e.id !== curr.id
        })

      if (needRebuild) {
        // 需要重建列表：保留已下载的图片和 loaded 状态
        console.log('[Events] 重建列表')
        const imageMap = {}
        const loadedMap = {}
        currentEvents.forEach(e => {
          if (e.id) {
            if (e.image) imageMap[e.id] = e.image
            if (e.loaded) loadedMap[e.id] = true
          }
        })

        const events = eventsData.map(event => {
          const existingImage = imageMap[event.id]
          const finalImage = existingImage || event.image
          const wasLoaded = loadedMap[event.id]

          // 如果活动没有图片，直接设置为已加载
          const hasNoImages = !event.imageKeys || event.imageKeys.length === 0
          // 如果有图片且图片路径存在，也设置为已加载
          const hasImage = finalImage && finalImage.length > 0

          // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
          const { loaded: _, ...eventWithoutLoaded } = event

          return {
            ...eventWithoutLoaded,
            image: finalImage,
            // 保持之前的加载状态，或者根据图片情况判断
            loaded: !!(wasLoaded || hasNoImages || hasImage),  // 强制转换为布尔值
            organizerData: this.findOrganizerData(event.organizer)
          }
        })

        this.setData({
          events,
          allImagesLoaded: this.checkAllImagesLoaded(events)
        }, () => {
          this.filterEvents()
          this.updateTabStatistics()
        })
      } else {
        // 不需要重建列表：更新文字数据，保留图片和 loaded 状态
        // 监听器只在 lastModified 变化时才被调用，无需再做字段级比对
        const updates = {}
        eventsData.forEach((event, i) => {
          const curr = currentEvents[i]
          if (!curr) return
          updates[`events[${i}]`] = {
            ...event,
            image: curr.image,
            loaded: curr.loaded,
            organizerData: this.findOrganizerData(event.organizer)
          }
        })
        console.log('[Events] 更新文字数据')
        this.setData(updates, () => {
          this.filterEvents()
          this.updateTabStatistics()
        })
      }
    }
    if (!app.globalData.eventsDataListeners) {
      app.globalData.eventsDataListeners = []
    }
    app.globalData.eventsDataListeners.push(this._eventsDataCb)

    // 监听团队数据加载完成（用于更新组织者头像）
    this._partnersDataCb = () => {
      console.log('[Events] 收到团队数据加载完成通知，更新组织者信息')
      // 只更新组织者数据
      const events = this.data.events.map(event => ({
        ...event,
        organizerData: this.findOrganizerData(event.organizer)
      }))
      this.setData({ events })
    }
    if (!app.globalData.partnersDataListeners) {
      app.globalData.partnersDataListeners = []
    }
    app.globalData.partnersDataListeners.push(this._partnersDataCb)

    // 监听团队成员头像下载完成（用于更新组织者头像）
    this._imageReadyCb = (type, name, path) => {
      if (type !== 'avatar') return

      console.log(`[Events] 收到团队成员头像下载完成通知: ${name}`)

      // 只更新与该组织者相关的活动
      const events = this.data.events
      if (!events || events.length === 0) return

      // 检查是否有活动的组织者是这个人
      let needUpdate = false
      const updates = {}
      events.forEach((event, i) => {
        if (event.organizer === name) {
          needUpdate = true
          // 重新查找组织者数据（包含新的头像）
          updates[`events[${i}].organizerData`] = this.findOrganizerData(event.organizer)
        }
      })

      // 只有当确实有活动需要更新时才调用 setData
      if (needUpdate) {
        this.setData(updates)
      }
    }
    if (!app.globalData.imageReadyListeners) {
      app.globalData.imageReadyListeners = []
    }
    app.globalData.imageReadyListeners.push(this._imageReadyCb)

    // 监听身份识别回调，更新创建按钮显示
    this._currentUserCb = (user) => {
      this.setData({ isCofounder: !!user })
    }
    if (!app.globalData.currentUserListeners) {
      app.globalData.currentUserListeners = []
    }
    app.globalData.currentUserListeners.push(this._currentUserCb)

    // 立即应用已有结果（如果身份识别已完成）
    if (app.globalData.openid && app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      const currentUser = app.globalData.currentUser
      this.setData({ isCofounder: !!(currentUser && currentUser.employeeId) })
    }
  },

  // 清理监听器
  cleanupListeners() {
    const app = getApp()

    const listeners = [
      { list: 'eventsImageReadyListeners', cb: '_eventsImageReadyCb' },
      { list: 'eventsDataListeners', cb: '_eventsDataCb' },
      { list: 'partnersDataListeners', cb: '_partnersDataCb' },
      { list: 'imageReadyListeners', cb: '_imageReadyCb' },
      { list: 'currentUserListeners', cb: '_currentUserCb' }
    ]

    listeners.forEach(({ list, cb }) => {
      if (this[cb]) {
        app.globalData[list] = app.globalData[list].filter(callback => callback !== this[cb])
        this[cb] = null
      }
    })
  },

  // 搜索输入
  onSearchInput(e) {
    const query = e.detail.value
    this.setData({
      searchQuery: query
    }, () => {
      this.filterEvents()
    })
  },

  // 标签页切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    const index = this.data.tabs.indexOf(tab)
    this.setData({
      activeTab: tab
    }, () => {
      this.filterEvents()
      this.updateTabStatistics()
      // 滚动 tab 到可见位置
      this.scrollTabIntoView(index)
      // 延迟滚动到顶部，让用户先看到 tab 切换
      setTimeout(() => {
        this.scrollToTop()
      }, 100)
    })
  },

  // 滚动到顶部
  scrollToTop() {
    // 使用计数器确保每次都触发 scroll-top 更新
    const counter = this.data.scrollTopCounter + 1
    this.setData({
      scrollTopCounter: counter,
      scrollTop: counter % 2 === 0 ? 0 : 0.1
    })
  },

  // 滚动标签栏，确保指定的 tab 居中显示
  scrollTabIntoView(index) {
    const query = wx.createSelectorQuery().in(this)
    query.select('.tabs-container').boundingClientRect()
    query.selectAll('.tab-item').boundingClientRect()
    query.exec((res) => {
      if (!res || !res[0] || !res[1] || !res[1][index]) return

      const container = res[0]
      const tabs = res[1]
      const targetTab = tabs[index]

      // 计算 tab 中心点和容器中心点
      const tabCenter = targetTab.left + targetTab.width / 2
      const containerCenter = container.left + container.width / 2

      // 计算需要滚动的距离，让 tab 居中
      const scrollLeft = this.data.tabScrollLeft + (tabCenter - containerCenter)

      this.setData({
        tabScrollLeft: Math.max(0, scrollLeft)
      })
    })
  },

  // 过滤活动
  filterEvents() {
    const { events, searchQuery, activeTab } = this.data
    let filtered = events

    // 只显示已加载完成的活动（loaded: true）
    // 活动的第一张图片和文字都加载好才展示，但组织者头像可以异步加载
    filtered = filtered.filter(e => e.loaded === true)

    // 按类型过滤
    if (activeTab === '星享会') {
      filtered = filtered.filter(e => e.type === '星享会')
    } else if (activeTab === '午餐会') {
      filtered = filtered.filter(e => e.type === '午餐会')
    } else if (activeTab === '销售门诊') {
      filtered = filtered.filter(e => e.type === '销售门诊')
    } else if (activeTab === '销售建设') {
      filtered = filtered.filter(e => e.type === '销售建设')
    } else if (activeTab === '客户活动') {
      filtered = filtered.filter(e => e.type === '看电影' || e.type === '徒步活动' || e.type === '其他活动' || e.type === '客户活动')
    }

    // 按搜索关键词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(e => {
        const name = (e.name || '').toLowerCase()
        const organizer = (e.organizer || '').toLowerCase()
        return name.includes(query) || organizer.includes(query)
      })
    }

    // 按开始时间排序：最新的在前，最早的在后
    filtered.sort((a, b) => {
      const timeA = new Date(a.time || 0).getTime()
      const timeB = new Date(b.time || 0).getTime()
      return timeB - timeA // 降序：最新的在前
    })

    // 简单的左右交替布局，直接渲染
    const leftColumn = []
    const rightColumn = []

    filtered.forEach((event, index) => {
      if (index % 2 === 0) {
        leftColumn.push(event)
      } else {
        rightColumn.push(event)
      }
    })

    this.setData({
      filteredEvents: filtered,
      leftColumn,
      rightColumn
    })
  },

  // 更新当前 tab 的统计数据
  updateTabStatistics() {
    const { events, activeTab } = this.data
    let filtered = events

    // 按类型过滤
    if (activeTab === '星享会') {
      filtered = events.filter(e => e.type === '星享会')
    } else if (activeTab === '午餐会') {
      filtered = events.filter(e => e.type === '午餐会')
    } else if (activeTab === '销售门诊') {
      filtered = events.filter(e => e.type === '销售门诊')
    } else if (activeTab === '销售建设') {
      filtered = events.filter(e => e.type === '销售建设')
    } else if (activeTab === '客户活动') {
      filtered = events.filter(e => e.type === '看电影' || e.type === '徒步活动' || e.type === '其他活动' || e.type === '客户活动')
    }
    // '全部活动' 不需要过滤

    // 计算统计数据
    const inProgress = filtered.filter(e => e.status === '进行中').length
    const upcoming = filtered.filter(e => e.status === '即将开始').length
    const finished = filtered.filter(e => e.status === '已结束').length

    // 使用数字滚动动画
    animateNumbers(this, {
      currentTabInProgress: { to: inProgress },
      currentTabUpcoming: { to: upcoming },
      currentTabFinished: { to: finished }
    })
  },

  // 点击活动卡片
  onEventTap(e) {
    const eventId = e.currentTarget.dataset.id
    const eventType = e.currentTarget.dataset.type
    wx.navigateTo({
      url: `/pages/event-detail/event-detail?eventId=${eventId}&type=${eventType}`
    })
  },

  // 创建活动
  onCreateEvent() {
    const { activeTab } = this.data
    // 将当前选中的 tab 作为默认类型传递给编辑页面
    let defaultType = '星享会'
    if (activeTab !== '全部活动' && activeTab !== '客户活动') {
      defaultType = activeTab
    } else if (activeTab === '客户活动') {
      defaultType = '客户活动'
    }

    const url = `/pages/event-edit/event-edit?defaultType=${encodeURIComponent(defaultType)}`
    wx.navigateTo({ url })
  },

  // 下拉刷新
  onPullDownRefresh() {
    console.log('下拉刷新活动数据')
    const app = getApp()
    if (app.preloadFeishuEvents) {
      app.preloadFeishuEvents().then(() => {
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // 图片加载成功
  onImageLoad(e) {
    const eventId = e.currentTarget.dataset.id
    const events = this.data.events
    const idx = events.findIndex(e => e.id === eventId)
    if (idx === -1) return

    // 图片加载成功，设置 loaded: true
    const updates = {
      [`events[${idx}].loaded`]: true
    }

    this.setData(updates, () => {
      this.setData({ allImagesLoaded: this.checkAllImagesLoaded(this.data.events) })
      // 图片加载完成后重新过滤，显示新加载的活动
      this.filterEvents()
    })
  },

  // 图片加载失败
  onImageError(e) {
    const eventId = e.currentTarget.dataset.id
    console.log('活动图片加载失败:', eventId)

    const app = getApp()
    const events = this.data.events
    const idx = events.findIndex(e => e.id === eventId)

    if (idx !== -1) {
      // 清除失效的图片路径，保持骨架图状态，等待重试
      const updates = {
        [`events[${idx}].image`]: '',
        [`events[${idx}].loaded`]: false
      }
      this.setData(updates)

      // 同步更新 globalData
      const globalEvents = app.globalData.eventsData || []
      const globalIdx = globalEvents.findIndex(e => e.id === eventId)
      if (globalIdx !== -1) {
        globalEvents[globalIdx].image = ''
        globalEvents[globalIdx].loaded = false

        // 触发 app.js 重新检查并下载缺失的图片
        setTimeout(() => {
          app.preloadFeishuEvents()
        }, 100)
      }
    }
  },

  // 分享功能
  onShareAppMessage() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const shareFrom = currentUser ? currentUser.employeeId : (app.globalData.initialShareFrom || 'guest')

    return {
      title: '善心浙里活动 - 精彩活动等你来',
      path: `/pages/events/events?shareFrom=${shareFrom}`,
      imageUrl: ''
    }
  }
})
