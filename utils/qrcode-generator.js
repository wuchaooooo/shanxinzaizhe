// utils/qrcode-generator.js
// 小程序码生成工具（带缓存）

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7天缓存

/**
 * 生成小程序码（带三级缓存）
 * @param {string} employeeId - 营销员工号
 * @param {object} options - 可选参数
 * @param {string} options.page - 跳转页面，默认 'pages/home/home'
 * @returns {Promise<string>} 小程序码临时文件路径
 */
async function generateMiniProgramCode(employeeId, options = {}) {
  if (!employeeId) {
    console.error('generateMiniProgramCode: employeeId 不能为空')
    return null
  }

  const page = options.page || 'pages/home/home'

  // 1. 检查内存缓存（globalData）
  const app = getApp()
  if (!app.globalData.qrcodeCache) {
    app.globalData.qrcodeCache = {}
  }

  const cacheKey = `${employeeId}_${page}`
  if (app.globalData.qrcodeCache[cacheKey]) {
    console.log(`使用内存缓存的小程序码: ${employeeId}`)
    return app.globalData.qrcodeCache[cacheKey]
  }

  // 2. 检查本地存储缓存
  const cachedData = getCachedQRCode(employeeId, page)
  if (cachedData) {
    console.log(`使用本地缓存的小程序码: ${employeeId}`)
    app.globalData.qrcodeCache[cacheKey] = cachedData.path
    return cachedData.path
  }

  // 3. 调用云函数生成新的小程序码
  console.log(`生成新的小程序码: ${employeeId}`)
  try {
    const result = await wx.cloud.callFunction({
      name: 'generateQRCode',
      data: {
        employeeId,
        page
      }
    })

    if (result.result && result.result.success) {
      // 将 Buffer 保存为临时文件
      const buffer = result.result.buffer
      const fs = wx.getFileSystemManager()
      const tempFilePath = `${wx.env.USER_DATA_PATH}/qrcode_${employeeId}_${Date.now()}.png`

      fs.writeFileSync(tempFilePath, buffer.data, 'binary')

      // 保存到缓存
      saveCachedQRCode(employeeId, page, tempFilePath)
      app.globalData.qrcodeCache[cacheKey] = tempFilePath

      console.log(`小程序码生成成功: ${tempFilePath}`)
      return tempFilePath
    } else {
      console.error('生成小程序码失败:', result.result)
      return null
    }
  } catch (error) {
    console.error('调用 generateQRCode 云函数失败:', error)
    return null
  }
}

/**
 * 获取缓存的小程序码
 */
function getCachedQRCode(employeeId, page = 'pages/home/home') {
  try {
    const cacheKey = `qrcode_cache_${employeeId}_${page.replace(/\//g, '_')}`
    const cached = wx.getStorageSync(cacheKey)

    if (cached && cached.path && cached.timestamp) {
      // 检查是否过期
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        // 检查文件是否存在
        const fs = wx.getFileSystemManager()
        try {
          fs.accessSync(cached.path)
          return cached
        } catch (e) {
          // 文件不存在，清除缓存
          wx.removeStorageSync(cacheKey)
          return null
        }
      } else {
        // 过期，清除缓存
        wx.removeStorageSync(cacheKey)
        return null
      }
    }
    return null
  } catch (error) {
    console.error('获取缓存的小程序码失败:', error)
    return null
  }
}

/**
 * 保存小程序码到缓存
 */
function saveCachedQRCode(employeeId, page, path) {
  try {
    const cacheKey = `qrcode_cache_${employeeId}_${page.replace(/\//g, '_')}`
    wx.setStorageSync(cacheKey, {
      path,
      timestamp: Date.now()
    })
  } catch (error) {
    console.error('保存小程序码缓存失败:', error)
  }
}

/**
 * 清除指定营销员的小程序码缓存
 */
function clearQRCodeCache(employeeId, page = 'pages/home/home') {
  try {
    const cacheKey = `qrcode_cache_${employeeId}_${page.replace(/\//g, '_')}`
    wx.removeStorageSync(cacheKey)

    // 清除内存缓存
    const app = getApp()
    if (app.globalData.qrcodeCache) {
      const memoryCacheKey = `${employeeId}_${page}`
      delete app.globalData.qrcodeCache[memoryCacheKey]
    }

    console.log(`已清除小程序码缓存: ${employeeId}`)
  } catch (error) {
    console.error('清除小程序码缓存失败:', error)
  }
}

module.exports = {
  generateMiniProgramCode,
  getCachedQRCode,
  clearQRCodeCache
}
