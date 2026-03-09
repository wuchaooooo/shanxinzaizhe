// pages/events/events.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')

Page({
  data: {
    activeTab: '全部活动',
    tabs: ['全部活动', '星享会', '午餐会'],
    events: [],
    filteredEvents: [],
    loading: true,
    allImagesLoaded: false,
    isCofounder: false
  },

  onLoad() {
    console.log('Events 页面加载')

    // 获取当前用户身份
    const app = getApp()
    this.setData({
      isCofounder: !!app.globalData.currentUser
    })

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

    this.setData({
      events: events,
      loading: false
    }, () => {
      this.filterEvents()
    })
  },

  // 注册监听器
  registerListeners() {
    const app = getApp()

    // 监听活动数据刷新
    this.eventsDataListener = (events) => {
      console.log('Events 页面收到数据刷新通知:', events.length)
      this.setData({
        events: events
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
    const { activeTab, events } = this.data
    let filtered = events

    if (activeTab === '星享会') {
      filtered = events.filter(e => e.type === '星享会')
    } else if (activeTab === '午餐会') {
      filtered = events.filter(e => e.type === '午餐会')
    }

    this.setData({
      filteredEvents: filtered
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
