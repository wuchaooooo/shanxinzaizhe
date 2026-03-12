// utils/animate.js

/**
 * 数字滚动动画
 * @param {Object} page     - 页面实例 (this)
 * @param {Object} targets  - { dataKey: { to: number, suffix?: string } }
 * @param {number} duration - 动画时长 ms，默认 600
 */
function animateNumbers(page, targets, duration) {
  if (!duration) duration = 600

  // 取消上一个还在运行的动画
  if (page._animateTimer) {
    clearInterval(page._animateTimer)
    page._animateTimer = null
  }

  const keys = Object.keys(targets)

  // 以当前显示值作为起点，支持带后缀的字符串（如 "1200+"）
  const startValues = {}
  keys.forEach(key => {
    startValues[key] = parseInt(String(page.data[key])) || 0
  })

  const startTime = Date.now()

  page._animateTimer = setInterval(() => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    // ease-out quad：结尾减速，视觉上更自然
    const eased = 1 - (1 - progress) * (1 - progress)

    const update = {}
    keys.forEach(key => {
      const { to, suffix } = targets[key]
      const current = Math.round(startValues[key] + (to - startValues[key]) * eased)
      update[key] = suffix ? current + suffix : current
    })
    page.setData(update)

    if (progress >= 1) {
      clearInterval(page._animateTimer)
      page._animateTimer = null
    }
  }, 50) // 优化：从 16ms 增加到 50ms，减少 setData 调用次数
}

module.exports = { animateNumbers }
