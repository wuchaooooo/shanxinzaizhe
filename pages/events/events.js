// pages/events/events.js
const { animateNumbers } = require('../../utils/animate.js')
const { runSplashIfNeeded } = require('../../utils/splash.js')

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
      // 如果有图片且图片路径存在，标记为已加载
      const hasImage = event.image && event.image.length > 0

      // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
      const { loaded: _, ...eventWithoutLoaded } = event

      return {
        ...eventWithoutLoaded,
        loaded: true,
        imageLoaded: hasImage,
        animated: hasImage,  // 有图片立即触发动画，否则等 onImageLoadComplete
        organizerData: null
      }
    })
  }
  // 如果没有缓存数据，返回占位符
  return generatePlaceholders()
}

Page({
  data: {
    // 开屏动画
    showSplash: false,
    splashLogoUrl: '',
    splashLogoVisible: false,
    splashHeartbeat: false,
    splashMeltOut: false,
    splashNavBarHeight: 0,
    activeTab: '全部活动',
    tabs: ['全部活动', '星享会', '午餐会', '销售门诊', '销售建设', '客户活动'],
    events: getInitialEvents(),
    filteredEvents: [],
    pageSize: 6,       // 每页显示数量
    displayCount: 6,   // 当前已显示数量
    hasMore: false,    // 是否还有更多
    leftColumn: [],
    rightColumn: [],
    tabScrollLeft: 0,
    searchQuery: '',
    isSearching: false,
    // 当前 tab 的统计数据
    currentTabInProgress: 0,
    currentTabUpcoming: 0,
    currentTabFinished: 0,
    loading: false,
    allImagesLoaded: false,
    isCofounder: false,
    aiaFooterUrl: '' // AIA footer 图片
  },

  checkAllImagesLoaded(events) {
    if (!events || events.length === 0) return false
    return events.every(e => e.loaded)
  },

  onLoad() {
    // 开屏动画（全局只播一次）
    runSplashIfNeeded(this)

    // 加载 AIA footer（代码：aia_footer）
    const { getAssetPath } = require('../../utils/assets-loader.js')
    const aiaFooterPath = getAssetPath('aia_footer')
    if (aiaFooterPath) {
      this.setData({ aiaFooterUrl: aiaFooterPath })
    }

    const app = getApp()

    // 注册静态资源下载完成回调
    this._assetsDataCb = (assets) => {
      if (assets && assets['aia_footer']) {
        const path = typeof assets['aia_footer'] === 'string' ? assets['aia_footer'] : assets['aia_footer'].path
        this.setData({ aiaFooterUrl: path })
      }
    }
    app.globalData.assetsDataListeners.push(this._assetsDataCb)

    const eventsData = app.globalData.eventsData || []

    if (eventsData.length > 0) {
      // 如果图片路径为空，尝试从缓存加载
      const { getEventsFromCache } = require('../../utils/events-data-loader.js')
      const cachedEvents = getEventsFromCache()

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

      })

      const events = eventsData.map(event => {
        // 如果活动没有图片，直接设置为已加载
        // 如果有图片且图片路径存在，标记为已加载
        const hasImage = event.image && event.image.length > 0

        // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
        const { loaded: _, ...eventWithoutLoaded } = event

        return {
          ...eventWithoutLoaded,
          loaded: true,
          imageLoaded: hasImage,
          animated: hasImage,  // 有图片立即触发动画
          organizerData: this.findOrganizerData(event.organizer)
        }
      })

      this.setData({
        events,
        allImagesLoaded: this.checkAllImagesLoaded(events),
        isCofounder: !!(app.globalData.currentUser && app.globalData.currentUser.employeeId)
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
    // 同步自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 'pages/events/events', hidden: false })
    }

    // 检查监听器是否已注册，如果没有则重新注册
    if (!this._eventsDataCb) {
      console.log('[Events] onShow: 监听器未注册，重新注册')
      this.registerListeners()
    }

    if (app.preloadFeishuEvents) {
      // 如果正在加载中，重置标志强制重新加载（确保删除后能刷新）
      if (app._fetchingFeishuEvents) {
        console.log('[Events] 检测到正在加载中，重置标志强制刷新')
        app._fetchingFeishuEvents = false
      }
      // 设置标志：如果数据更新导致列表重建，启用动画
      this._shouldAnimateOnDataUpdate = true
      app.preloadFeishuEvents()
    }

    // 检查 partnersData 是否已加载，如果已加载则更新组织者信息
    if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      const events = this.data.events
      if (events && events.length > 0) {
        const needUpdate = events.some(e => e.organizer && !e.organizerData)
        if (needUpdate) {
          const updatedEvents = events.map(event => ({
            ...event,
            organizerData: this.findOrganizerData(event.organizer)
          }))
          const updatedLeft = this.data.leftColumn.map(event => ({
            ...event,
            organizerData: this.findOrganizerData(event.organizer)
          }))
          const updatedRight = this.data.rightColumn.map(event => ({
            ...event,
            organizerData: this.findOrganizerData(event.organizer)
          }))
          this.setData({ events: updatedEvents, leftColumn: updatedLeft, rightColumn: updatedRight })
        }
      }
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
      console.log(`[Events ImageReady] ========== 收到图片下载回调 ==========`)
      console.log(`[Events ImageReady] 时间戳: ${new Date().toISOString()}`)
      console.log(`[Events ImageReady] eventId: ${eventId}`)
      console.log(`[Events ImageReady] path: ${path}`)

      const events = this.data.events
      const idx = events.findIndex(e => e.id === eventId)
      if (idx === -1) {
        console.log(`[Events ImageReady] 未找到活动: ${eventId}`)
        return
      }

      const event = events[idx]
      console.log(`[Events ImageReady] ${event.name} 当前状态:`, {
        currentImage: event.image ? '有' : '无',
        currentLoaded: event.loaded,
        newPath: path
      })

      // 如果图片路径已经相同，不需要更新（避免闪烁）
      if (events[idx].image === path) {
        console.log(`[Events ImageReady] ${event.name} 图片路径相同，跳过`)
        return
      }

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
        console.log(`[Events ImageReady] 已更新 globalData`)
      }

      // 构建更新对象：同时更新 events、leftColumn、rightColumn
      const updates = {}
      updates[`events[${idx}].image`] = path
      updates[`events[${idx}].loaded`] = true
      updates[`events[${idx}].imageLoaded`] = true

      // 查找活动在 leftColumn 或 rightColumn 中的位置
      console.log(`[Events ImageReady] 开始查找活动在列表中的位置`)
      console.log(`[Events ImageReady] leftColumn 长度: ${this.data.leftColumn.length}`)
      console.log(`[Events ImageReady] rightColumn 长度: ${this.data.rightColumn.length}`)
      console.log(`[Events ImageReady] leftColumn IDs:`, this.data.leftColumn.map(e => e.id))
      console.log(`[Events ImageReady] rightColumn IDs:`, this.data.rightColumn.map(e => e.id))

      const leftIdx = this.data.leftColumn.findIndex(e => e.id === eventId)
      const rightIdx = this.data.rightColumn.findIndex(e => e.id === eventId)

      console.log(`[Events ImageReady] leftIdx: ${leftIdx}, rightIdx: ${rightIdx}`)

      // 判断活动是否已经在列表中
      const isInList = leftIdx !== -1 || rightIdx !== -1

      if (leftIdx !== -1) {
        updates[`leftColumn[${leftIdx}].image`] = path
        updates[`leftColumn[${leftIdx}].imageLoaded`] = true
        console.log(`[Events ImageReady] 找到活动在 leftColumn[${leftIdx}]，同步更新图片`)
        console.log(`[Events ImageReady] leftColumn[${leftIdx}] 当前 image:`, this.data.leftColumn[leftIdx].image)
      }

      if (rightIdx !== -1) {
        updates[`rightColumn[${rightIdx}].image`] = path
        updates[`rightColumn[${rightIdx}].imageLoaded`] = true
        console.log(`[Events ImageReady] 找到活动在 rightColumn[${rightIdx}]，同步更新图片`)
        console.log(`[Events ImageReady] rightColumn[${rightIdx}] 当前 image:`, this.data.rightColumn[rightIdx].image)
      }

      if (!isInList) {
        console.log(`[Events ImageReady] ⚠️ 活动不在 leftColumn 或 rightColumn 中！`)
      }

      console.log(`[Events ImageReady] ${event.name} 更新图片到所有位置`)
      console.log(`[Events ImageReady] 待更新内容:`, updates)

      // 单次 setData 更新所有数据
      this.setData(updates, () => {
        console.log(`[Events ImageReady] setData 完成`)
        // 验证更新后的状态
        const updatedEvent = this.data.events[idx]
        console.log(`[Events ImageReady] 更新后的 ${event.name} 状态:`, {
          image: updatedEvent.image ? updatedEvent.image.substring(0, 50) + '...' : '无',
          loaded: updatedEvent.loaded
        })

        // 验证 leftColumn 和 rightColumn 的更新
        if (leftIdx !== -1) {
          const updatedLeft = this.data.leftColumn[leftIdx]
          console.log(`[Events ImageReady] 验证 leftColumn[${leftIdx}]:`, {
            id: updatedLeft.id,
            name: updatedLeft.name,
            image: updatedLeft.image ? updatedLeft.image.substring(0, 50) + '...' : '无',
            imageLoaded: updatedLeft.imageLoaded
          })
        }

        if (rightIdx !== -1) {
          const updatedRight = this.data.rightColumn[rightIdx]
          console.log(`[Events ImageReady] 验证 rightColumn[${rightIdx}]:`, {
            id: updatedRight.id,
            name: updatedRight.name,
            image: updatedRight.image ? updatedRight.image.substring(0, 50) + '...' : '无',
            imageLoaded: updatedRight.imageLoaded
          })
        }

        // 如果活动不在列表中，需要调用 filterEvents() 重新构建列表
        if (!isInList) {
          console.log(`[Events ImageReady] 活动不在列表中，调用 filterEvents() 重新构建`)
          this.filterEvents()
        }

        // 更新 allImagesLoaded 状态
        this.setData({
          allImagesLoaded: this.checkAllImagesLoaded(this.data.events)
        })
      })
    }
    if (!app.globalData.eventsImageReadyListeners) {
      app.globalData.eventsImageReadyListeners = []
    }
    app.globalData.eventsImageReadyListeners.push(this._eventsImageReadyCb)

    // 监听活动文本数据刷新
    this._eventsDataCb = (eventsData) => {
      console.log('[Events] 收到活动数据刷新通知:', eventsData.length)
      console.log('[Events] 刷新时间戳:', new Date().toISOString())

      // 保存当前的 events
      const currentEvents = this.data.events || []
      console.log('[Events] 当前页面活动数量:', currentEvents.length)

      // 检查是否需要完全重建列表（活动数量变化、顺序变化等）
      const needRebuild =
        eventsData.length !== currentEvents.length ||
        eventsData.some((e, i) => {
          const curr = currentEvents[i]
          return !curr || e.id !== curr.id
        })

      console.log('[Events] 是否需要重建列表:', needRebuild)

      if (needRebuild) {
        // 需要重建列表：保留已下载的图片和 loaded 状态
        console.log('[Events] 重建列表，活动数量:', eventsData.length)
        const imageMap = {}
        const loadedMap = {}
        const animatedMap = {}
        currentEvents.forEach(e => {
          if (e.id) {
            if (e.image) {
              imageMap[e.id] = e.image
              console.log(`[Events] 保存图片映射: ${e.name} (${e.id}) -> ${e.image.substring(0, 50)}...`)
            }
            if (e.loaded) {
              loadedMap[e.id] = true
              console.log(`[Events] 保存 loaded 状态: ${e.name} (${e.id}) -> true`)
            }
            if (e.animated) animatedMap[e.id] = true
          }
        })
        console.log('[Events] imageMap 大小:', Object.keys(imageMap).length)
        console.log('[Events] loadedMap 大小:', Object.keys(loadedMap).length)

        const events = eventsData.map(event => {
          const existingImage = imageMap[event.id]
          const wasLoaded = loadedMap[event.id]
          const finalImage = existingImage || event.image
          // 如果有图片且图片路径存在，标记为已加载
          const hasImage = finalImage && finalImage.length > 0

          // 删除可能存在的 loaded 字段（避免飞书数据中的 loaded 字段干扰）
          const { loaded: _, ...eventWithoutLoaded } = event

          // 判断是否应该立即显示：
          // 1. 如果已有图片（hasImage），立即显示
          // 2. 如果之前已经显示过（wasLoaded），继续显示（避免已显示的活动消失）
          // 3. 如果没有 cloudImageFileIDs（不需要下载图片），立即显示
          // 4. 否则，等待图片下载完成后再显示
          const shouldLoad = hasImage || wasLoaded || !event.cloudImageFileIDs || event.cloudImageFileIDs.length === 0

          // 诊断日志：记录每个活动的状态
          console.log(`[Events Rebuild] ${event.name}:`, {
            id: event.id,
            existingImage: existingImage ? '有' : '无',
            eventImage: event.image ? '有' : '无',
            finalImage: finalImage ? '有' : '无',
            wasLoaded: !!wasLoaded,
            hasImage,
            shouldLoad,
            cloudImageFileIDs: event.cloudImageFileIDs ? event.cloudImageFileIDs.length : 0
          })

          return {
            ...eventWithoutLoaded,
            image: finalImage,
            loaded: shouldLoad,
            imageLoaded: hasImage,
            animated: hasImage || !!animatedMap[event.id],  // 保留已动画过的状态
            organizerData: this.findOrganizerData(event.organizer)
          }
        })

        this.setData({
          events,
          allImagesLoaded: this.checkAllImagesLoaded(events)
        }, () => {
          this.filterEvents()
          this.updateTabStatistics()

          // 数据更新后触发入场动画（对所有可见卡片）
          if (this._shouldAnimateOnDataUpdate) {
            this._shouldAnimateOnDataUpdate = false
            setTimeout(() => {
              const animUpdates = {}
              this.data.leftColumn.forEach((_, i) => { animUpdates[`leftColumn[${i}].animated`] = true })
              this.data.rightColumn.forEach((_, i) => { animUpdates[`rightColumn[${i}].animated`] = true })
              this.setData(animUpdates)
            }, 50)
          }
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
            imageLoaded: curr.imageLoaded,
            loaded: curr.loaded,
            organizerData: this.findOrganizerData(event.organizer)
          }
        })
        console.log('[Events] 更新文字数据（不重建列表）')
        console.log('[Events] 更新的活动数量:', Object.keys(updates).length)
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
      const events = this.data.events.map(event => ({
        ...event,
        organizerData: this.findOrganizerData(event.organizer)
      }))
      const leftColumn = this.data.leftColumn.map(event => ({
        ...event,
        organizerData: this.findOrganizerData(event.organizer)
      }))
      const rightColumn = this.data.rightColumn.map(event => ({
        ...event,
        organizerData: this.findOrganizerData(event.organizer)
      }))
      this.setData({ events, leftColumn, rightColumn })
    }
    if (!app.globalData.partnersDataListeners) {
      app.globalData.partnersDataListeners = []
    }
    app.globalData.partnersDataListeners.push(this._partnersDataCb)

    // 如果 partnersData 已经加载，立即更新组织者信息
    if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      console.log('[Events] partnersData 已加载，立即更新组织者信息')
      this._partnersDataCb()
    }

    // 监听团队成员头像下载完成（用于更新组织者头像）
    this._imageReadyCb = (type, name) => {
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
      this.setData({ isCofounder: !!(user && user.employeeId) })
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
      { list: 'currentUserListeners', cb: '_currentUserCb' },
      { list: 'assetsDataListeners', cb: '_assetsDataCb' }
    ]

    listeners.forEach(({ list, cb }) => {
      if (this[cb]) {
        app.globalData[list] = app.globalData[list].filter(callback => callback !== this[cb])
        this[cb] = null
      }
    })
  },

  // 打开搜索
  onSearchOpen() {
    this.setData({ isSearching: true })
  },

  // 关闭搜索
  onSearchClose() {
    this.setData({ isSearching: false, searchQuery: '' }, () => {
      this.filterEvents(true)
    })
  },

  // 搜索输入
  onSearchInput(e) {
    const query = e.detail.value
    this.setData({ searchQuery: query }, () => {
      this.filterEvents(true)
    })
  },

  // 标签页切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    const index = this.data.tabs.indexOf(tab)

    // 重置所有活动的 animated 状态，以便切换后重新触发动画
    const resetUpdates = { activeTab: tab }
    this.data.events.forEach((_, i) => { resetUpdates[`events[${i}].animated`] = false })

    this.setData(resetUpdates, () => {
      this.filterEvents(true)
      this.updateTabStatistics()
      this.scrollTabIntoView(index)
      setTimeout(() => this.scrollToTop(), 100)

      // 延迟触发所有可见卡片的入场动画
      setTimeout(() => {
        const animUpdates = {}
        this.data.leftColumn.forEach((_, i) => { animUpdates[`leftColumn[${i}].animated`] = true })
        this.data.rightColumn.forEach((_, i) => { animUpdates[`rightColumn[${i}].animated`] = true })
        this.setData(animUpdates)
      }, 50)
    })
  },

  // 滚动到顶部
  // 滚动到顶部（已移除，让滚动位置自然保持）
  scrollToTop() {
    // 不再强制滚动到顶部，让用户保持当前滚动位置
    // 这样可以避免干扰用户的滚动行为
  },

  // 滚动标签栏，确保指定的 tab 居中显示
  scrollTabIntoView(index) {
    // 前两个 tab 直接回到起点，确保第一个 tab 完整显示
    if (index <= 1) {
      this.setData({ tabScrollLeft: 0 })
      return
    }
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
  filterEvents(resetPage = false) {
    const { events, searchQuery, activeTab, pageSize } = this.data
    let displayCount = resetPage ? pageSize : this.data.displayCount

    let filtered = events

    // 只显示已加载完成的活动（loaded: true）
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
      return timeB - timeA
    })

    const hasMore = filtered.length > displayCount
    const paged = filtered.slice(0, displayCount)

    const leftColumn = []
    const rightColumn = []
    paged.forEach((event, index) => {
      if (index % 2 === 0) leftColumn.push(event)
      else rightColumn.push(event)
    })

    this.setData({
      filteredEvents: filtered,
      leftColumn,
      rightColumn,
      displayCount,
      hasMore
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

  // 普通用户筛选/搜索按钮（功能待定）
  onFilterBtnTap() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none',
      duration: 2000
    })
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

  // 上滑加载更多
  onLoadMore() {
    const { hasMore, displayCount, pageSize } = this.data
    if (!hasMore) return
    this.setData({ displayCount: displayCount + pageSize }, () => {
      this.filterEvents()
    })
  },

  onReachBottom() {
    this.onLoadMore()
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

  // 图片加载完成（触发弹出动画）
  onImageLoadComplete(e) {
    const eventId = e.currentTarget.dataset.id
    const events = this.data.events
    const idx = events.findIndex(e => e.id === eventId)
    if (idx === -1) return

    const updates = {}
    updates[`events[${idx}].imageLoaded`] = true
    updates[`events[${idx}].animated`] = true

    const leftIdx = this.data.leftColumn.findIndex(e => e.id === eventId)
    if (leftIdx !== -1) {
      updates[`leftColumn[${leftIdx}].imageLoaded`] = true
      updates[`leftColumn[${leftIdx}].animated`] = true
    }
    const rightIdx = this.data.rightColumn.findIndex(e => e.id === eventId)
    if (rightIdx !== -1) {
      updates[`rightColumn[${rightIdx}].imageLoaded`] = true
      updates[`rightColumn[${rightIdx}].animated`] = true
    }

    this.setData(updates)
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
