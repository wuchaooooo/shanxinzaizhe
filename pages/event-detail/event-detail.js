// pages/event-detail/event-detail.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const { generateEventPoster } = require('../../utils/event-poster-generator.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    event: null,
    organizerData: null,
    isCofounder: false,
    canEdit: false,
    markers: [],
    showPoster: false,
    posterImage: '',
    canvasHeight: 0,
    showActionSheet: false,
    showImagePreview: false,
    previewCurrentIndex: 0,
    isDeleting: false,
    isGeneratingPoster: false
  },

  onLoad(options) {
    const { eventId, type } = options
    console.log('Event Detail 页面加载:', eventId, type)

    // 保存 eventId 用于监听器
    this.eventId = eventId

    // 获取当前用户身份
    const app = getApp()
    this.setData({
      isCofounder: !!app.globalData.currentUser
    })

    // 注册图片下载监听器
    this.registerImageListener()

    // 加载活动数据
    this.loadEventData(eventId)
  },

  // 页面显示时重新加载数据
  async onShow() {
    console.log('Event Detail 页面显示，重新加载数据')
    if (this.eventId) {
      // 刷新活动数据
      const app = getApp()
      if (app.preloadFeishuEvents) {
        try {
          await app.preloadFeishuEvents()
          console.log('活动数据刷新完成')
        } catch (error) {
          console.error('刷新活动数据失败:', error)
        }
      }
      // 重新加载当前活动数据
      this.loadEventData(this.eventId)
    }
  },

  // 注册图片下载监听器
  registerImageListener() {
    const app = getApp()

    // 监听图片下载完成
    this.imageListener = () => {
      console.log('详情页：收到图片更新通知，重新加载数据')
      if (this.eventId) {
        this.loadEventData(this.eventId)
      }
    }

    if (!app.globalData.eventsImageReadyListeners) {
      app.globalData.eventsImageReadyListeners = []
    }
    app.globalData.eventsImageReadyListeners.push(this.imageListener)

    // 监听团队数据加载完成
    this.partnersDataListener = () => {
      console.log('[EventDetail] 收到团队数据加载完成通知，重新加载活动数据')
      if (this.eventId) {
        this.loadEventData(this.eventId)
      }
    }

    if (!app.globalData.partnersDataListeners) {
      app.globalData.partnersDataListeners = []
    }
    app.globalData.partnersDataListeners.push(this.partnersDataListener)
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

    // 确保 images 数组存在（兼容性处理）
    if (!event.images || event.images.length === 0) {
      event.images = event.image ? [event.image] : []
      console.log('详情页：images 数组为空，使用 image 字段填充:', event.images)
    } else {
      console.log('详情页：images 数组已存在:', event.images)
    }

    // 查找组织者数据
    const organizerData = this.findOrganizerData(event.organizer)

    console.log('详情页时间调试:', {
      time: event.time,
      timeType: typeof event.time,
      timeValue: JSON.stringify(event.time)
    })

    this.setData({
      event: event,
      organizerData: organizerData,
      canEdit: canEdit,
      markers: markers
    })

    console.log('详情页最终数据:', {
      eventId: event.id,
      eventName: event.name,
      organizer: event.organizer,
      organizerData: organizerData,
      images: event.images,
      imagesLength: event.images?.length,
      image: event.image,
      imageKeys: event.imageKeys,
      imageKeysLength: event.imageKeys?.length
    })

    // 额外日志：检查 images 数组的每个元素
    if (event.images && event.images.length > 0) {
      console.log('详情页 images 数组详情:')
      event.images.forEach((img, idx) => {
        console.log(`  [${idx}]: ${img}`)
      })
    }
  },

  // 根据组织者名称查找团队成员数据
  findOrganizerData(organizerName) {
    if (!organizerName) {
      console.log('组织者名称为空')
      return null
    }

    const app = getApp()
    const partnersData = app.globalData.partnersData

    console.log('查找组织者:', {
      organizerName: organizerName,
      partnersDataLength: partnersData?.length || 0,
      partnersDataExists: !!partnersData
    })

    if (!partnersData || partnersData.length === 0) {
      console.log('团队数据未加载或为空')
      return null
    }

    // 打印所有团队成员的名称，用于调试
    console.log('团队成员名称列表:', partnersData.map(p => p.name))

    // 根据姓名查找匹配的团队成员
    const partner = partnersData.find(p => p.name === organizerName)

    if (partner) {
      console.log('✅ 找到组织者数据:', {
        name: partner.name,
        image: partner.image,
        imageExists: !!partner.image
      })
      return {
        name: partner.name,
        avatar: partner.image,  // 使用 image 字段作为 avatar
        employeeId: partner.employeeId
      }
    }

    console.log('❌ 未找到组织者数据:', organizerName)
    return null
  },

  // 预览活动图片
  onImageTap(e) {
    const { event } = this.data
    if (!event) return

    // 获取当前点击的图片索引
    const index = e.currentTarget.dataset.index || 0

    // 获取所有图片 URL
    const images = event.images || (event.image ? [event.image] : [])

    if (images.length > 0) {
      console.log('预览图片:', { images, currentIndex: index })
      wx.previewImage({
        urls: images,
        current: images[index]
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

  // 显示操作菜单
  onShowActionSheet() {
    this.setData({ showActionSheet: true })
  },

  // 隐藏操作菜单
  onHideActionSheet() {
    this.setData({ showActionSheet: false })
  },

  // 编辑活动
  onEdit() {
    this.setData({ showActionSheet: false })
    const { event } = this.data
    wx.navigateTo({
      url: `/pages/event-edit/event-edit?eventId=${event.id}&type=${event.type}`
    })
  },

  // 删除活动
  onDelete() {
    const { isDeleting } = this.data
    if (isDeleting) return // 防止重复点击

    this.setData({ showActionSheet: false })
    const { event } = this.data

    wx.showModal({
      title: '确认删除',
      content: `确定要删除活动"${event.name}"吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#ff4444',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ isDeleting: true })
          wx.showLoading({ title: '删除中...' })

          try {
            // 确定使用哪个表格
            const config = feishuApi.FEISHU_CONFIG
            const appToken = event.type === '星享会'
              ? config.starClubAppToken
              : event.type === '午餐会'
              ? config.lunchAppToken
              : event.type === '销售门诊'
              ? config.salesClinicAppToken
              : config.salesBuildingAppToken
            const tableId = event.type === '星享会'
              ? config.starClubTableId
              : event.type === '午餐会'
              ? config.lunchTableId
              : event.type === '销售门诊'
              ? config.salesClinicTableId
              : config.salesBuildingTableId

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
            this.setData({ isDeleting: false })
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
    const { isGeneratingPoster } = this.data
    if (isGeneratingPoster) return // 防止重复点击

    this.setData({ showActionSheet: false, isGeneratingPoster: true })
    const { event } = this.data
    if (!event) {
      this.setData({ isGeneratingPoster: false })
      wx.showToast({
        title: '活动数据加载中',
        icon: 'none'
      })
      return
    }

    try {
      generateEventPoster(this, 'posterCanvas', event)
      // 海报生成成功后会自动设置 showPoster，在那时重置 loading
      setTimeout(() => {
        this.setData({ isGeneratingPoster: false })
      }, 1000)
    } catch (error) {
      console.error('生成海报失败:', error)
      this.setData({ isGeneratingPoster: false })
      wx.showToast({
        title: '生成失败',
        icon: 'none'
      })
    }
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

  // 页面卸载时清理监听器
  onUnload() {
    const app = getApp()
    if (this.imageListener && app.globalData.eventsImageReadyListeners) {
      const index = app.globalData.eventsImageReadyListeners.indexOf(this.imageListener)
      if (index > -1) {
        app.globalData.eventsImageReadyListeners.splice(index, 1)
        console.log('详情页：已清理图片监听器')
      }
    }
    if (this.partnersDataListener && app.globalData.partnersDataListeners) {
      const index = app.globalData.partnersDataListeners.indexOf(this.partnersDataListener)
      if (index > -1) {
        app.globalData.partnersDataListeners.splice(index, 1)
        console.log('详情页：已清理团队数据监听器')
      }
    }
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
