// utils/assets-loader.js
// 静态资源加载器 - 从飞书 base 加载和缓存静态资源

const { getAllRecords, getTenantAccessToken, FEISHU_CONFIG } = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

const CACHE_KEY = 'assets_cache_v1'

/**
 * 带重试的下载（失败后最多重试 maxRetries 次，间隔递增）
 */
function downloadWithRetry(url, token, code, ext, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const tryDownload = () => {
      attempt++
      downloadImageWithAuth(url, token, code, ext)
        .then(resolve)
        .catch(error => {
          if (attempt < maxRetries) {
            const delay = attempt * 1000 // 1s, 2s, 3s...
            console.warn(`资源 ${code} 下载失败，${delay}ms 后重试 (${attempt}/${maxRetries}):`, url)
            setTimeout(tryDownload, delay)
          } else {
            console.error(`资源 ${code} 下载失败，已重试 ${maxRetries} 次，放弃:`, url)
            reject(error)
          }
        })
    }
    tryDownload()
  })
}

/**
 * 下载图片到本地（带认证）并保存到持久化存储
 * 使用 fs.saveFile 保存到永久路径
 */
function downloadImageWithAuth(url, token, code, ext) {
  console.log(`[${code}] 开始下载:`, url.substring(0, 100) + '...')
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: url,
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const fs = wx.getFileSystemManager()
          // 生成持久化路径
          const fileName = `asset_${code}_${Date.now()}${ext || ''}`
          const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

          fs.saveFile({
            tempFilePath: res.tempFilePath,
            filePath: filePath,
            success: (saveRes) => {
              console.log(`[${code}] 资源持久化成功:`, saveRes.savedFilePath)
              resolve(saveRes.savedFilePath)
            },
            fail: (saveErr) => {
              console.error(`[${code}] 资源持久化失败,退而使用临时路径:`, saveErr)
              resolve(res.tempFilePath)
            }
          })
        } else {
          console.error('下载资源HTTP状态码错误:', {
            url: url,
            statusCode: res.statusCode,
            response: res
          })
          reject({
            statusCode: res.statusCode,
            errMsg: `HTTP ${res.statusCode}`,
            url: url
          })
        }
      },
      fail: (err) => {
        console.error('下载资源网络请求失败:', {
          url: url,
          error: err
        })
        reject({
          statusCode: 0,
          errMsg: err.errMsg || '网络请求失败',
          url: url
        })
      }
    })
  })
}

/**
 * 加载缓存
 */
function loadAssetsCache() {
  try {
    const cache = wx.getStorageSync(CACHE_KEY)
    return cache || {}
  } catch (e) {
    console.error('读取资源缓存失败:', e)
    return {}
  }
}

/**
 * 保存缓存
 */
function saveAssetsCache(cache) {
  try {
    wx.setStorageSync(CACHE_KEY, cache)
  } catch (e) {
    console.error('保存资源缓存失败:', e)
  }
}

/**
 * 从缓存获取资源
 * 注意：使用 saveFile 保存的文件路径已经存储在缓存中，直接验证即可
 */
function getAssetsFromCache() {
  const cache = loadAssetsCache()
  const fs = wx.getFileSystemManager()
  const assets = {}

  Object.keys(cache).forEach(code => {
    const entry = cache[code]
    const filePath = entry.path  // 直接使用缓存中保存的路径

    if (!filePath) {
      console.warn(`[${code}] 缓存中没有路径信息`)
      return
    }

    try {
      fs.accessSync(filePath)
      assets[code] = {
        ...entry,
        path: filePath
      }
    } catch (e) {
      console.warn(`[${code}] 文件不存在:`, filePath)
      // 文件不存在，跳过
    }
  })

  return assets
}


/**
 * 并发下载控制
 */
async function downloadWithLimit(tasks, limit = 3) {
  const results = []
  const executing = []

  for (const task of tasks) {
    if (results.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    const promise = task().then(result => {
      executing.splice(executing.indexOf(promise), 1)
      return result
    })

    results.push(promise)
    executing.push(promise)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  return Promise.all(results)
}

/**
 * 从飞书加载静态资源
 * @param {Function} onAssetReady - 单个资源下载完成的回调 (code, path)
 */
async function fetchFeishuAssets(onAssetReady) {
  try {
    console.log('开始从飞书加载静态资源...')

    // 获取所有记录
    const records = await getAllRecords({
      appToken: FEISHU_CONFIG.assetsAppToken,
      tableId: FEISHU_CONFIG.assetsTableId
    })

    console.log(`获取到 ${records.length} 条资源记录`)

    // 解析记录
    const assets = []

    records.forEach(record => {
      const fields = record.fields
      const code = fields.code
      const type = fields.type
      const name = fields.name
      const fileField = fields.file
      const lastModified = String(fields['Last Modified Date'] || '')

      if (!code || !fileField || !fileField.length) {
        console.log(`跳过资源: code=${code}, fileField存在=${!!fileField}, fileField长度=${fileField?.length}`)
        return
      }

      const fileInfo = fileField[0]

      const fileToken = fileInfo.file_token
      const fileName = fileInfo.name || name || code
      // 使用飞书 Base 返回的 url 字段（已验证可用）
      const fileUrl = fileInfo.url

      console.log(`资源 [${code}] 信息:`, {
        fileToken: fileToken?.substring(0, 20),
        fileName,
        url: fileUrl?.substring(0, 80)
      })

      // 获取文件扩展名
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''

      assets.push({
        code,
        type,
        name,
        fileToken,
        fileName,
        fileUrl,
        ext,
        lastModified  // 添加修改时间用于缓存判断
      })
    })

    if (assets.length === 0) {
      console.log('没有需要下载的资源')
      return { assets: {}, hasChanges: false }
    }

    // 检查哪些资源需要下载
    const cache = loadAssetsCache()
    const needDownload = []
    const fs = wx.getFileSystemManager()

    assets.forEach(asset => {
      const cached = cache[asset.code]
      const lastModified = asset.lastModified

      // 检查缓存是否有效（时间匹配 且 文件路径存在）
      let isCacheValid = false
      if (cached && cached.lastModified === lastModified && cached.path) {
        try {
          fs.accessSync(cached.path)
          isCacheValid = true
        } catch (e) {
          console.warn(`[${asset.code}] 静态资源文件丢失,准备重新下载:`, cached.path)
        }
      }

      if (!isCacheValid) {
        // 新资源或文件已更新/丢失
        needDownload.push(asset)
      }
    })

    if (needDownload.length === 0) {
      console.log('所有资源已是最新，无需下载')
      return { assets: getAssetsFromCache(), hasChanges: false }
    }

    // 获取认证 token
    const token = await getTenantAccessToken()
    console.log('静态资源下载 - Token前10位:', token.substring(0, 10))

    // 下载资源
    console.log(`开始下载 ${needDownload.length} 个资源...`)

    const downloadTasks = needDownload.map(asset => {
      return async () => {
        try {
          // 保存旧路径用于删除
          const oldPath = cache[asset.code]?.path

          // 使用 downloadWithRetry 下载，失败会自动重试最多 3 次
          const path = await downloadWithRetry(asset.fileUrl, token, asset.code, asset.ext)
          console.log(`[${asset.code}] 下载成功,路径:`, path)

          // 删除旧文件（如果存在）
          if (oldPath && oldPath !== path) {
            try {
              const fs = wx.getFileSystemManager()
              fs.unlinkSync(oldPath)
              console.log(`[${asset.code}] 已删除旧文件:`, oldPath)
            } catch (e) {
              console.warn(`[${asset.code}] 删除旧文件失败:`, oldPath, e)
            }
          }

          // 更新缓存
          cache[asset.code] = {
            code: asset.code,
            type: asset.type,
            name: asset.name,
            fileToken: asset.fileToken,
            lastModified: asset.lastModified,  // 保存修改时间
            ext: asset.ext,
            path: path,
            updatedAt: Date.now()
          }

          // 立即保存缓存，确保 getAssetPath 能读取到
          saveAssetsCache(cache)

          // 立即通知页面该资源已就绪
          if (onAssetReady) {
            onAssetReady(asset.code, path)
          }

          return { success: true, code: asset.code }
        } catch (error) {
          console.error(`下载资源失败 (${asset.code}):`, error)
          return { success: false, code: asset.code, error }
        }
      }
    })

    // 使用配置的并发数
    const concurrency = DATA_SOURCE_CONFIG.imageConcurrency || 5
    await downloadWithLimit(downloadTasks, concurrency)

    // 保存缓存
    saveAssetsCache(cache)

    console.log(`资源下载完成，共 ${needDownload.length} 个`)

    return { assets: getAssetsFromCache(), hasChanges: true }
  } catch (error) {
    console.error('加载飞书资源失败:', error)
    // 返回缓存的资源
    return { assets: getAssetsFromCache(), hasChanges: false }
  }
}

/**
 * 根据 code 获取资源路径
 */
function getAssetPath(code) {
  const assets = getAssetsFromCache()
  const path = assets[code]?.path || ''
  console.log(`getAssetPath(${code}):`, path, '缓存中的资源:', assets[code])
  return path
}

/**
 * 批量获取资源路径
 */
function getAssetPaths(codes) {
  const assets = getAssetsFromCache()
  const paths = {}
  codes.forEach(code => {
    paths[code] = assets[code]?.path || ''
  })
  return paths
}

module.exports = {
  fetchFeishuAssets,
  getAssetsFromCache,
  getAssetPath,
  getAssetPaths
}
