// utils/splash.js
// 全局开屏动画工具
// 用法：在任意页面的 onLoad 里调用 runSplashIfNeeded(this)

const { getAssetPath } = require('./assets-loader.js')

function getTabBar() {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  return page && page.getTabBar ? page.getTabBar() : null
}

/**
 * 如果是本次启动后第一次调用，则在当前页面播放开屏动画。
 * 页面 data 需包含：showSplash, splashLogoUrl, splashLogoVisible, splashHeartbeat, splashMeltOut
 * @param {Object} page - 页面 this
 */
function runSplashIfNeeded(page) {
  const app = getApp()
  if (app.globalData.splashShown) return
  app.globalData.splashShown = true

  // 计算导航栏高度，让 logo 与微信默认加载动画位置对齐
  let navBarHeight = 88
  try {
    const sysInfo = wx.getSystemInfoSync()
    navBarHeight = (sysInfo.statusBarHeight || 20) + 44
  } catch (e) {}

  const logoUrl = getAssetPath('shanxinzheli')
  page.setData({ showSplash: true, splashLogoUrl: logoUrl || '', splashNavBarHeight: navBarHeight })

  // 将导航栏背景色改为白色，隐藏返回箭头区域，与开屏背景融合
  wx.setNavigationBarColor({
    frontColor: '#ffffff',
    backgroundColor: '#ffffff'
  })

  // 延迟一帧再隐藏 tabBar，确保组件已挂载
  setTimeout(() => {
    const tabBar = getTabBar()
    if (tabBar) tabBar.setData({ hidden: true })
  }, 0)

  const timers = []

  timers.push(setTimeout(() => {
    page.setData({ splashLogoVisible: true })
  }, 150))

  timers.push(setTimeout(() => {
    page.setData({ splashHeartbeat: true })
  }, 550))

  timers.push(setTimeout(() => {
    page.setData({ splashMeltOut: true })
    // 融化动画开始时提前显示 tabBar，避免动画结束和 tabBar 出现同时发生
    const tb = getTabBar()
    if (tb) tb.setData({ hidden: false })
  }, 2200))

  timers.push(setTimeout(() => {
    page.setData({ showSplash: false })
    // 恢复导航栏颜色
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#ffffff'
    })
  }, 2800))

  // 挂到页面实例上，方便 onUnload 时清理
  page._splashTimers = timers
}

module.exports = { runSplashIfNeeded }
