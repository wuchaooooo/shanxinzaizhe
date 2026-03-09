// pages/event-edit/event-edit.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    isEdit: false,
    eventId: '',
    formData: {
      name: '',
      type: '星享会',
      organizer: '',
      time: '',
      endTime: '',
      image: '',
      displayDate: '',
      displayTime: '',
      displayEndDate: '',
      displayEndTime: ''
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
    const endTime = formatTimeForPicker(event.endTime)

    console.log('编辑页加载完成，最终表单数据:', this.data.formData)

    this.setData({
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
        image: event.image
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

  // 选择图片
  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'formData.image': res.tempFilePaths[0]
        })
      }
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
      const fields = {
        '活动主题': formData.name || '',
        '组织者': formData.organizer,
        '开始时间': formData.time ? new Date(formData.time).getTime() : null,
        '营销员工号': currentUser?.employeeId || ''
      }

      // 如果有结束时间，添加到字段中
      if (formData.endTime) {
        fields['结束时间'] = new Date(formData.endTime).getTime()
      }

      // 如果有图片，上传到飞书
      // TODO: 图片上传功能待完善，暂时跳过
      if (false && formData.image) {
        if (formData.image.includes('tmp')) {
          // 新上传的图片，需要上传到飞书
          wx.showLoading({ title: '上传图片中...' })
          try {
            const config = feishuApi.FEISHU_CONFIG
            const appToken = formData.type === '星享会'
              ? config.starClubAppToken
              : config.lunchAppToken

            const fileToken = await feishuApi.uploadImage(formData.image, { appToken })
            fields['活动海报'] = [{ file_token: fileToken }]
            console.log('图片上传成功，file_token:', fileToken)
          } catch (uploadError) {
            console.error('图片上传失败:', uploadError)
            wx.hideLoading()
            wx.showToast({
              title: '图片上传失败',
              icon: 'none'
            })
            return
          }
          wx.hideLoading()
        } else if (isEdit) {
          // 编辑模式且图片未改变，不需要重新上传
          console.log('图片未改变，跳过上传')
        }
      }

      console.log('飞书字段:', fields)
      console.log('飞书字段详情:', JSON.stringify(fields, null, 2))

      // 确定使用哪个表格
      const config = feishuApi.FEISHU_CONFIG
      const appToken = formData.type === '星享会'
        ? config.starClubAppToken
        : config.lunchAppToken
      const tableId = formData.type === '星享会'
        ? config.starClubTableId
        : config.lunchTableId

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
