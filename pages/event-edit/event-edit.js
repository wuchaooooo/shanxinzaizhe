// pages/event-edit/event-edit.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    isEdit: false,
    eventId: '',
    originalImageKeys: [], // 保存原始的 imageKeys 数组
    formData: {
      name: '',
      type: '星享会',
      organizer: '',
      time: '',
      images: [], // 改为数组
      displayDate: '',
      displayTime: ''
    },
    typeOptions: ['星享会', '午餐会'],
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
      const defaultData = {
        'formData.organizer': app.globalData.currentUser.name || '',
        'formData.type': options.type || '星享会'
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

    console.log('编辑页加载完成，最终表单数据:', this.data.formData)

    // 处理图片数组
    const images = event.images || (event.image ? [event.image] : [])
    const imageKeys = event.imageKeys || (event.imageKey ? [event.imageKey] : [])

    this.setData({
      originalImageKeys: imageKeys, // 保存原始的 imageKeys 数组
      formData: {
        name: event.name || '',
        type: event.type,
        organizer: event.organizer,
        time: startTime.datetime,
        displayDate: startTime.date,
        displayTime: startTime.time,
        images: images
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
    const originalImageKeys = [...this.data.originalImageKeys]

    // 如果删除的是原有图片（非临时路径），也要从 originalImageKeys 中移除
    if (!images[index].includes('tmp') && originalImageKeys.length > index) {
      originalImageKeys.splice(index, 1)
    }

    images.splice(index, 1)

    this.setData({
      'formData.images': images,
      originalImageKeys: originalImageKeys
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
      wx.showToast({ title: '请选择活动时间', icon: 'none' })
      return false
    }

    return true
  },

  // 保存活动
  async onSave() {
    if (!this.validateForm()) return

    if (this.data.saving) return
    this.setData({ saving: true })

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
      const endTime = startTime + (2 * 60 * 60 * 1000) // 开始时间 + 2小时

      const fields = {
        '活动主题': formData.name || '',
        '组织者': formData.organizer,
        '开始时间': startTime,
        '结束时间': endTime,
        '营销员工号': currentUser?.employeeId || ''
      }

      // 确定使用哪个表格
      const config = feishuApi.FEISHU_CONFIG
      const appToken = formData.type === '星享会'
        ? config.starClubAppToken
        : config.lunchAppToken
      const tableId = formData.type === '星享会'
        ? config.starClubTableId
        : config.lunchTableId

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
      const imageKeys = []
      const newImages = formData.images.filter(img => img.includes('tmp')) // 新上传的图片
      const oldImages = formData.images.filter(img => !img.includes('tmp')) // 原有的图片

      // 上传新图片
      if (newImages.length > 0) {
        wx.showLoading({ title: `上传图片中 0/${newImages.length}` })
        try {
          for (let i = 0; i < newImages.length; i++) {
            wx.showLoading({ title: `上传图片中 ${i + 1}/${newImages.length}` })
            const imageKey = await feishuApi.uploadImage(newImages[i])
            imageKeys.push(imageKey)
            console.log(`图片 ${i + 1} 上传成功，image_key:`, imageKey)
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

      // 合并原有的 imageKeys 和新上传的 imageKeys
      const finalImageKeys = [...this.data.originalImageKeys, ...imageKeys]

      // 保存 imageKeys 数组（用逗号分隔的字符串）
      if (finalImageKeys.length > 0) {
        fields['活动海报链接_飞书_image_key'] = finalImageKeys.join(',')
        console.log('最终 imageKeys:', fields['活动海报链接_飞书_image_key'])
      } else {
        fields['活动海报链接_飞书_image_key'] = ''
        console.log('清空 imageKeys')
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
        wx.showToast({ title: '更新成功', icon: 'success' })
      } else {
        // 创建记录
        console.log('创建记录')
        const result = await feishuApi.createRecord(fields, { appToken, tableId })
        console.log('创建结果:', result)
        wx.showToast({ title: '创建成功', icon: 'success' })
      }

      // 刷新数据
      if (app.preloadFeishuEvents) {
        console.log('刷新活动数据')
        await app.preloadFeishuEvents()
      }

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('保存活动失败:', error)
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack,
        error: error
      })
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none',
        duration: 3000
      })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  }
})
