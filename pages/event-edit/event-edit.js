// pages/event-edit/event-edit.js
const { getEventsDataSync } = require('../../utils/events-data-loader.js')
const feishuApi = require('../../utils/feishu-api.js')

Page({
  data: {
    isEdit: false,
    eventId: '',
    formData: {
      type: '星享会',
      organizer: '',
      time: '',
      address: '',
      longitude: '',
      latitude: '',
      image: ''
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

    // 获取当前用户的营销员工号
    const employeeId = app.globalData.currentUser.employeeId || ''

    // 判断是编辑还是新建
    if (options.eventId) {
      this.setData({ isEdit: true, eventId: options.eventId })
      this.loadEventData(options.eventId)
    } else {
      // 新建模式，设置默认组织者为当前用户
      this.setData({
        'formData.organizer': app.globalData.currentUser.name || '',
        'formData.type': options.type || '星享会'
      })
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

    this.setData({
      formData: {
        type: event.type,
        organizer: event.organizer,
        time: event.time,
        address: event.address,
        longitude: event.longitude,
        latitude: event.latitude,
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

  // 组织者输入
  onOrganizerInput(e) {
    this.setData({
      'formData.organizer': e.detail.value
    })
  },

  // 时间选择
  onTimeChange(e) {
    this.setData({
      'formData.time': new Date(e.detail.value).toISOString()
    })
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

  // 选择地址
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        console.log('选择地址:', res)
        this.setData({
          'formData.address': res.address,
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

  // 表单验证
  validateForm() {
    const { formData } = this.data

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

      // 构建飞书字段
      const fields = {
        '组织者': formData.organizer,
        '开始时间': new Date(formData.time).getTime(),
        '营销员工号': currentUser.employeeId || ''
      }

      // 如果有地址信息，添加到字段中
      if (formData.address) {
        fields['活动地址'] = formData.address
      }
      if (formData.longitude) {
        fields['地址经度'] = parseFloat(formData.longitude)
      }
      if (formData.latitude) {
        fields['地址纬度'] = parseFloat(formData.latitude)
      }

      // 如果有新图片，上传到飞书
      if (formData.image && formData.image.includes('tmp')) {
        wx.showLoading({ title: '上传图片中...' })
        // TODO: 实现图片上传到飞书
        // const imageToken = await this.uploadImageToFeishu(formData.image)
        // fields['活动海报'] = [{ file_token: imageToken }]
        wx.hideLoading()
      }

      // 确定使用哪个表格
      const config = feishuApi.FEISHU_CONFIG
      const appToken = formData.type === '星享会'
        ? config.starClubAppToken
        : config.lunchAppToken
      const tableId = formData.type === '星享会'
        ? config.starClubTableId
        : config.lunchTableId

      wx.showLoading({ title: '保存中...' })

      if (isEdit) {
        // 更新记录
        await feishuApi.updateRecord(eventId, fields, { appToken, tableId })
        wx.showToast({ title: '更新成功', icon: 'success' })
      } else {
        // 创建记录
        await feishuApi.createRecord(fields, { appToken, tableId })
        wx.showToast({ title: '创建成功', icon: 'success' })
      }

      // 刷新数据
      if (app.preloadFeishuEvents) {
        await app.preloadFeishuEvents()
      }

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('保存活动失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  }
})
