// pages/badge-select/badge-select.js

const BADGE_OPTIONS = [
  { title: '钻石人才DA',    desc: '首3月业绩定级' },
  { title: '铂金人才PA',    desc: '首三月业绩定级' },
  { title: '五星会会员',    desc: '连续3个月达成五星会' },
  { title: '五星会精英会员', desc: '连续6个月达成五星会' },
  { title: '五星会钻石会员', desc: '连续12个月达成五星会' },
  { title: '五星会终身会员', desc: '连续60个月达成五星会' },
  { title: '金五星会员',    desc: '连续3个月达成金五星会' },
  { title: '金五星精英会员', desc: '连续6个月达成金五星会' },
  { title: '金五星钻石会员', desc: '连续12个月达成金五星会' },
  { title: '金五星终身会员', desc: '连续60个月达成金五星会' },
  { title: 'MDRT',         desc: 'MDRT百万圆桌会员' },
  { title: 'COT',          desc: 'COT会员' },
  { title: 'TOT',          desc: 'TOT会员' }
]

Page({
  data: {
    badgeOptions: []
  },

  onLoad() {
    const app = getApp()
    const saved = app.globalData._badgeOptions
    if (saved && saved.length > 0) {
      this.setData({ badgeOptions: saved })
      app.globalData._badgeOptions = null
    } else {
      this.setData({ badgeOptions: BADGE_OPTIONS.map(b => Object.assign({}, b, { checked: false })) })
    }
  },

  onToggle(e) {
    const index = Number(e.currentTarget.dataset.index)
    const options = this.data.badgeOptions.slice()
    options[index] = Object.assign({}, options[index], { checked: !options[index].checked })
    this.setData({ badgeOptions: options })
  },

  onSave() {
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && prevPage.onBadgesSave) {
      prevPage.onBadgesSave({ badgeOptions: this.data.badgeOptions })
    }
    wx.navigateBack()
  }
})
