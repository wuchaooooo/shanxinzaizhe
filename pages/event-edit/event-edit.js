// pages/event-edit/event-edit.js
const { getEventsDataSync, getEventsFromCache } = require('../../utils/events-data-loader.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    isEdit: false,
    eventId: '',
    originalCloudFileIDs: [], // 保存原始的云存储 fileID 数组
    originalCheckinQrcodeCloudFileID: '', // 保存原始的签到码云存储 fileID
    checkinQrcodeIsNew: false, // 用户是否主动选了新签到码
    formData: {
      name: '',
      type: '星享会',
      organizer: '',
      time: '',
      endTime: '', // 结束时间
      images: [], // 改为数组
      checkinQrcode: '', // 签到码图片
      displayDate: '',
      displayTime: '',
      displayEndDate: '', // 结束日期
      displayEndTime: '', // 结束时间
      address: '',
      latitude: null,
      longitude: null
    },
    typeOptions: ['星享会', '午餐会', '销售门诊', '销售建设', '客户活动'],
    saving: false
  },

  onLoad(options) {
    console.log('Event Edit 页面加载:', options)

    // 权限验证
    const app = getApp()
    if (!app.globalData.currentUser) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    // 判断是编辑还是新建
    if (options.eventId) {
      this.setData({ isEdit: true, eventId: options.eventId })
      this.loadEventData(options.eventId)
    } else {
      // 新建模式，设置默认组织者为当前用户
      // 解码 URL 参数
      const defaultType = options.defaultType
        ? decodeURIComponent(options.defaultType)
        : (options.type ? decodeURIComponent(options.type) : '星享会')
      const defaultData = {
        'formData.organizer': app.globalData.currentUser.name || '',
        'formData.type': defaultType
      }
      console.log('新建活动，初始化表单数据:', defaultData)
      this.setData(defaultData)
      console.log('表单数据设置后:', this.data.formData)
    }
  },

  // 加载活动数据（编辑模式）
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

    // 将 ISO 时间转换为 picker 需要的格式
    const formatTimeForPicker = (isoTime) => {
      if (!isoTime) return { date: '', time: '', datetime: '' }
      try {
        const date = new Date(isoTime)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        return {
          date: `${year}-${month}-${day}`,
          time: `${hour}:${minute}`,
          datetime: `${year}-${month}-${day} ${hour}:${minute}`
        }
      } catch (e) {
        console.error('时间格式转换失败:', e)
        return { date: '', time: '', datetime: '' }
      }
    }

    const startTime = formatTimeForPicker(event.time)
    const endTime = formatTimeForPicker(event.endTime)

    console.log('编辑页加载完成，最终表单数据:', this.data.formData)

    // 处理图片数组
    const images = event.images || (event.image ? [event.image] : [])

    // 如果签到码路径为空但有 cloudFileID，尝试从缓存补充
    let checkinQrcode = event.checkinQrcode || ''
    if (!checkinQrcode && event.cloudCheckinQrcodeFileID) {
      const cachedEvents = getEventsFromCache()
      const cachedEvent = cachedEvents.find(e => e.id === eventId)
      if (cachedEvent && cachedEvent.checkinQrcode) {
        checkinQrcode = cachedEvent.checkinQrcode
      }
    }

    this.setData({
      originalCloudFileIDs: event.cloudImageFileIDs || [], // 保存原始的云存储 fileID 数组
      originalCheckinQrcodeCloudFileID: event.cloudCheckinQrcodeFileID || '', // 保存原始签到码云存储 fileID
      checkinQrcodeIsNew: false, // 加载时重置，非用户主动选图
      formData: {
        name: event.name || '',
        type: event.type,
        organizer: event.organizer,
        time: startTime.datetime,
        endTime: endTime.datetime,
        displayDate: startTime.date,
        displayTime: startTime.time,
        displayEndDate: endTime.date,
        displayEndTime: endTime.time,
        images: images,
        checkinQrcode: checkinQrcode, // 签到码图片（优先用缓存路径）
        address: event.address || '',
        latitude: event.latitude || null,
        longitude: event.longitude || null
      }
    })
  },

  // 活动类型选择
  onTypeChange(e) {
    this.setData({
      'formData.type': this.data.typeOptions[e.detail.value]
    })
  },

  // 活动名称输入
  onNameInput(e) {
    this.setData({
      'formData.name': e.detail.value
    })
  },

  // 组织者输入
  onOrganizerInput(e) {
    this.setData({
      'formData.organizer': e.detail.value
    })
  },

  // 日期选择
  onDateChange(e) {
    console.log('开始日期选择:', e.detail.value)
    const date = e.detail.value
    const time = this.data.formData.displayTime || '09:00'
    const datetime = `${date} ${time}`

    this.setData({
      'formData.displayDate': date,
      'formData.time': datetime
    })
    console.log('合并后的开始时间:', datetime)

    // 如果已经选择了时间，则自动设置结束时间
    if (!this.data.isEdit && !this.data.formData.endTime && this.data.formData.displayTime) {
      this.setDefaultEndTime(datetime)
    }
  },

  // 时间选择
  onTimeChange(e) {
    console.log('开始时间选择:', e.detail.value)
    const time = e.detail.value
    const date = this.data.formData.displayDate

    if (!date) {
      wx.showToast({
        title: '请先选择日期',
        icon: 'none'
      })
      return
    }

    const datetime = `${date} ${time}`
    this.setData({
      'formData.displayTime': time,
      'formData.time': datetime
    })
    console.log('合并后的开始时间:', datetime)

    // 自动设置结束时间为开始时间+2小时（仅在新建模式且结束时间未设置时）
    if (!this.data.isEdit && !this.data.formData.endTime) {
      this.setDefaultEndTime(datetime)
    }
  },

  // 设置默认结束时间（开始时间+2小时）
  setDefaultEndTime(startDatetime) {
    const startTime = new Date(startDatetime)
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000) // +2小时

    const year = endTime.getFullYear()
    const month = String(endTime.getMonth() + 1).padStart(2, '0')
    const day = String(endTime.getDate()).padStart(2, '0')
    const hour = String(endTime.getHours()).padStart(2, '0')
    const minute = String(endTime.getMinutes()).padStart(2, '0')

    const endDate = `${year}-${month}-${day}`
    const endTimeStr = `${hour}:${minute}`
    const endDatetime = `${endDate} ${endTimeStr}`

    this.setData({
      'formData.displayEndDate': endDate,
      'formData.displayEndTime': endTimeStr,
      'formData.endTime': endDatetime
    })
    console.log('自动设置结束时间:', endDatetime)
  },

  // 结束日期选择
  onEndDateChange(e) {
    console.log('结束日期选择:', e.detail.value)
    const date = e.detail.value
    const time = this.data.formData.displayEndTime || '18:00'
    const datetime = `${date} ${time}`

    this.setData({
      'formData.displayEndDate': date,
      'formData.endTime': datetime
    })
    console.log('合并后的结束时间:', datetime)
  },

  // 结束时间选择
  onEndTimeChange(e) {
    console.log('结束时间选择:', e.detail.value)
    const time = e.detail.value
    const date = this.data.formData.displayEndDate

    if (!date) {
      wx.showToast({
        title: '请先选择结束日期',
        icon: 'none'
      })
      return
    }

    const datetime = `${date} ${time}`
    this.setData({
      'formData.displayEndTime': time,
      'formData.endTime': datetime
    })
    console.log('合并后的结束时间:', datetime)
  },

  // 选择地址
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        console.log('选择地址成功:', res)
        this.setData({
          'formData.address': res.name,  // 只保存位置名称（简称）
          'formData.latitude': res.latitude,
          'formData.longitude': res.longitude
        })
      },
      fail: (err) => {
        console.error('选择地址失败:', err)
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中开启位置权限',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting()
              }
            }
          })
        }
      }
    })
  },

  // 选择图片
  onChooseImage() {
    const currentCount = this.data.formData.images.length
    const remainCount = 9 - currentCount

    if (remainCount <= 0) {
      wx.showToast({
        title: '最多上传9张图片',
        icon: 'none'
      })
      return
    }

    wx.chooseImage({
      count: remainCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = [...this.data.formData.images, ...res.tempFilePaths]
        this.setData({
          'formData.images': newImages
        })
      }
    })
  },

  // 删除图片
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.formData.images]
    const originalCloudFileIDs = [...this.data.originalCloudFileIDs]

    // 如果删除的是原有图片（非临时路径），也要从 originalCloudFileIDs 中移除
    if (!images[index].includes('tmp') && originalCloudFileIDs.length > index) {
      originalCloudFileIDs.splice(index, 1)
    }

    images.splice(index, 1)

    this.setData({
      'formData.images': images,
      originalCloudFileIDs: originalCloudFileIDs
    })
  },

  // 选择签到码
  onChooseCheckinQrcode() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'formData.checkinQrcode': res.tempFilePaths[0],
          checkinQrcodeIsNew: true // 用户主动选了新图
        })
      }
    })
  },

  // 删除签到码
  onDeleteCheckinQrcode() {
    this.setData({
      'formData.checkinQrcode': '',
      originalCheckinQrcodeCloudFileID: '', // 清空原始云存储 fileID
      checkinQrcodeIsNew: false
    })
  },

  // 表单验证
  validateForm() {
    const { formData } = this.data

    if (!formData.name) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' })
      return false
    }

    if (!formData.organizer) {
      wx.showToast({ title: '请输入组织者', icon: 'none' })
      return false
    }

    if (!formData.time) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' })
      return false
    }

    if (!formData.endTime) {
      wx.showToast({ title: '请选择结束时间', icon: 'none' })
      return false
    }

    // 验证结束时间必须晚于开始时间
    const startTime = new Date(formData.time).getTime()
    const endTime = new Date(formData.endTime).getTime()
    if (endTime <= startTime) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' })
      return false
    }

    // 验证活动海报必须至少选一张
    if (!formData.images || formData.images.length === 0) {
      wx.showToast({ title: '请至少上传一张活动海报', icon: 'none' })
      return false
    }

    return true
  },

  // 保存活动
  async onSave() {
    console.log('=== 开始保存活动 ===')
    console.log('当前表单数据:', this.data.formData)

    if (!this.validateForm()) return

    if (this.data.saving) {
      console.log('正在保存中，忽略重复点击')
      return
    }

    this.setData({ saving: true })
    console.log('设置 saving 状态为 true')

    try {
      const { formData, isEdit, eventId } = this.data
      const app = getApp()
      const currentUser = app.globalData.currentUser

      console.log('开始保存活动:', {
        isEdit,
        eventId,
        formData,
        currentUser
      })

      // 构建飞书字段（只包含实际存在的字段）
      const startTime = new Date(formData.time).getTime()
      const endTime = new Date(formData.endTime).getTime()

      const fields = {
        '活动主题': formData.name || '',
        '组织者': formData.organizer,
        '开始时间': startTime,
        '结束时间': endTime,
        '营销员工号': currentUser?.employeeId || ''
      }

      // 添加地址信息（销售门诊和销售建设不保存地址字段）
      if (formData.type !== '销售门诊' && formData.type !== '销售建设') {
        if (formData.address) {
          fields['活动地址'] = formData.address
        }
        if (formData.latitude !== null && formData.longitude !== null) {
          fields['地址纬度'] = String(formData.latitude)
          fields['地址经度'] = String(formData.longitude)
        }
      }

      // 确定使用哪个表格
      const config = feishuApi.FEISHU_CONFIG
      let appToken, tableId

      if (formData.type === '星享会') {
        appToken = config.starClubAppToken
        tableId = config.starClubTableId
      } else if (formData.type === '午餐会') {
        appToken = config.lunchAppToken
        tableId = config.lunchTableId
      } else if (formData.type === '销售门诊') {
        appToken = config.salesClinicAppToken
        tableId = config.salesClinicTableId
      } else if (formData.type === '销售建设') {
        appToken = config.salesBuildingAppToken
        tableId = config.salesBuildingTableId
      } else if (formData.type === '客户活动') {
        appToken = config.otherActivitiesAppToken
        tableId = config.otherActivitiesTableId
      } else {
        // 默认使用客户活动表格
        appToken = config.otherActivitiesAppToken
        tableId = config.otherActivitiesTableId
      }

      // 调试：获取表格字段列表
      try {
        const tableFields = await feishuApi.getTableFields({ appToken, tableId })
        console.log(`[${formData.type}] 表格字段列表:`, tableFields)
        if (tableFields && tableFields.items) {
          console.log(`[${formData.type}] 字段名列表:`, tableFields.items.map(f => f.field_name))
        }
      } catch (err) {
        console.error('获取表格字段失败:', err)
      }

      // 处理多张图片上传
      const newImages = formData.images.filter(img => img.includes('tmp')) // 新上传的图片
      const oldImages = formData.images.filter(img => !img.includes('tmp')) // 原有的图片

      // 引入云存储上传工具
      const { uploadToCloudStorage } = require('../../utils/cloud-storage-uploader.js')
      const cloudFileIDs = []

      // 上传新图片
      if (newImages.length > 0) {
        wx.showLoading({ title: `上传图片中 0/${newImages.length}` })
        try {
          for (let i = 0; i < newImages.length; i++) {
            wx.showLoading({ title: `上传图片中 ${i + 1}/${newImages.length}` })

            const cloudResult = await uploadToCloudStorage(
              newImages[i],
              `images/event/${Date.now()}_${i}.png`,
              {
                employeeId: currentUser?.employeeId,
                index: i
              }
            )
            if (cloudResult.success) {
              cloudFileIDs.push(cloudResult.fileID)
              console.log(`[云存储] 图片 ${i + 1} 上传成功:`, cloudResult.fileID)
            } else {
              throw new Error(`图片 ${i + 1} 上传失败`)
            }
          }
        } catch (uploadError) {
          console.error('图片上传失败:', uploadError)
          wx.hideLoading()
          wx.showToast({
            title: '图片上传失败',
            icon: 'none'
          })
          this.setData({ saving: false })
          return
        }
        wx.hideLoading()
      }

      // 合并原有的 cloudFileIDs 和新上传的 cloudFileIDs
      const originalCloudFileIDs = this.data.originalCloudFileIDs || []
      const finalCloudFileIDs = [...originalCloudFileIDs, ...cloudFileIDs]

      // 保存 cloudFileIDs 数组（用逗号分隔的字符串）
      if (finalCloudFileIDs.length > 0) {
        fields['活动海报链接_腾讯云_file_id'] = JSON.stringify(finalCloudFileIDs)
        console.log('最终 cloudFileIDs:', fields['活动海报链接_腾讯云_file_id'])
      } else {
        fields['活动海报链接_腾讯云_file_id'] = ''
        console.log('清空 cloudFileIDs')
      }

      // 处理签到码上传（仅星享会、午餐会、客户活动）
      console.log('开始处理签到码，活动类型:', formData.type)
      console.log('签到码数据:', formData.checkinQrcode)

      if (formData.type === '星享会' || formData.type === '午餐会' || formData.type === '客户活动') {
        console.log('活动类型匹配，可以上传签到码')
        if (formData.checkinQrcode) {
          console.log('有签到码需要处理')
          // 只有用户主动选了新图才上传
          if (this.data.checkinQrcodeIsNew) {
            console.log('检测到新上传的签到码，开始上传到云存储')
            try {
              wx.showLoading({ title: '上传签到码中...' })

              const cloudResult = await uploadToCloudStorage(
                formData.checkinQrcode,
                `images/event/${Date.now()}_checkin.png`,
                {
                  employeeId: currentUser?.employeeId
                }
              )
              if (cloudResult.success) {
                // 保存为 JSON 数组格式（单张图片也用数组）
                fields['活动签到码链接_腾讯云_file_id'] = JSON.stringify([cloudResult.fileID])
                console.log('[云存储] 签到码上传成功:', cloudResult.fileID)
              } else {
                throw new Error('签到码上传失败')
              }

              wx.hideLoading()
            } catch (uploadError) {
              console.error('签到码上传失败:', uploadError)
              wx.hideLoading()
              wx.showToast({
                title: '签到码上传失败',
                icon: 'none'
              })
              this.setData({ saving: false })
              return
            }
          } else {
            console.log('使用原有的签到码 cloudFileID:', this.data.originalCheckinQrcodeCloudFileID)
            // 使用原有的云存储 fileID（转换为 JSON 数组格式）
            if (this.data.originalCheckinQrcodeCloudFileID) {
              const fileID = this.data.originalCheckinQrcodeCloudFileID
              fields['活动签到码链接_腾讯云_file_id'] = Array.isArray(fileID) ? JSON.stringify(fileID) : JSON.stringify([fileID])
            }
          }
        } else {
          console.log('没有签到码，设置为空字符串')
          // 清空签到码
          fields['活动签到码链接_腾讯云_file_id'] = ''
        }
      } else {
        console.log('活动类型不匹配，不处理签到码')
      }

      console.log('飞书字段:', fields)
      console.log('飞书字段详情:', JSON.stringify(fields, null, 2))

      console.log('飞书配置:', {
        type: formData.type,
        appToken,
        tableId
      })

      wx.showLoading({ title: '保存中...' })

      if (isEdit) {
        // 更新记录
        console.log('更新记录:', eventId)
        const result = await feishuApi.updateRecord(eventId, fields, { appToken, tableId })
        console.log('更新结果:', result)

        // 直接更新 globalData，让详情页 onShow 能读到新数据
        const { calculateEventStatus } = require('../../utils/events-data-loader.js')
        const newStartTime = new Date(formData.time).toISOString()
        const newEndTime = new Date(formData.endTime).toISOString()
        const newStatus = calculateEventStatus(newStartTime, newEndTime)
        const globalEvents = app.globalData.eventsData || []
        const globalIdx = globalEvents.findIndex(e => e.id === eventId)
        if (globalIdx !== -1) {
          const existingEvent = globalEvents[globalIdx]

          globalEvents[globalIdx].name = formData.name
          globalEvents[globalIdx].organizer = formData.organizer
          globalEvents[globalIdx].time = newStartTime
          globalEvents[globalIdx].endTime = newEndTime
          globalEvents[globalIdx].status = newStatus
          globalEvents[globalIdx].address = formData.address || existingEvent.address
          globalEvents[globalIdx].latitude = formData.latitude
          globalEvents[globalIdx].longitude = formData.longitude

          // 保留图片字段，防止编辑后图片丢失
          if (existingEvent.image) {
            globalEvents[globalIdx].image = existingEvent.image
          }
          if (existingEvent.images && existingEvent.images.length > 0) {
            globalEvents[globalIdx].images = existingEvent.images
          }
          if (existingEvent.imagePaths && existingEvent.imagePaths.length > 0) {
            globalEvents[globalIdx].imagePaths = existingEvent.imagePaths
          }
        }
      } else {
        // 创建记录
        console.log('创建记录')
        const result = await feishuApi.createRecord(fields, { appToken, tableId })
        console.log('创建结果:', result)
      }

      wx.hideLoading()

      // 显示成功提示并立即返回
      wx.showToast({
        title: isEdit ? '更新成功' : '创建成功',
        icon: 'success',
        duration: 1500
      })

      // 立即返回上一页（不等待）
      setTimeout(() => {
        wx.navigateBack()
      }, 500)

    } catch (error) {
      console.error('=== 保存活动失败 ===')
      console.error('错误类型:', error.constructor.name)
      console.error('错误消息:', error.message)
      console.error('错误堆栈:', error.stack)
      console.error('完整错误对象:', JSON.stringify(error, null, 2))

      wx.hideLoading()
      wx.showToast({
        title: error.message || '保存失败，请查看控制台',
        icon: 'none',
        duration: 3000
      })

      // 只在失败时重置 saving 状态
      this.setData({ saving: false })
    }
    // 注意：成功时不重置 saving 状态，保持按钮禁用直到页面返回
  }
})
