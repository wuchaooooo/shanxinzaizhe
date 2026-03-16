// custom-tab-bar/index.js
Component({
  data: {
    hidden: true,  // 默认隐藏，等 onShow 或开屏结束后再显示
    selected: 'pages/home/home',
    tabs: [
      { text: '首页', path: 'pages/home/home' },
      { text: '团队', path: 'pages/team/team' },
      { text: '活动', path: 'pages/events/events' }
    ]
  },

  methods: {
    onTabTap(e) {
      const path = e.currentTarget.dataset.path
      if (path === this.data.selected) return
      wx.switchTab({ url: `/${path}` })
    }
  }
})
