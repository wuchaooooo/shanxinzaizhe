// utils/events-data-loader.js
// 活动数据加载器 - 从飞书 Base 加载星享会和午餐会数据

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { downloadImageByKey } = require('./image-downloader.js')
const {
  createCacheManager,
  validateFilePath,
  isRecordChanged
} = require('./cache-helper.js')

// ─── 本地缓存：基于 record_id + Last Modified Date 增量更新 ─────────────────
const CACHE_VERSION = 'v1'
const CACHE_KEY = `events_cache_${CACHE_VERSION}`
const cacheManager = createCacheManager(CACHE_KEY)

function loadEventsCache() {
  return cacheManager.get()
}

function saveEventsCache(cache) {
  cacheManager.save(cache)
}

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

  // 自动计算活动状态
  const autoStatus = calculateEventStatus(startTime, endTime)

  // 处理多张图片的 imageKey（可能是逗号分隔的字符串）
  const imageKeyStr = fields[mapping.imageKey] || ''
  const imageKeys = imageKeyStr ? imageKeyStr.split(',').map(k => k.trim()).filter(k => k) : []

  // 处理签到码 imageKey
  const checkinQrcodeKey = fields[mapping.checkinQrcodeKey] || ''

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
    checkinQrcodeKey: checkinQrcodeKey, // 签到码 image key
    checkinQrcode: '', // 签到码本地路径（稍后填充）
    address: fields[mapping.address] || '', // 活动地址
    latitude: fields[mapping.latitude] ? parseFloat(fields[mapping.latitude]) : null, // 地址纬度
    longitude: fields[mapping.longitude] ? parseFloat(fields[mapping.longitude]) : null, // 地址经度
    lastModified: String(fields[mapping.lastModifiedDate] || '')
  }

  return transformed
}

/**
 * 从本地缓存同步读取活动列表
 */
function getEventsFromCache() {
  const cache = loadEventsCache()

  return Object.values(cache).map(entry => {
    const event = { ...entry.data }

    // 处理多张图片的路径（兼容性处理）
    const imagePaths = entry.imagePaths || (entry.imagePath ? [entry.imagePath] : [])
    const validImages = []

    // 验证每张图片路径是否有效
    imagePaths.forEach(path => {
      if (validateFilePath(path)) {
        validImages.push(path)
      }
    })

    // 设置 images 数组和第一张图片
    event.images = validImages
    event.image = validImages[0] || ''

    // 清除无效的临时图片路径
    if (event.image && event.image.includes('tmp')) {
      event.image = ''
      event.images = []
    }

    // 恢复签到码路径
    if (entry.checkinQrcodePath && validateFilePath(entry.checkinQrcodePath)) {
      event.checkinQrcode = entry.checkinQrcodePath
    } else {
      event.checkinQrcode = ''
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
 * 处理单个活动记录的缓存逻辑
 * @param {Object} record - 飞书记录
 * @param {string} eventType - 活动类型
 * @param {Object} cache - 缓存对象
 * @param {Object} newCache - 新缓存对象
 * @param {Object} currentMap - 当前数据映射
 * @param {Set} changedTextIds - 文字变更ID集合
 * @param {Set} changedImageIds - 图片变更ID集合
 * @returns {Object} - 处理后的活动数据
 */
function processEventRecord(record, eventType, cache, newCache, changedTextIds, changedImageIds) {
  const cacheKey = record.record_id
  const transformed = transformFeishuEventRecord(record, eventType)
  const lastModified = transformed.lastModified

  // 检查文字数据是否变化
  const isTextChanged = isRecordChanged(cache, cacheKey, lastModified)

  // 检查图片 key 是否变化
  const imageKeyChanged = cache[cacheKey] && (
    JSON.stringify(cache[cacheKey].imageKeys) !== JSON.stringify(transformed.imageKeys)
  )

  // 记录变化
  if (isTextChanged && cacheKey) {
    changedTextIds.add(cacheKey)
  }
  if (imageKeyChanged && cacheKey) {
    changedImageIds.add(cacheKey)
  }

  // 检查缓存是否有效（记录未变更且图片路径有效）
  const cachedImagePaths = cache[cacheKey]?.imagePaths || []
  const isCacheValid = !isTextChanged && !imageKeyChanged && cache[cacheKey]

  if (isCacheValid) {
    // 未变更：复用缓存数据和图片路径
    newCache[cacheKey] = cache[cacheKey]

    // 验证缓存的图片路径是否仍然有效
    const validImagePaths = []
    for (const path of cachedImagePaths) {
      if (path && validateFilePath(path)) {
        validImagePaths.push(path)
      }
    }

    // 检查第一张图片是否缺失（列表页只需要第一张）
    const hasImageKeys = transformed.imageKeys && transformed.imageKeys.length > 0
    const firstImageMissing = hasImageKeys && validImagePaths.length === 0

    if (firstImageMissing) {
      // 第一张图片缺失，标记为图片变更，触发重新下载
      changedImageIds.add(cacheKey)
    }

    // 如果没有图片，则设置为 true（与团队页面逻辑一致）
    const hasNoImages = !hasImageKeys

    // 只使用验证通过的路径，不保留无效路径（确保 app.js 能正确判断需要下载）
    const imagePaths = validImagePaths
    // 如果没有图片或图片路径有效，则 loaded=true；否则 loaded=false
    const loaded = hasNoImages || validImagePaths.length > 0

    return {
      ...cache[cacheKey].data,
      imagePaths: imagePaths,
      images: imagePaths,
      image: imagePaths[0] || '',
      loaded: loaded
    }
  }

  // 有变更：重新 transform，但保留有效的图片路径（如果 imageKey 没变）
  let preservedImagePaths = []
  if (!imageKeyChanged && cachedImagePaths.length > 0) {
    // imageKey 没变，验证并保留缓存的图片路径
    const validPaths = []
    for (const path of cachedImagePaths) {
      if (path && validateFilePath(path)) {
        validPaths.push(path)
      }
    }
    // 只使用验证通过的路径，不保留无效路径（确保 app.js 能正确判断需要下载）
    preservedImagePaths = validPaths
  }

  // 如果没有图片，则设置为 true
  // 如果有图片且有路径，保留原有的 loaded 状态（避免已加载的活动因临时文件验证失败而消失）
  const hasNoImages = !transformed.imageKeys || transformed.imageKeys.length === 0
  const cachedLoaded = cache[cacheKey]?.data?.loaded
  const loaded = hasNoImages ? true : (preservedImagePaths.length > 0 && cachedLoaded !== undefined ? cachedLoaded : false)

  newCache[cacheKey] = {
    lastModified,
    data: {
      ...transformed,
      imagePaths: preservedImagePaths,
      images: preservedImagePaths,
      image: preservedImagePaths[0] || '',
      loaded: loaded
    },
    imageKeys: transformed.imageKeys,
    imagePaths: preservedImagePaths
  }

  return {
    ...transformed,
    imagePaths: preservedImagePaths,
    images: preservedImagePaths,
    image: preservedImagePaths[0] || '',
    loaded: loaded  // 使用计算的 loaded 状态，考虑保留的图片路径
  }
}

/**
 * 获取飞书活动数据，从两张表格（星享会和午餐会）合并数据
 * @returns {{ events: Array, hasChanges: boolean, changedIds: Set }}
 */
async function fetchFeishuEventsText() {
  try {
    const config = feishuApi.FEISHU_CONFIG
    const cache = loadEventsCache()
    const newCache = {}
    const changedTextIds = new Set()
    const changedImageIds = new Set()

    // 并行获取五张表格的数据
    const [starClubRecords, lunchRecords, salesClinicRecords, salesBuildingRecords, otherActivitiesRecords] = await Promise.all([
      feishuApi.getAllRecords({
        appToken: config.starClubAppToken,
        tableId: config.starClubTableId
      }),
      feishuApi.getAllRecords({
        appToken: config.lunchAppToken,
        tableId: config.lunchTableId
      }),
      feishuApi.getAllRecords({
        appToken: config.salesClinicAppToken,
        tableId: config.salesClinicTableId
      }),
      feishuApi.getAllRecords({
        appToken: config.salesBuildingAppToken,
        tableId: config.salesBuildingTableId
      }),
      feishuApi.getAllRecords({
        appToken: config.otherActivitiesAppToken,
        tableId: config.otherActivitiesTableId
      })
    ])

    // 转换各类活动数据
    const starClubEvents = starClubRecords.map(record =>
      processEventRecord(record, '星享会', cache, newCache, changedTextIds, changedImageIds)
    )
    const lunchEvents = lunchRecords.map(record =>
      processEventRecord(record, '午餐会', cache, newCache, changedTextIds, changedImageIds)
    )
    const salesClinicEvents = salesClinicRecords.map(record =>
      processEventRecord(record, '销售门诊', cache, newCache, changedTextIds, changedImageIds)
    )
    const salesBuildingEvents = salesBuildingRecords.map(record =>
      processEventRecord(record, '销售建设', cache, newCache, changedTextIds, changedImageIds)
    )
    const otherActivitiesEvents = otherActivitiesRecords.map(record =>
      processEventRecord(record, '客户活动', cache, newCache, changedTextIds, changedImageIds)
    )

    // 合并五个数组并去重（基于 record_id）
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

    // 添加销售门诊记录
    salesClinicEvents.forEach(event => {
      if (eventsMap.has(event.id)) {
        console.warn(`发现重复记录 ID: ${event.id}，已跳过`)
      } else {
        eventsMap.set(event.id, event)
      }
    })

    // 添加销售建设记录
    salesBuildingEvents.forEach(event => {
      if (eventsMap.has(event.id)) {
        console.warn(`发现重复记录 ID: ${event.id}，已跳过`)
      } else {
        eventsMap.set(event.id, event)
      }
    })

    // 添加其他活动记录
    otherActivitiesEvents.forEach(event => {
      if (eventsMap.has(event.id)) {
        console.warn(`发现重复记录 ID: ${event.id}，已跳过`)
      } else {
        eventsMap.set(event.id, event)
      }
    })

    const events = Array.from(eventsMap.values())

    // 按时间倒序排列（最新的在前面）
    events.sort((a, b) => {
      if (!a.time || !b.time) return 0
      return new Date(b.time) - new Date(a.time)
    })

    // 检查是否有记录被删除
    const changedIds = new Set([...changedTextIds, ...changedImageIds])
    const hasChanges = changedIds.size > 0 || Object.keys(cache).some(k => !newCache[k])

    saveEventsCache(newCache)
    console.log(`[飞书] 活动加载${events.length}条 | 文字变更${changedTextIds.size}条 | 图片变更${changedImageIds.size}条`)
    return { events, hasChanges, changedIds, changedImageIds }
  } catch (error) {
    console.error('获取飞书活动数据失败:', error)
    throw error
  }
}

/**
 * 下载单个活动的图片（列表页只下载第一张）
 * @param {Object} event - 活动对象
 * @param {Function} onImageReady - 图片下载完成回调 (eventId, path)
 * @param {boolean} downloadAll - 是否下载所有图片（详情页使用），默认 false（列表页只下载第一张）
 */
async function downloadEventImages(event, onImageReady, downloadAll = false, startIndex = 0) {
  const { id, name, imageKeys } = event
  const cache = loadEventsCache()

  // 处理多张图片
  if (imageKeys && imageKeys.length > 0) {
    const cachedImagePaths = cache[id]?.imagePaths || []
    const cachedImageKeys = cache[id]?.imageKeys || []
    const downloadedPaths = []
    let needsCacheUpdate = false

    // 列表页只下载第一张，详情页下载所有
    const imagesToDownload = downloadAll ? imageKeys.length : 1

    // 如果指定了 startIndex，从该索引开始下载
    const actualStartIndex = Math.max(0, startIndex)
    console.log(`[${name}] 下载图片范围: ${actualStartIndex} 到 ${imagesToDownload - 1}`)

    for (let i = actualStartIndex; i < imagesToDownload; i++) {
      const imageKey = imageKeys[i]
      const cachedPath = cachedImagePaths[i]
      const cachedKey = cachedImageKeys[i]

      // 检查缓存是否有效：
      // 1. imageKey 没有变化
      // 2. 缓存路径存在且文件可访问
      let useCache = false
      if (cachedPath && cachedKey === imageKey) {
        try {
          const fs = wx.getFileSystemManager()
          fs.accessSync(cachedPath)
          useCache = true
          downloadedPaths.push(cachedPath)
          console.log(`[${name}] 图片 ${i + 1} 使用缓存: ${cachedPath}`)

          // 通知每张图片（包括缓存的）
          if (onImageReady) {
            onImageReady(id, cachedPath)
          }
        } catch (e) {
          console.log(`[${name}] 图片 ${i + 1} 缓存文件不存在，需要重新下载`)
        }
      }

      // 如果缓存无效，重新下载
      if (!useCache) {
        try {
          const path = await downloadImageByKey(imageKey, 'event', `${id}_${i}`)
          downloadedPaths.push(path)
          needsCacheUpdate = true

          console.log(`[${name}] 图片 ${i + 1} 下载完成: ${path}`)

          // 通知每张图片下载完成
          if (onImageReady) {
            onImageReady(id, path)
          }
        } catch (error) {
          console.error(`[${name}] 图片 ${i + 1} 下载失败:`, error)
        }
      }
    }

    // 只在有新下载时才更新缓存（避免不必要的写入）
    if (needsCacheUpdate && downloadedPaths.length > 0) {
      if (!cache[id]) {
        cache[id] = { data: event }
      }

      // 重新构建完整的图片路径数组
      const allPaths = []

      // 遍历所有 imageKeys，收集已下载的图片路径
      for (let i = 0; i < imageKeys.length; i++) {
        let pathForIndex = null

        // 1. 检查是否在本次下载的路径中（downloadedPaths 对应 actualStartIndex 开始的索引）
        if (i >= actualStartIndex && i < actualStartIndex + downloadedPaths.length) {
          pathForIndex = downloadedPaths[i - actualStartIndex]
        }

        // 2. 如果本次没下载，检查缓存中是否有
        if (!pathForIndex) {
          const cachedPaths = cache[id].imagePaths || []
          if (i < cachedPaths.length) {
            pathForIndex = cachedPaths[i]
          }
        }

        // 3. 添加到数组（可能是 undefined）
        allPaths.push(pathForIndex)
      }

      // 过滤掉 undefined，只保留有效路径
      const validPaths = allPaths.filter(p => p !== undefined && p !== null)

      cache[id].imagePaths = validPaths
      cache[id].imageKeys = imageKeys
      saveEventsCache(cache)

      console.log(`[${name}] 缓存已更新，共 ${validPaths.length}/${imageKeys.length} 张图片`)
    }

    // 更新 event 对象（从缓存获取完整的图片路径数组）
    if (downloadedPaths.length > 0 || actualStartIndex > 0) {
      const finalImagePaths = cache[id]?.imagePaths || downloadedPaths

      event.imagePaths = finalImagePaths
      event.images = finalImagePaths
      event.image = finalImagePaths[0] || ''
      event.loaded = finalImagePaths.length >= imageKeys.length
    }
  }

  // 处理签到码图片（仅在 downloadAll 为 true 时下载，即详情页）
  if (downloadAll && event.checkinQrcodeKey) {
    const cachedCheckinQrcodePath = cache[id]?.checkinQrcodePath
    const cachedCheckinQrcodeKey = cache[id]?.checkinQrcodeKey
    let checkinQrcodePath = null

    // 检查缓存是否有效
    let useCache = false
    if (cachedCheckinQrcodePath && cachedCheckinQrcodeKey === event.checkinQrcodeKey) {
      try {
        const fs = wx.getFileSystemManager()
        fs.accessSync(cachedCheckinQrcodePath)
        useCache = true
        checkinQrcodePath = cachedCheckinQrcodePath
        console.log(`[${name}] 签到码使用缓存: ${cachedCheckinQrcodePath}`)
      } catch (e) {
        console.log(`[${name}] 签到码缓存文件不存在，需要重新下载`)
      }
    }

    // 如果缓存无效，重新下载
    if (!useCache) {
      try {
        checkinQrcodePath = await downloadImageByKey(event.checkinQrcodeKey, 'event', `${id}_checkin`)
        console.log(`[${name}] 签到码下载完成: ${checkinQrcodePath}`)

        // 更新缓存
        if (!cache[id]) {
          cache[id] = { data: event }
        }
        cache[id].checkinQrcodePath = checkinQrcodePath
        cache[id].checkinQrcodeKey = event.checkinQrcodeKey
        saveEventsCache(cache)
      } catch (error) {
        console.error(`[${name}] 签到码下载失败:`, error)
      }
    }

    // 更新 event 对象
    if (checkinQrcodePath) {
      event.checkinQrcode = checkinQrcodePath
    }
  }
}

/**
 * 在后台下载活动图片（串行或并发）
 * @param {Array} eventsData - 活动数据数组
 * @param {Function} onImageReady - 图片下载完成回调
 */
async function downloadEventImagesBackground(eventsData, onImageReady) {
  if (eventsData.length === 0) return

  console.log(`开始下载 ${eventsData.length} 个活动图片`)

  const concurrency = DATA_SOURCE_CONFIG.imageConcurrency || 5

  if (concurrency === 1) {
    // 串行下载
    for (const event of eventsData) {
      await downloadEventImages(event, onImageReady)
    }
  } else {
    // 并发下载
    const queue = [...eventsData]
    const workers = []

    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const event = queue.shift()
          if (event) {
            await downloadEventImages(event, onImageReady)
          }
        }
      })())
    }

    await Promise.all(workers)
  }

  console.log('活动图片下载完成')
}

module.exports = {
  getEventsFromCache,
  getEventsDataSync,
  fetchFeishuEventsText,
  downloadEventImagesBackground,
  downloadEventImages,  // 导出供详情页使用
  downloadImageByKey,   // 导出供详情页下载剩余图片使用
  calculateEventStatus  // 导出供编辑页保存后本地更新状态使用
}
