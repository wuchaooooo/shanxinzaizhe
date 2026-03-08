// pages/events/events.js
Page({
  data: {
    // 暂时注释掉活动数据
    // activeTab: '全部活动',
    // tabs: ['全部活动', '正在进行', '往期精彩'],
    // events: [...]
  },

  onLoad() {
    // 页面加载
  },

  onContact() {
    wx.switchTab({
      url: '/pages/team/team'
    })
  },

  // 以下代码将在未来版本重新上线
  /*
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab
    })
  },
  */

  // 分享功能
  onShareAppMessage() {
    return {
      title: '善心浙里活动 - 精彩活动即将上线',
      path: '/pages/events/events',
      imageUrl: ''
    }
  }
})
