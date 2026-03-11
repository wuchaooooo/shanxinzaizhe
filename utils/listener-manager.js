// utils/listener-manager.js
// 通用监听器管理工具

/**
 * 创建一个监听器管理器
 * @param {Object} page - 页面实例 (this)
 * @param {Object} app - 应用实例 (getApp())
 * @returns {Object} - 包含 register 和 cleanup 方法的对象
 */
function createListenerManager(page, app) {
  const listeners = []

  return {
    /**
     * 注册监听器
     * @param {string} listenerName - 监听器数组名称（如 'imageReadyListeners'）
     * @param {Function} callback - 回调函数
     * @param {string} [propertyName] - 在页面实例上保存回调的属性名（可选）
     */
    register(listenerName, callback, propertyName) {
      // 确保监听器数组存在
      if (!app.globalData[listenerName]) {
        app.globalData[listenerName] = []
      }

      // 添加到监听器数组
      app.globalData[listenerName].push(callback)

      // 保存引用以便清理
      listeners.push({ listenerName, callback })

      // 如果提供了属性名，保存到页面实例
      if (propertyName) {
        page[propertyName] = callback
      }
    },

    /**
     * 清理所有已注册的监听器
     */
    cleanup() {
      listeners.forEach(({ listenerName, callback }) => {
        const listenerArray = app.globalData[listenerName]
        if (listenerArray) {
          const index = listenerArray.indexOf(callback)
          if (index > -1) {
            listenerArray.splice(index, 1)
          }
        }
      })
      listeners.length = 0
    }
  }
}

module.exports = {
  createListenerManager
}
