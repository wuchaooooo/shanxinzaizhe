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
    isGeneratingPoster: false,
    mapClickDisabled: false,  // 临时禁用地图点击，防止点击穿透
    showCheckinQrcodeModal: false  // 签到码弹窗显示状态
  },

  onLoad(options) {
    const { eventId, type, shareFrom } = options
    console.log('Event Detail 页面加载:', eventId, type, shareFrom)

    // 保存 eventId 用于监听器
    this.eventId = eventId
    this.isFirstShow = true  // 标记首次显示

    // 获取当前用户身份
    const app = getApp()
    this.setData({
      isCofounder: !!app.globalData.currentUser
    })

    // 处理分享来源（营销员工号）
    if (shareFrom) {
      this.recordShareVisit(shareFrom, eventId)
    } else {
      // 普通用户访问
      this.recordShareVisit(null, eventId)
    }

    // 注册图片下载监听器
    this.registerImageListener()

    // 加载活动数据
    this.loadEventData(eventId)
  },

  // 记录分享访问
  async recordShareVisit(shareFromEmployeeId, eventId) {
    const app = getApp()
    const partnersData = app.globalData.partnersData || []
    const currentUser = app.globalData.currentUser
    const feishuApi = require('../../utils/feishu-api.js')

    let visitorName = '普通用户'
    let visitorEmployeeId = ''

    if (shareFromEmployeeId) {
      // 链接带了分享工号，根据工号查找营销员信息
      const partner = partnersData.find(p => p.employeeId === shareFromEmployeeId)
      if (partner) {
        visitorName = partner.name
        visitorEmployeeId = shareFromEmployeeId
        console.log(`分享访问：营销员 ${visitorName} (${visitorEmployeeId})`)
      } else {
        console.log(`分享访问：未找到工号 ${shareFromEmployeeId} 对应的营销员`)
        // 即使找不到营销员，也使用工号进行统计
        visitorEmployeeId = shareFromEmployeeId
      }
    } else {
      // 链接没有分享工号，区分两种情况
      if (currentUser) {
        // 情况1：当前登录用户是联合创始人
        visitorName = currentUser.name || '联合创始人'
        visitorEmployeeId = currentUser.employeeId || ''
        console.log(`直接访问：联合创始人 ${visitorName} (${visitorEmployeeId})`)
      } else {
        // 情况2：当前登录用户是普通用户
        visitorName = '普通用户'
        visitorEmployeeId = ''
        console.log('直接访问：普通用户')
      }
    }

    // 调用后端接口记录访问
    try {
      const result = await feishuApi.updateShareTracking(visitorEmployeeId, visitorName)
      if (result.success) {
        console.log(`分享统计成功: ${visitorName}, 浏览次数: ${result.count}`)
      } else {
        console.error('分享统计失败:', result.message)
      }
    } catch (error) {
      console.error('记录分享访问失败:', error)
    }
  },

  // 页面显示时重新加载数据
  onShow() {
    // 首次显示时不刷新（onLoad 已经加载过了）
    if (this.isFirstShow) {
      this.isFirstShow = false
      return
    }

    // 直接从 globalData 重新加载，不调用 preloadFeishuEvents
    // 避免提前更新缓存导致返回活动列表时检测不到变更
    if (this.eventId) {
      this.loadEventData(this.eventId)
    }
  },

  // 注册图片下载监听器
  registerImageListener() {
    const app = getApp()

    // 监听活动图片下载完成（只响应当前活动的图片）
    this.imageListener = (eventId, path) => {
      // 只处理当前活动的图片更新
      if (eventId !== this.eventId) return

      console.log('详情页：收到当前活动图片更新通知，更新显示')

      // 直接更新图片，不重新加载整个数据（避免触发重复下载）
      const event = this.data.event
      if (event) {
        const images = event.images || []
        if (!images.includes(path)) {
          images.push(path)
          this.setData({
            'event.images': images,
            'event.image': images[0] || path
          })
        }
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

    // 监听团队成员头像下载完成（用于更新组织者头像）
    this._imageReadyCb = (type, name, path) => {
      if (type !== 'avatar') return

      console.log(`[EventDetail] 收到团队成员头像下载完成通知: ${name}`)
      // 检查当前活动的组织者是否是这个人
      const event = this.data.event
      if (event && event.organizer === name) {
        // 重新查找组织者数据（包含新的头像）
        const organizerData = this.findOrganizerData(event.organizer)
        this.setData({
          organizerData: organizerData
        })
      }
    }

    if (!app.globalData.imageReadyListeners) {
      app.globalData.imageReadyListeners = []
    }
    app.globalData.imageReadyListeners.push(this._imageReadyCb)
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

    // 如果图片路径为空，尝试从缓存加载
    if ((!event.image || !event.images || event.images.length === 0) && event.cloudImageFileIDs && event.cloudImageFileIDs.length > 0) {
      const { getEventsFromCache } = require('../../utils/events-data-loader.js')
      const cachedEvents = getEventsFromCache()
      const cachedEvent = cachedEvents.find(e => e.id === eventId)
      if (cachedEvent && (cachedEvent.image || (cachedEvent.images && cachedEvent.images.length > 0))) {
        console.log('从缓存加载活动图片:', {
          image: cachedEvent.image,
          images: cachedEvent.images
        })
        event.image = cachedEvent.image
        event.images = cachedEvent.images
      }
    }

    // 验证图片文件是否存在（参考个人二维码的下载逻辑）
    const fs = wx.getFileSystemManager()
    let needRedownload = false

    // 检查 images 数组中的所有图片
    if (event.images && event.images.length > 0) {
      const validImages = []
      event.images.forEach((imagePath, index) => {
        if (imagePath) {
          try {
            fs.accessSync(imagePath)
            validImages.push(imagePath)
            console.log(`[${event.name}] 图片 ${index + 1} 文件验证通过:`, imagePath)
          } catch (e) {
            console.log(`[${event.name}] 图片 ${index + 1} 文件已失效，需要重新下载:`, imagePath)
            needRedownload = true
          }
        }
      })

      // 更新为有效的图片列表
      event.images = validImages
      event.image = validImages[0] || ''
    }

    // 如果有图片失效且有 cloudImageFileIDs，触发重新下载
    if (needRedownload && event.cloudImageFileIDs && event.cloudImageFileIDs.length > 0) {
      console.log(`[${event.name}] 检测到图片文件失效，将触发重新下载`)
      // 清空失效的图片路径，让后续逻辑触发下载
      if (event.images.length === 0) {
        event.image = ''
        event.images = []
      }
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
    // 注意：不要用 event.image 填充 event.images，因为这会影响下载逻辑
    if (!event.images) {
      event.images = []
    }

    // 如果活动已结束且有签到码，将签到码添加到图片列表的最后
    if (event.status === '已结束' && event.checkinQrcode) {
      console.log('活动已结束，检查签到码:', {
        status: event.status,
        hasCheckinQrcode: !!event.checkinQrcode,
        checkinQrcode: event.checkinQrcode
      })

      // 检查签到码是否已经在 images 数组中
      if (!event.images.includes(event.checkinQrcode)) {
        // 验证签到码文件是否存在
        try {
          fs.accessSync(event.checkinQrcode)
          event.images.push(event.checkinQrcode)
          console.log('签到码已添加到图片列表:', event.checkinQrcode)
        } catch (e) {
          console.log('签到码文件不存在，跳过添加:', event.checkinQrcode)
        }
      } else {
        console.log('签到码已在图片列表中，跳过添加')
      }
    }

    // 如果 images 数组为空但有 cloudImageFileIDs，说明图片还未下载
    // 保持 images 为空数组，让下载逻辑正确判断
    console.log('详情页图片状态:', {
      imagesLength: event.images.length,
      cloudImageFileIDsLength: event.cloudImageFileIDs?.length || 0,
      hasImage: !!event.image
    })

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
      cloudImageFileIDs: event.cloudImageFileIDs,
      cloudImageFileIDsLength: event.cloudImageFileIDs?.length
    })

    // 额外日志：检查 images 数组的每个元素
    if (event.images && event.images.length > 0) {
      console.log('详情页 images 数组详情:')
      event.images.forEach((img, idx) => {
        console.log(`  [${idx}]: ${img}`)
      })
    }

    // 如果活动有图片，但还没下载完成，或者有签到码未下载，则触发下载
    if (event.cloudImageFileIDs && event.cloudImageFileIDs.length > 0) {
      const downloadedCount = event.images ? event.images.length : 0
      const needsImages = downloadedCount < event.cloudImageFileIDs.length
      const needsCheckinQrcode = event.cloudCheckinQrcodeFileID && !event.checkinQrcode

      if (needsImages || needsCheckinQrcode) {
        if (needsImages) {
          console.log(`详情页：需要下载剩余图片，已有 ${downloadedCount} 张，共 ${event.cloudImageFileIDs.length} 张`)
        }
        if (needsCheckinQrcode) {
          console.log(`详情页：需要下载签到码`)
        }

        // 检查是否已经在下载中（防止重复下载）
        if (!this.isDownloadingImages) {
          // 异步下载剩余图片，不阻塞页面显示
          this.downloadRemainingImages(event)
        } else {
          console.log('详情页：图片下载已在进行中，跳过')
        }
      }
    }
  },

  // 下载剩余图片（使用缓存检查逻辑）
  async downloadRemainingImages(event) {
    // 设置下载标志，防止并发下载
    this.isDownloadingImages = true

    const { downloadEventImages } = require('../../utils/events-data-loader.js')
    const { id, name } = event

    console.log(`[${name}] 开始下载所有图片（利用缓存避免重复下载）`)

    try {
      // 从头开始下载所有图片，downloadEventImages 会自动使用缓存
      // startIndex = 0 确保检查所有图片，包括第一张
      await downloadEventImages(event, null, true, 0)

      // downloadEventImages 已经直接更新了 event.images
      // 直接使用 event 对象的数据更新页面
      if (event.images && event.images.length > 0) {
        console.log(`[${name}] 更新页面显示，共 ${event.images.length} 张图片`)

        // 一次性更新页面显示
        const updateData = {
          'event.images': event.images,
          'event.image': event.images[0]
        }

        // 如果有签到码，也更新签到码
        if (event.checkinQrcode) {
          updateData['event.checkinQrcode'] = event.checkinQrcode
          console.log(`[${name}] 更新签到码: ${event.checkinQrcode}`)
        }

        this.setData(updateData)

        // 同步更新 globalData
        const app = getApp()
        const globalEvents = app.globalData.eventsData || []
        const globalIdx = globalEvents.findIndex(e => e.id === id)
        if (globalIdx !== -1) {
          globalEvents[globalIdx].images = event.images
          globalEvents[globalIdx].imagePaths = event.images
          globalEvents[globalIdx].image = event.images[0]
          if (event.checkinQrcode) {
            globalEvents[globalIdx].checkinQrcode = event.checkinQrcode
          }
        }
      }

      console.log(`[${name}] 所有图片下载完成`)
    } catch (error) {
      console.error(`[${name}] 下载图片失败:`, error)
    }

    // 清除下载标志
    this.isDownloadingImages = false
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
    // 防止点击穿透：如果地图点击被临时禁用，则忽略
    if (this.data.mapClickDisabled) {
      console.log('地图点击被临时禁用，忽略导航请求')
      return
    }

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
    this.setData({
      showActionSheet: true,
      mapClickDisabled: true  // 显示菜单时禁用地图点击
    })
  },

  // 隐藏操作菜单
  onHideActionSheet() {
    this.setData({ showActionSheet: false })

    // 延迟500ms后重新启用地图点击，防止点击穿透
    setTimeout(() => {
      this.setData({ mapClickDisabled: false })
    }, 500)
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
            // 1. 确定使用哪个表格
            const config = feishuApi.FEISHU_CONFIG
            let appToken, tableId

            if (event.type === '星享会') {
              appToken = config.starClubAppToken
              tableId = config.starClubTableId
            } else if (event.type === '午餐会') {
              appToken = config.lunchAppToken
              tableId = config.lunchTableId
            } else if (event.type === '销售门诊') {
              appToken = config.salesClinicAppToken
              tableId = config.salesClinicTableId
            } else if (event.type === '销售建设') {
              appToken = config.salesBuildingAppToken
              tableId = config.salesBuildingTableId
            } else if (event.type === '客户活动' || event.type === '看电影' || event.type === '徒步活动' || event.type === '其他活动') {
              appToken = config.otherActivitiesAppToken
              tableId = config.otherActivitiesTableId
            } else {
              throw new Error(`未知的活动类型: ${event.type}`)
            }

            console.log('删除活动:', { eventId: event.id, type: event.type, appToken, tableId })

            // 2. 先调用飞书 API 删除记录
            await feishuApi.deleteRecord(event.id, { appToken, tableId })
            console.log('飞书记录删除成功')

            // 3. 再删除腾讯云存储的图片
            console.log('开始删除腾讯云图片:', event.cloudImageFileIDs)
            if (event.cloudImageFileIDs && event.cloudImageFileIDs.length > 0) {
              try {
                const deleteResults = await wx.cloud.deleteFile({
                  fileList: event.cloudImageFileIDs
                })
                console.log('腾讯云图片删除结果:', deleteResults)

                // 检查删除结果
                const failedFiles = deleteResults.fileList.filter(f => f.status !== 0)
                if (failedFiles.length > 0) {
                  console.warn('部分图片删除失败:', failedFiles)
                }
              } catch (cloudError) {
                console.error('删除腾讯云图片失败:', cloudError)
                // 飞书记录已删除，图片删除失败不影响整体流程
              }
            }

            // 4. 删除签到码图片
            if (event.cloudCheckinQrcodeFileID) {
              try {
                await wx.cloud.deleteFile({
                  fileList: [event.cloudCheckinQrcodeFileID]
                })
                console.log('签到码图片删除成功')
              } catch (cloudError) {
                console.error('删除签到码图片失败:', cloudError)
              }
            }

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            // 强制刷新数据（即使正在加载中也要重新加载）
            const app = getApp()
            if (app.preloadFeishuEvents) {
              // 重置加载标志，强制重新加载
              app._fetchingFeishuEvents = false
              await app.preloadFeishuEvents()
            }

            // 等待 Toast 显示完成后返回
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
  async onShare() {
    const { isGeneratingPoster } = this.data
    if (isGeneratingPoster) return // 防止重复点击

    // 先关闭操作菜单并禁用地图点击
    this.setData({
      showActionSheet: false,
      mapClickDisabled: true
    })

    // 延迟执行后续逻辑，防止点击穿透到地图
    await new Promise(resolve => setTimeout(resolve, 300))

    this.setData({ isGeneratingPoster: true })
    const { event, organizerData } = this.data
    if (!event) {
      this.setData({
        isGeneratingPoster: false,
        mapClickDisabled: false  // 重新启用地图点击
      })
      wx.showToast({
        title: '活动数据加载中',
        icon: 'none'
      })
      return
    }

    // 确保组织者二维码已下载（使用统一接口）
    const { ensureQrcodeDownloaded } = require('../../utils/profile-loader.js')

    if (organizerData && organizerData.employeeId) {
      // 移除 wx.showLoading，使用弹窗中的骨架图代替

      try {
        const qrcodePath = await ensureQrcodeDownloaded(organizerData.employeeId)

        if (qrcodePath) {
          console.log('组织者二维码已准备:', qrcodePath)
        } else {
          console.warn('组织者二维码下载失败，将使用默认二维码')
        }

        // 移除 wx.hideLoading
      } catch (error) {
        console.error('下载组织者二维码失败:', error)
        // 移除 wx.hideLoading
        // 继续生成海报，即使二维码下载失败
      }
    }

    try {
      generateEventPoster(this, 'posterCanvas', event)
      // 海报生成成功后会自动设置 showPoster，在那时重置 loading
      setTimeout(() => {
        this.setData({
          isGeneratingPoster: false,
          mapClickDisabled: false  // 重新启用地图点击
        })
      }, 1000)
    } catch (error) {
      console.error('生成海报失败:', error)
      this.setData({
        isGeneratingPoster: false,
        mapClickDisabled: false  // 重新启用地图点击
      })
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
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const shareFrom = currentUser ? currentUser.employeeId : (app.globalData.initialShareFrom || 'guest')

    const { event } = this.data
    return {
      title: event.name || '精彩活动',
      path: `/pages/event-detail/event-detail?eventId=${event.id}&type=${event.type}&shareFrom=${shareFrom}`,
      imageUrl: event.image || ''
    }
  },

  // 预览签到码（弹窗方式）
  async onShowCheckinQrcode() {
    const { event } = this.data

    // 如果签到码还没下载，先下载
    if (event.cloudCheckinQrcodeFileID && !event.checkinQrcode) {
      console.log('签到码未下载，开始下载...')
      wx.showLoading({ title: '加载中...', mask: true })

      try {
        const { getImage } = require('../../utils/image-cache.js')
        const checkinQrcode = await getImage(event.cloudCheckinQrcodeFileID)

        // 更新页面数据
        this.setData({
          'event.checkinQrcode': checkinQrcode
        })

        // 同步更新 globalData
        const app = getApp()
        const globalEvents = app.globalData.eventsData || []
        const globalIdx = globalEvents.findIndex(e => e.id === event.id)
        if (globalIdx !== -1) {
          globalEvents[globalIdx].checkinQrcode = checkinQrcode
        }

        console.log('签到码下载完成:', checkinQrcode)
      } catch (error) {
        console.error('下载签到码失败:', error)
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
        return
      } finally {
        wx.hideLoading()
      }
    }

    // 显示弹窗
    this.setData({
      showCheckinQrcodeModal: true
    })
  },

  // 关闭签到码弹窗
  onHideCheckinQrcode() {
    this.setData({
      showCheckinQrcodeModal: false
    })
  },

  // 预览签到码（图片预览方式，保留用于进行中的活动）
  onPreviewCheckinQrcode() {
    const { event } = this.data
    if (event.checkinQrcode) {
      wx.previewImage({
        urls: [event.checkinQrcode],
        current: event.checkinQrcode
      })
    }
  }
})
