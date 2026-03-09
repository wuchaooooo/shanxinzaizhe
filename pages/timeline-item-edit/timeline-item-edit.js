// pages/timeline-item-edit/timeline-item-edit.js

Page({
  data: {
    type: 'timeline',  // 'timeline' | 'activities'
    mode: 'add',       // 'add' | 'edit'
    index: -1,
    item: { timeStart: '', timeEnd: '', title: '', desc: '' }
  },

  onLoad(options) {
    const type = options.type || 'timeline'
    const mode = options.mode || 'add'
    const index = Number(options.index) || -1

    this.setData({ type, mode, index })

    wx.setNavigationBarTitle({
      title: (mode === 'edit' ? '编辑' : '添加') + (type === 'timeline' ? '成长足迹' : '最近动态')
    })

    if (mode === 'edit') {
      const app = getApp()
      const editData = app.globalData._editingTimelineItem
      if (editData) {
        this.setData({ item: editData })
        app.globalData._editingTimelineItem = null
      }
    }
  },

  onTimeStartChange(e) {
    this.setData({ 'item.timeStart': e.detail.value })
  },

  onTimeEndChange(e) {
    this.setData({ 'item.timeEnd': e.detail.value })
  },

  onTitleInput(e) {
    this.setData({ 'item.title': e.detail.value })
  },

  onDescInput(e) {
    this.setData({ 'item.desc': e.detail.value })
  },

  onSave() {
    const { item, type, mode, index } = this.data
    if (!item.title.trim()) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!item.timeStart.trim()) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' })
      return
    }

    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.onTimelineItemSave) {
      prevPage.onTimelineItemSave({ item, type, mode, index })
    }
    wx.navigateBack()
  },

  onDelete() {
    const { type, index } = this.data
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          const pages = getCurrentPages()
          const prevPage = pages[pages.length - 2]
          if (prevPage && prevPage.onTimelineItemDelete) {
            prevPage.onTimelineItemDelete({ type, index })
          }
          wx.navigateBack()
        }
      }
    })
  }
})
