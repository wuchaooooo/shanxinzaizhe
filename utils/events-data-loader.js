// utils/events-data-loader.js
// 活动数据加载器 - 从飞书 Base 加载星享会和午餐会数据

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 将飞书记录转换为本地数据格式
 */
function transformFeishuEventRecord(record, eventType) {
  const fields = record.fields
  const mapping = DATA_SOURCE_CONFIG.eventsFieldMapping

  // 解析时间字段（飞书返回的是时间戳）
  const parseTime = (timestamp) => {
    if (!timestamp) return ''
    try {
      const date = new Date(timestamp)
      return date.toISOString()
    } catch (e) {
      return String(timestamp)
    }
  }

  return {
    id: record.record_id, // 使用 record_id 作为唯一标识
    type: eventType, // 从表格类型推断（星享会或午餐会）
    organizer: fields[mapping.organizer] || '',
    time: parseTime(fields[mapping.time]),
    employeeId: fields[mapping.employeeId] || '', // 营销员工号（创建者）
    address: fields[mapping.address] || '',
    longitude: fields[mapping.longitude] || '',
    latitude: fields[mapping.latitude] || '',
    // 使用飞书 Base 返回的 url 字段
    imageUrl: fields[mapping.image] ? fields[mapping.image][0]?.url : '',
    image: '', // 稍后填充本地路径
    lastModified: String(fields[mapping.lastModifiedDate] || '')
  }
}

/**
 * 带重试的下载（失败后最多重试 maxRetries 次，间隔递增）
 */
function downloadWithRetry(url, token, eventId = '', maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const tryDownload = () => {
      attempt++
      downloadImageWithAuth(url, token, eventId)
        .then(resolve)
        .catch(error => {
          if (attempt < maxRetries) {
            const delay = attempt * 1000 // 1s, 2s, 3s...
            console.warn(`下载失败，${delay}ms 后重试 (${attempt}/${maxRetries}):`, url)
            setTimeout(tryDownload, delay)
          } else {
            console.error(`下载失败，已重试 ${maxRetries} 次，放弃:`, url)
            reject(error)
          }
        })
    }
    tryDownload()
  })
}

/**
 * 下载图片到本地（带认证）并保存到持久化存储
 */
function downloadImageWithAuth(url, token, eventId = '') {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: url,
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const fs = wx.getFileSystemManager()
          const fileName = `event_${eventId}_${Date.now()}.png`
          const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

          fs.saveFile({
            tempFilePath: res.tempFilePath,
            filePath: filePath,
            success: (saveRes) => {
              console.log(`[${eventId}] 活动图片持久化成功:`, saveRes.savedFilePath)
              resolve(saveRes.savedFilePath)
            },
            fail: (saveErr) => {
              console.error(`[${eventId}] 活动图片持久化失败,使用临时路径:`, saveErr)
              resolve(res.tempFilePath)
            }
          })
        } else {
          reject({
            statusCode: res.statusCode,
            errMsg: `HTTP ${res.statusCode}`,
            url: url
          })
        }
      },
      fail: (err) => {
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
 * 并发控制下载图片
 */
async function downloadWithLimit(tasks, limit = 5) {
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

// ─── 本地缓存：基于 record_id + Last Modified Date 增量更新 ─────────────────
const CACHE_VERSION = 'v1'
const CACHE_KEY = `events_cache_${CACHE_VERSION}`

function loadEventsCache() {
  try { return wx.getStorageSync(CACHE_KEY) || {} } catch (e) { return {} }
}

function saveEventsCache(cache) {
  try { wx.setStorageSync(CACHE_KEY, cache) } catch (e) { console.error('保存活动缓存失败:', e) }
}

/**
 * 从本地缓存同步读取活动列表
 */
function getEventsFromCache() {
  const cache = loadEventsCache()
  const fs = wx.getFileSystemManager()

  console.log(`getEventsFromCache: 缓存中有 ${Object.keys(cache).length} 条记录`)

  return Object.values(cache).map(entry => {
    const event = { ...entry.data }

    if (entry.imagePath) {
      try {
        fs.accessSync(entry.imagePath)
        event.image = entry.imagePath
      } catch (e) {
        console.warn(`[${event.name}] imagePath 文件不存在:`, entry.imagePath)
        event.image = ''
      }
    } else if (!event.image) {
      event.image = ''
    } else if (event.image && event.image.includes('tmp')) {
      console.warn(`[${event.name}] 清除无效的临时图片路径: ${event.image}`)
      event.image = ''
    }

    return event
  }).sort((a, b) => {
    // 按时间倒序排列（最新的在前面）
    if (!a.time || !b.time) return 0
    return new Date(b.time) - new Date(a.time)
  })
}

/**
 * 同步获取活动数据（有缓存就返回，否则返回空数组）
 */
function getEventsDataSync() {
  const app = getApp()
  if (app.globalData.eventsData && app.globalData.eventsData.length > 0) {
    return app.globalData.eventsData
  }
  return []
}

/**
 * 获取飞书活动数据，从两张表格（星享会和午餐会）合并数据
 * @returns {{ events: Array, hasChanges: boolean, changedIds: Set }}
 */
async function fetchFeishuEventsText() {
  try {
    console.log('获取飞书活动数据...')
    const config = feishuApi.FEISHU_CONFIG
    const cache = loadEventsCache()
    const newCache = {}
    let hasChanges = false
    const changedIds = new Set()
    const currentMap = {}

    getEventsDataSync().forEach(e => { if (e.id) currentMap[e.id] = e })

    // 并行获取两张表格的数据
    const [starClubRecords, lunchRecords] = await Promise.all([
      feishuApi.getAllRecords({
        appToken: config.starClubAppToken,
        tableId: config.starClubTableId
      }),
      feishuApi.getAllRecords({
        appToken: config.lunchAppToken,
        tableId: config.lunchTableId
      })
    ])

    console.log(`获取到 ${starClubRecords.length} 条星享会记录, ${lunchRecords.length} 条午餐会记录`)

    // 转换星享会数据
    const starClubEvents = starClubRecords.map(record => {
      const cacheKey = record.record_id
      const transformed = transformFeishuEventRecord(record, '星享会')
      const lastModified = transformed.lastModified
      const fs = wx.getFileSystemManager()

      // 检查缓存是否有效
      let isCacheValid = false
      if (cache[cacheKey] && cache[cacheKey].lastModified === lastModified) {
        const cachedPath = cache[cacheKey].data.image
        if (cachedPath) {
          try {
            fs.accessSync(cachedPath)
            isCacheValid = true
          } catch (e) {
            console.warn(`[${cacheKey}] 缓存路径失效:`, cachedPath)
          }
        } else {
          isCacheValid = true
        }
      }

      if (isCacheValid) {
        // 未变更：复用缓存
        newCache[cacheKey] = cache[cacheKey]
        const existing = currentMap[cacheKey]
        let imagePath = existing ? existing.image : ''

        if (!imagePath && cache[cacheKey].imagePath) {
          try {
            fs.accessSync(cache[cacheKey].imagePath)
            imagePath = cache[cacheKey].imagePath
          } catch (e) {
            // 文件不存在
          }
        }

        return { ...cache[cacheKey].data, image: imagePath }
      }

      // 有变更：重新 transform
      hasChanges = true
      changedIds.add(cacheKey)
      newCache[cacheKey] = { lastModified, data: { ...transformed, image: '' } }
      return transformed
    })

    // 转换午餐会数据
    const lunchEvents = lunchRecords.map(record => {
      const cacheKey = record.record_id
      const transformed = transformFeishuEventRecord(record, '午餐会')
      const lastModified = transformed.lastModified
      const fs = wx.getFileSystemManager()

      let isCacheValid = false
      if (cache[cacheKey] && cache[cacheKey].lastModified === lastModified) {
        const cachedPath = cache[cacheKey].data.image
        if (cachedPath) {
          try {
            fs.accessSync(cachedPath)
            isCacheValid = true
          } catch (e) {
            console.warn(`[${cacheKey}] 缓存路径失效:`, cachedPath)
          }
        } else {
          isCacheValid = true
        }
      }

      if (isCacheValid) {
        newCache[cacheKey] = cache[cacheKey]
        const existing = currentMap[cacheKey]
        let imagePath = existing ? existing.image : ''

        if (!imagePath && cache[cacheKey].imagePath) {
          try {
            fs.accessSync(cache[cacheKey].imagePath)
            imagePath = cache[cacheKey].imagePath
          } catch (e) {
            // 文件不存在
          }
        }

        return { ...cache[cacheKey].data, image: imagePath }
      }

      hasChanges = true
      changedIds.add(cacheKey)
      newCache[cacheKey] = { lastModified, data: { ...transformed, image: '' } }
      return transformed
    })

    // 合并两个数组
    const events = [...starClubEvents, ...lunchEvents]

    // 按时间倒序排列（最新的在前面）
    events.sort((a, b) => {
      if (!a.time || !b.time) return 0
      return new Date(b.time) - new Date(a.time)
    })

    // 检查是否有记录被删除
    if (!hasChanges && Object.keys(cache).some(k => !newCache[k])) {
      hasChanges = true
    }

    saveEventsCache(newCache)
    console.log(`活动数据加载完成，共 ${events.length} 条，${hasChanges ? `有变更(${changedIds.size}条)` : '无变更'}`)
    return { events, hasChanges, changedIds }
  } catch (error) {
    console.error('获取飞书活动数据失败:', error)
    throw error
  }
}

/**
 * 在后台下载活动图片
 * @param {Array} eventsData
 * @param {Function} onImageReady (eventName, localPath) - 图片下载完成后回调
 * @param {Set} changedIds - 有变更的活动 ID 集合
 */
async function downloadEventImagesBackground(eventsData, onImageReady, changedIds) {
  try {
    const token = await feishuApi.getTenantAccessToken()
    const imageTasks = []
    const cache = loadEventsCache()

    for (const event of eventsData) {
      const isChanged = !changedIds || changedIds.has(event.id)

      console.log(`[${event.name}] 检查图片: isChanged=${isChanged}, hasImage=${!!event.image}, imageUrl=${!!event.imageUrl}`)

      if (event.imageUrl) {
        const cachedImagePath = cache[event.id]?.imagePath
        let cacheExists = false

        if (cachedImagePath) {
          try {
            const fs = wx.getFileSystemManager()
            fs.accessSync(cachedImagePath)
            cacheExists = true
            if (!event.image) {
              event.image = cachedImagePath
            }
          } catch (e) {
            // 缓存文件不存在
          }
        }

        if (!isChanged && cacheExists) {
          console.log(`[${event.name}] 跳过下载: 数据未变更且缓存文件存在`)
        } else if (!cacheExists || isChanged) {
          const needNotify = isChanged || !event.image
          console.log(`[${event.name}] 需要下载图片: needNotify=${needNotify}`)
          imageTasks.push(() =>
            downloadWithRetry(event.imageUrl, token, event.id)
              .then(path => {
                console.log(`[${event.name}] 图片下载成功:`, path)

                // 删除旧文件
                const oldPath = cache[event.id]?.imagePath
                if (oldPath && oldPath !== path) {
                  try {
                    const fs = wx.getFileSystemManager()
                    fs.unlinkSync(oldPath)
                    console.log(`[${event.name}] 已删除旧图片:`, oldPath)
                  } catch (e) {
                    console.warn(`[${event.name}] 删除旧图片失败:`, oldPath, e)
                  }
                }

                event.image = path
                if (!cache[event.id]) {
                  cache[event.id] = { data: event }
                }
                cache[event.id].imagePath = path
                cache[event.id].data = event
                saveEventsCache(cache)

                if (needNotify && onImageReady) {
                  console.log(`[${event.name}] 触发图片就绪回调`)
                  onImageReady(event.name, path)
                }
              })
              .catch((err) => {
                console.error(`[${event.name}] 图片下载失败:`, err)
              })
          )
        }
      }
    }

    console.log(`准备下载 ${imageTasks.length} 张活动图片`)

    const concurrency = DATA_SOURCE_CONFIG.imageLoadMode === 'sync' ? 1 : (DATA_SOURCE_CONFIG.imageConcurrency || 2)
    await downloadWithLimit(imageTasks, concurrency)

    if (imageTasks.length === 0) {
      console.log('所有图片已从缓存加载')
    } else {
      console.log(`所有图片下载完成（共${imageTasks.length}张）`)
    }
  } catch (error) {
    console.error('后台下载图片出错:', error)
  }
}

module.exports = {
  getEventsFromCache,
  getEventsDataSync,
  fetchFeishuEventsText,
  downloadEventImagesBackground
}
