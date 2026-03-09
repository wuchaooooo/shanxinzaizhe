// utils/events-data-loader.js
// 活动数据加载器 - 从飞书 Base 加载星享会和午餐会数据

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 根据开始时间和结束时间计算活动状态
 */
function calculateEventStatus(startTime, endTime) {
  if (!startTime) return '即将开始'

  const now = new Date()
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : null

  // 如果当前时间 < 开始时间：即将开始
  if (now < start) {
    return '即将开始'
  }

  // 如果有结束时间
  if (end) {
    // 如果当前时间 >= 结束时间：已结束
    if (now >= end) {
      return '已结束'
    }
    // 如果开始时间 <= 当前时间 < 结束时间：进行中
    return '进行中'
  }

  // 如果没有结束时间，只要过了开始时间就认为是进行中
  return '进行中'
}

/**
 * 将飞书记录转换为本地数据格式
 */
function transformFeishuEventRecord(record, eventType) {
  const fields = record.fields
  const mapping = DATA_SOURCE_CONFIG.eventsFieldMapping

  console.log(`[${eventType}] 原始飞书记录:`, {
    record_id: record.record_id,
    所有字段名: Object.keys(fields),
    活动名称映射: mapping.name,
    活动名称值: fields[mapping.name],
    组织者映射: mapping.organizer,
    组织者值: fields[mapping.organizer],
    开始时间映射: mapping.time,
    开始时间值: fields[mapping.time],
    结束时间映射: mapping.endTime,
    结束时间值: fields[mapping.endTime]
  })

  // 解析时间字段（飞书返回的是时间戳）
  const parseTime = (timestamp) => {
    if (!timestamp) return ''
    try {
      const date = new Date(timestamp)
      return date.toISOString()
    } catch (e) {
      console.error('时间解析失败:', timestamp, e)
      return String(timestamp)
    }
  }

  const startTime = parseTime(fields[mapping.time])
  const endTime = parseTime(fields[mapping.endTime])

  console.log(`[${eventType}] 时间字段:`, {
    原始开始时间: fields[mapping.time],
    解析后开始时间: startTime,
    原始结束时间: fields[mapping.endTime],
    解析后结束时间: endTime
  })

  // 自动计算活动状态
  const autoStatus = calculateEventStatus(startTime, endTime)

  // 处理多张图片的 imageKey（可能是逗号分隔的字符串）
  const imageKeyStr = fields[mapping.imageKey] || ''
  const imageKeys = imageKeyStr ? imageKeyStr.split(',').map(k => k.trim()).filter(k => k) : []

  const transformed = {
    id: record.record_id, // 使用 record_id 作为唯一标识
    name: fields[mapping.name] || '', // 活动名称
    type: eventType, // 从表格类型推断（星享会或午餐会）
    organizer: fields[mapping.organizer] || '',
    time: startTime,
    endTime: endTime,
    employeeId: fields[mapping.employeeId] || '', // 营销员工号
    status: autoStatus, // 自动计算的活动状态
    imageKeys: imageKeys, // 飞书 IM 图片 keys 数组
    imageKey: imageKeys[0] || '', // 第一张图片的 key（兼容旧逻辑）
    images: [], // 稍后填充本地路径数组
    image: '', // 第一张图片的本地路径（兼容旧逻辑）
    lastModified: String(fields[mapping.lastModifiedDate] || '')
  }

  console.log(`[${eventType}] 转换后数据:`, {
    id: transformed.id,
    name: transformed.name,
    organizer: transformed.organizer,
    status: transformed.status
  })

  return transformed
}

/**
 * 根据 image_key 获取图片下载 URL
 * @param {string} imageKey - 飞书图片的 image_key
 * @returns {string} - 返回下载链接
 */
function getImageDownloadUrl(imageKey) {
  // 直接使用 image_key 构建下载链接
  // 飞书 IM 图片 API 直接返回图片二进制数据，无需两步转换
  const downloadUrl = `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`
  console.log('[getImageDownloadUrl] 使用 image_key 构建下载链接:', downloadUrl)
  return downloadUrl
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
  try {
    wx.setStorageSync(CACHE_KEY, cache)
  } catch (e) {
    console.error('保存活动缓存失败:', e)
  }
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

      console.log(`[星享会] 处理记录: ${transformed.name} (ID: ${cacheKey})`)

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

      // 有变更：重新 transform，但保留 imageKeys 用于后续判断
      hasChanges = true
      changedIds.add(cacheKey)
      newCache[cacheKey] = {
        lastModified,
        data: { ...transformed, images: [] },
        imageKeys: transformed.imageKeys, // 保存 imageKeys 用于判断图片是否变化
        imagePaths: cache[cacheKey]?.imagePaths || [] // 保留旧的图片路径数组
      }
      return transformed
    })

    // 转换午餐会数据
    const lunchEvents = lunchRecords.map(record => {
      const cacheKey = record.record_id
      const transformed = transformFeishuEventRecord(record, '午餐会')
      const lastModified = transformed.lastModified
      const fs = wx.getFileSystemManager()

      console.log(`[午餐会] 处理记录: ${transformed.name} (ID: ${cacheKey})`)

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
      newCache[cacheKey] = {
        lastModified,
        data: { ...transformed, images: [] },
        imageKeys: transformed.imageKeys,
        imagePaths: cache[cacheKey]?.imagePaths || []
      }
      return transformed
    })

    // 合并两个数组并去重（基于 record_id）
    const eventsMap = new Map()

    // 先添加星享会记录
    starClubEvents.forEach(event => {
      eventsMap.set(event.id, event)
    })

    // 再添加午餐会记录（如果 ID 已存在，说明有重复，保留第一个）
    lunchEvents.forEach(event => {
      if (eventsMap.has(event.id)) {
        console.warn(`发现重复记录 ID: ${event.id}，已跳过`)
      } else {
        eventsMap.set(event.id, event)
      }
    })

    const events = Array.from(eventsMap.values())

    console.log(`合并后总数: ${events.length} 条（去重前: ${starClubEvents.length + lunchEvents.length} 条）`)
    console.log('活动列表:')
    events.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.type}] ${e.name} (ID: ${e.id})`)
    })

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
  console.log('[downloadEventImagesBackground] ===== 开始下载活动图片 =====')
  console.log('[downloadEventImagesBackground] 活动数量:', eventsData.length)
  console.log('[downloadEventImagesBackground] changedIds:', changedIds)

  try {
    const token = await feishuApi.getTenantAccessToken()
    console.log('[downloadEventImagesBackground] 获取 token 成功')

    const imageTasks = []
    const cache = loadEventsCache()

    for (const event of eventsData) {
      const isChanged = !changedIds || changedIds.has(event.id)

      console.log(`[${event.name}] ===== 检查图片 =====`)
      console.log(`[${event.name}] isChanged: ${isChanged}`)
      console.log(`[${event.name}] hasImage: ${!!event.image}`)
      console.log(`[${event.name}] imageKey: ${event.imageKey || '无'}`)

      if (event.imageKey) {
        const cachedImagePath = cache[event.id]?.imagePath
        const cachedImageKey = cache[event.id]?.imageKey
        let cacheExists = false

        // 检查缓存文件是否存在
        if (cachedImagePath) {
          try {
            const fs = wx.getFileSystemManager()
            fs.accessSync(cachedImagePath)
            cacheExists = true
            if (!event.image) {
              event.image = cachedImagePath
            }
            console.log(`[${event.name}] 缓存文件存在: ${cachedImagePath}`)
          } catch (e) {
            console.log(`[${event.name}] 缓存文件不存在`)
          }
        }

        // 判断是否需要下载图片
        // 1. 如果记录未变更且缓存存在，跳过下载
        // 2. 如果记录变更了，但 imageKey 没变且缓存存在，也跳过下载
        // 3. 只有当 imageKey 变化或缓存不存在时，才下载
        const imageKeyChanged = cachedImageKey && cachedImageKey !== event.imageKey
        const needDownload = !cacheExists || imageKeyChanged

        if (!isChanged && cacheExists) {
          console.log(`[${event.name}] ⏭️ 跳过下载: 数据未变更且缓存文件存在`)
        } else if (isChanged && !imageKeyChanged && cacheExists) {
          console.log(`[${event.name}] ⏭️ 跳过下载: imageKey 未变化且缓存文件存在`)
        } else if (needDownload) {
          const needNotify = isChanged || !event.image
          console.log(`[${event.name}] ✅ 需要下载图片: imageKeyChanged=${imageKeyChanged}, cacheExists=${cacheExists}, needNotify=${needNotify}`)

          imageTasks.push(async () => {
            try {
              console.log(`[${event.name}] 📥 开始下载流程...`)

              console.log(`[${event.name}] 🔑 使用 imageKey 下载图片:`, event.imageKey)
              const downloadUrl = getImageDownloadUrl(event.imageKey)
              console.log(`[${event.name}] 🔗 下载链接:`, downloadUrl)

              console.log(`[${event.name}] 🚀 开始下载图片...`)
              const path = await downloadWithRetry(downloadUrl, token, event.id)
              console.log(`[${event.name}] ✅ 图片下载成功:`, path)

              // 删除旧文件
              const oldPath = cache[event.id]?.imagePath
              if (oldPath && oldPath !== path) {
                try {
                  const fs = wx.getFileSystemManager()
                  fs.unlinkSync(oldPath)
                  console.log(`[${event.name}] 🗑️ 已删除旧图片:`, oldPath)
                } catch (e) {
                  console.warn(`[${event.name}] ⚠️ 删除旧图片失败:`, oldPath, e)
                }
              }

              // 更新缓存
              event.image = path
              if (!cache[event.id]) {
                cache[event.id] = { data: event }
              }
              cache[event.id].imagePath = path
              cache[event.id].imageKey = event.imageKey // 保存 imageKey
              cache[event.id].data = event
              saveEventsCache(cache)

              if (needNotify && onImageReady) {
                console.log(`[${event.name}] 📢 触发图片就绪回调`)
                onImageReady(event.name, path)
              }
            } catch (err) {
              console.error(`[${event.name}] ❌ 图片下载失败:`, err)
              console.error(`[${event.name}] 错误详情:`, {
                message: err.message,
                stack: err.stack
              })
            }
          })
        }
      } else {
        console.log(`[${event.name}] ⚠️ 没有 imageKey，跳过图片下载`)
      }
    }

    console.log(`[downloadEventImagesBackground] 📊 准备下载 ${imageTasks.length} 张活动图片`)

    const concurrency = DATA_SOURCE_CONFIG.imageLoadMode === 'sync' ? 1 : (DATA_SOURCE_CONFIG.imageConcurrency || 2)
    console.log(`[downloadEventImagesBackground] 并发数: ${concurrency}`)

    await downloadWithLimit(imageTasks, concurrency)

    if (imageTasks.length === 0) {
      console.log('[downloadEventImagesBackground] ✅ 所有图片已从缓存加载')
    } else {
      console.log(`[downloadEventImagesBackground] ✅ 所有图片下载完成（共${imageTasks.length}张）`)
    }
  } catch (error) {
    console.error('[downloadEventImagesBackground] ❌ 后台下载图片出错:', error)
  }
}

module.exports = {
  getEventsFromCache,
  getEventsDataSync,
  fetchFeishuEventsText,
  downloadEventImagesBackground
}
