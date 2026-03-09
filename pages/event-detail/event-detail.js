// pages/event-detail/event-detail.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')

Page({
  data: {
    event: null,
    isCofounder: false,
    markers: []
  },

  onLoad(options) {
    const { eventId, type } = options
    console.log('Event Detail 页面加载:', eventId, type)

    // 获取当前用户身份
    const app = getApp()
    this.setData({
      isCofounder: !!app.globalData.currentUser
    })

    // 加载活动数据
    this.loadEventData(eventId)
  },

  // 加载活动数据
  loadEventData(eventId) {
    const events = getEventsDataSync()
    const event = events.find(e => e.id === eventId)

    if (!event) {
      wx.showToast({
        title: '活动不存在',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    // 设置地图标记点
    const markers = []
    if (event.latitude && event.longitude) {
      markers.push({
        id: 1,
        latitude: parseFloat(event.latitude),
        longitude: parseFloat(event.longitude),
        title: event.organizer || '活动地点',
        iconPath: '/images/marker.png',
        width: 30,
        height: 30
      })
    }

    this.setData({
      event: event,
      markers: markers
    })
  },

  // 预览活动图片
  onImageTap() {
    const { event } = this.data
    if (event && event.image) {
      wx.previewImage({
        urls: [event.image],
        current: event.image
      })
    }
  },

  // 打开导航
  onNavigate() {
    const { event } = this.data
    if (!event.latitude || !event.longitude) {
      wx.showToast({
        title: '暂无地址信息',
        icon: 'none'
      })
      return
    }

    wx.openLocation({
      latitude: parseFloat(event.latitude),
      longitude: parseFloat(event.longitude),
      name: event.organizer || '活动地点',
      address: event.address || '',
      scale: 16
    })
  },

  // 编辑活动
  onEdit() {
    const { event } = this.data
    wx.navigateTo({
      url: `/pages/event-edit/event-edit?eventId=${event.id}&type=${event.type}`
    })
  },

  // 生成分享图
  onShare() {
    wx.showToast({
      title: '分享功能开发中',
      icon: 'none'
    })
  },

  // 分享功能
  onShareAppMessage() {
    const { event } = this.data
    return {
      title: `${event.type} - ${event.organizer || '精彩活动'}`,
      path: `/pages/event-detail/event-detail?eventId=${event.id}&type=${event.type}`,
      imageUrl: event.image || ''
    }
  }
})
