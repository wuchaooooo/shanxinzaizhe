// pages/events/events.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')

Page({
  data: {
    activeTab: '全部活动',
    tabs: ['全部活动', '星享会', '午餐会'],
    events: [],
    filteredEvents: [],
    leftColumn: [],
    rightColumn: [],
    searchQuery: '',
    starClubCount: 0,
    lunchCount: 0,
    totalCount: 0,
    loading: true,
    allImagesLoaded: false,
    isCofounder: false
  },

  onLoad() {
    console.log('Events 页面加载')

    // 获取当前用户身份
    const app = getApp()

    // 立即应用已有结果（如果身份识别已完成）
    if (app.globalData.openid && app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      this.setData({ isCofounder: !!app.globalData.currentUser })
      console.log('Events 页面 - 身份识别已完成:', !!app.globalData.currentUser)
    }

    this.loadEventsData()
    this.registerListeners()
  },

  onShow() {
    console.log('Events 页面显示')
    // 触发数据刷新
    const app = getApp()
    if (app.preloadFeishuEvents) {
      app.preloadFeishuEvents()
    }
  },

  onUnload() {
    console.log('Events 页面卸载，清理监听器')
    this.cleanupListeners()
  },

  // 加载活动数据
  loadEventsData() {
    const events = getEventsDataSync()
    console.log('从缓存加载活动数据:', events.length)
    console.log('活动数据详情:', events.map(e => ({
      id: e.id,
      name: e.name,
      organizer: e.organizer,
      time: e.time,
      status: e.status
    })))

    // 计算统计数据
    const starClubCount = events.filter(e => e.type === '星享会').length
    const lunchCount = events.filter(e => e.type === '午餐会').length

    this.setData({
      events: events,
      starClubCount: starClubCount,
      lunchCount: lunchCount,
      totalCount: events.length,
      loading: false
    }, () => {
      this.filterEvents()
    })
  },

  // 注册监听器
  registerListeners() {
    const app = getApp()

    // 监听身份识别回调，更新创建按钮显示
    this._currentUserCb = (user) => {
      console.log('Events 页面收到身份识别通知:', !!user)
      this.setData({ isCofounder: !!user })
    }
    app.globalData.currentUserListeners.push(this._currentUserCb)

    // 监听活动数据刷新
    this.eventsDataListener = (events) => {
      console.log('Events 页面收到数据刷新通知:', events.length)

      // 调试：检查第一个活动的数据结构
      if (events.length > 0) {
        console.log('第一个活动的完整数据:', events[0])
        console.log('活动时间字段:', {
          time: events[0].time,
          endTime: events[0].endTime,
          name: events[0].name,
          organizer: events[0].organizer
        })
      }

      // 计算统计数据
      const starClubCount = events.filter(e => e.type === '星享会').length
      const lunchCount = events.filter(e => e.type === '午餐会').length

      this.setData({
        events: events,
        starClubCount: starClubCount,
        lunchCount: lunchCount,
        totalCount: events.length
      }, () => {
        this.filterEvents()
      })
    }
    app.globalData.eventsDataListeners.push(this.eventsDataListener)

    // 监听活动图片下载完成
    this.eventsImageReadyListener = (eventName, path) => {
      console.log(`Events 页面收到图片就绪通知: ${eventName}`)
      // 图片下载完成后，触发页面重新渲染
      this.setData({
        events: getEventsDataSync()
      }, () => {
        this.filterEvents()
      })
    }
    app.globalData.eventsImageReadyListeners.push(this.eventsImageReadyListener)
  },

  // 清理监听器
  cleanupListeners() {
    const app = getApp()

    if (this._currentUserCb) {
      const index = app.globalData.currentUserListeners.indexOf(this._currentUserCb)
      if (index > -1) {
        app.globalData.currentUserListeners.splice(index, 1)
      }
      this._currentUserCb = null
    }

    if (this.eventsDataListener) {
      const index = app.globalData.eventsDataListeners.indexOf(this.eventsDataListener)
      if (index > -1) {
        app.globalData.eventsDataListeners.splice(index, 1)
      }
    }

    if (this.eventsImageReadyListener) {
      const index = app.globalData.eventsImageReadyListeners.indexOf(this.eventsImageReadyListener)
      if (index > -1) {
        app.globalData.eventsImageReadyListeners.splice(index, 1)
      }
    }
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
    this.setData({
      activeTab: tab
    }, () => {
      this.filterEvents()
    })
  },

  // 过滤活动
  filterEvents() {
    const { activeTab, events, searchQuery } = this.data
    let filtered = events

    // 调试：检查原始数据
    console.log('filterEvents 调试:', {
      总活动数: events.length,
      第一个活动: events[0],
      第一个活动的time: events[0]?.time
    })

    // 按类型过滤
    if (activeTab === '星享会') {
      filtered = events.filter(e => e.type === '星享会')
    } else if (activeTab === '午餐会') {
      filtered = events.filter(e => e.type === '午餐会')
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

    // 分配到左右两列（瀑布流布局）
    const leftColumn = []
    const rightColumn = []
    filtered.forEach((event, index) => {
      if (index % 2 === 0) {
        leftColumn.push(event)
      } else {
        rightColumn.push(event)
      }
    })

    console.log('filterEvents 结果:', {
      过滤后数量: filtered.length,
      左列数量: leftColumn.length,
      右列数量: rightColumn.length,
      左列第一个的time: leftColumn[0]?.time
    })

    this.setData({
      filteredEvents: filtered,
      leftColumn: leftColumn,
      rightColumn: rightColumn
    })
  },

  // 点击活动卡片

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
    wx.navigateTo({
      url: '/pages/event-edit/event-edit'
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

  // 分享功能
  onShareAppMessage() {
    return {
      title: '善心浙里活动 - 精彩活动等你来',
      path: '/pages/events/events',
      imageUrl: ''
    }
  }
})
