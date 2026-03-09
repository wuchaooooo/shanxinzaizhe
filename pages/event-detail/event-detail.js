// pages/event-detail/event-detail.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const { generateEventPoster } = require('../../utils/event-poster-generator.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    event: null,
    isCofounder: false,
    canEdit: false,
    markers: [],
    showPoster: false,
    posterImage: '',
    canvasHeight: 0
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

    console.log('详情页加载活动数据:', {
      eventId: eventId,
      找到的活动: event,
      活动时间: event?.time,
      活动名称: event?.name,
      组织者: event?.organizer
    })

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

    // 判断是否可以编辑
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const canEdit = !!(currentUser && event.employeeId && currentUser.employeeId === event.employeeId)

    console.log('编辑权限检查:', {
      isCofounder: !!currentUser,
      currentEmployeeId: currentUser?.employeeId,
      eventEmployeeId: event.employeeId,
      canEdit: canEdit
    })

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
      canEdit: canEdit,
      markers: markers
    })
  },

  // 预览活动图片
  onImageTap() {
    const { event } = this.data
    if (event && (event.imageUrl || event.image)) {
      // 优先使用原始 URL，因为 wx.previewImage 需要可访问的 URL
      const imageUrl = event.imageUrl || event.image
      console.log('预览图片:', imageUrl)
      wx.previewImage({
        urls: [imageUrl],
        current: imageUrl
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

  // 删除活动
  onDelete() {
    const { event } = this.data

    wx.showModal({
      title: '确认删除',
      content: `确定要删除活动"${event.name}"吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#ff4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })

          try {
            // 确定使用哪个表格
            const config = feishuApi.FEISHU_CONFIG
            const appToken = event.type === '星享会'
              ? config.starClubAppToken
              : config.lunchAppToken
            const tableId = event.type === '星享会'
              ? config.starClubTableId
              : config.lunchTableId

            // 调用飞书 API 删除记录
            await feishuApi.deleteRecord(event.id, { appToken, tableId })

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            // 刷新数据
            const app = getApp()
            if (app.preloadFeishuEvents) {
              await app.preloadFeishuEvents()
            }

            // 返回上一页
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)

          } catch (error) {
            console.error('删除活动失败:', error)
            wx.hideLoading()
            wx.showToast({
              title: error.message || '删除失败',
              icon: 'none',
              duration: 3000
            })
          }
        }
      }
    })
  },

  // 生成分享图
  onShare() {
    const { event } = this.data
    if (!event) {
      wx.showToast({
        title: '活动数据加载中',
        icon: 'none'
      })
      return
    }

    generateEventPoster(this, 'posterCanvas', event)
  },

  // 关闭海报弹窗
  onClosePoster() {
    this.setData({
      showPoster: false,
      posterImage: ''
    })
  },

  // 保存海报到相册
  onSavePoster() {
    const { posterImage } = this.data
    if (!posterImage) {
      wx.showToast({
        title: '海报生成中，请稍候',
        icon: 'none'
      })
      return
    }

    wx.saveImageToPhotosAlbum({
      filePath: posterImage,
      success: () => {
        wx.showToast({
          title: '已保存到相册',
          icon: 'success'
        })
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          })
        }
      }
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
