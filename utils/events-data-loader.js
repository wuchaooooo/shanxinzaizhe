// utils/events-data-loader.js
// 活动数据加载器 - 从飞书 Base 加载星享会和午餐会数据

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { downloadImageByKey } = require('./image-downloader.js')
const { createCacheManager, isRecordChanged } = require('./text-cache.js')
const { getCached, getImage, prefetchImages, evict } = require('./image-cache.js')

// ─── 本地缓存：基于 record_id + Last Modified Date 增量更新 ─────────────────
const CACHE_KEY = 'events_cache_v2'  // 升级到 v2：使用 cloudFileID 而非 imageKey
const cacheManager = createCacheManager(CACHE_KEY)

function loadEventsCache() { return cacheManager.get() }
function saveEventsCache(cache) { cacheManager.save(cache) }

/**
 * 根据开始时间和结束时间计算活动状态
 */
function calculateEventStatus(startTime, endTime) {
  if (!startTime) return '即将开始'

  const now = new Date()
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : null

  if (now < start) return '即将开始'
  if (end) {
    if (now >= end) return '已结束'
    return '进行中'
  }
  return '进行中'
}

/**
 * 将飞书记录转换为本地数据格式
 */
function transformFeishuEventRecord(record, eventType) {
  const fields = record.fields
  const mapping = DATA_SOURCE_CONFIG.eventsFieldMapping

  const parseTime = (timestamp) => {
    if (!timestamp) return ''
    try { return new Date(timestamp).toISOString() } catch (e) { return String(timestamp) }
  }

  const startTime = parseTime(fields[mapping.time])
  const endTime = parseTime(fields[mapping.endTime])
  const autoStatus = calculateEventStatus(startTime, endTime)

  // 解析云存储 fileID（JSON 数组格式）
  const cloudImageFileIDStr = fields[mapping.cloudImageFileID] || ''
  let cloudImageFileIDs = []
  if (cloudImageFileIDStr) {
    try {
      // 尝试解析 JSON 数组
      const parsed = JSON.parse(cloudImageFileIDStr)
      // 清理每个 fileID 的空格和换行符，并移除可能的 JSON 数组标记
      cloudImageFileIDs = Array.isArray(parsed)
        ? parsed.map(id => {
            // 清理 fileID：移除可能的引号、方括号等
            const cleanId = String(id).trim().replace(/^[\["\s]+|[\]"\s]+$/g, '')
            return cleanId
          }).filter(id => id)
        : []

      console.log(`[活动数据] 解析 cloudImageFileIDs:`, {
        原始: cloudImageFileIDStr,
        解析后: cloudImageFileIDs
      })
    } catch (e) {
      console.warn(`[活动数据] JSON 解析失败，使用逗号分隔格式:`, cloudImageFileIDStr)
      // 兼容旧格式：逗号分隔的字符串
      cloudImageFileIDs = cloudImageFileIDStr.split(',').map(k => k.trim()).filter(k => k)
    }
  }

  // 解析签到码 fileID（支持 JSON 数组格式和字符串格式）
  const cloudCheckinQrcodeFileIDStr = fields[mapping.cloudCheckinQrcodeFileID] || ''
  let cloudCheckinQrcodeFileID = ''
  if (cloudCheckinQrcodeFileIDStr) {
    try {
      // 尝试解析 JSON 数组
      const parsed = JSON.parse(cloudCheckinQrcodeFileIDStr)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 取第一个元素并清理
        cloudCheckinQrcodeFileID = String(parsed[0]).trim().replace(/^[\["\s]+|[\]"\s]+$/g, '')
      }
    } catch (e) {
      // 不是 JSON，直接使用字符串
      cloudCheckinQrcodeFileID = cloudCheckinQrcodeFileIDStr.trim().replace(/^[\["\s]+|[\]"\s]+$/g, '')
    }
  }

  return {
    id: record.record_id,
    name: fields[mapping.name] || '',
    type: eventType,
    organizer: fields[mapping.organizer] || '',
    time: startTime,
    endTime: endTime,
    employeeId: fields[mapping.employeeId] || '',
    status: autoStatus,
    cloudImageFileIDs: cloudImageFileIDs,
    cloudCheckinQrcodeFileID: cloudCheckinQrcodeFileID,
    images: [],
    image: '',
    checkinQrcode: '',
    address: fields[mapping.address] || '',
    latitude: fields[mapping.latitude] ? parseFloat(fields[mapping.latitude]) : null,
    longitude: fields[mapping.longitude] ? parseFloat(fields[mapping.longitude]) : null,
    lastModified: String(fields[mapping.lastModifiedDate] || '')
  }
}

// ─── 辅助：从 cloudFileIDs 构建图片路径（使用统一缓存层）────────────────────────

function _buildImages(cloudFileIDs) {
  if (!cloudFileIDs || cloudFileIDs.length === 0) return { images: [], image: '', loaded: true }
  const images = cloudFileIDs.map(fileID => getCached(fileID) || '').filter(p => p)
  return { images, image: images[0] || '', loaded: images.length > 0 }
}

/**
 * 从本地缓存同步读取活动列表
 */
function getEventsFromCache() {
  const cache = loadEventsCache()
  return Object.values(cache).map(entry => {
    const event = { ...entry.data }
    const { images, image, loaded } = _buildImages(entry.cloudImageFileIDs)
    event.images = images
    event.image = image
    event.loaded = loaded
    event.checkinQrcode = entry.cloudCheckinQrcodeFileID ? (getCached(entry.cloudCheckinQrcodeFileID) || '') : ''
    return event
  }).sort((a, b) => {
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
 */
function processEventRecord(record, eventType, cache, newCache, changedTextIds, changedImageIds) {
  const cacheKey = record.record_id
  const transformed = transformFeishuEventRecord(record, eventType)
  const lastModified = transformed.lastModified

  const isTextChanged = isRecordChanged(cache, cacheKey, lastModified)
  const imageChanged = cache[cacheKey] && (
    JSON.stringify(cache[cacheKey].cloudImageFileIDs) !== JSON.stringify(transformed.cloudImageFileIDs)
  )

  if (isTextChanged && cacheKey) changedTextIds.add(cacheKey)
  if (imageChanged && cacheKey) changedImageIds.add(cacheKey)

  if (!isTextChanged && !imageChanged && cache[cacheKey]) {
    // 未变更：复用缓存
    newCache[cacheKey] = cache[cacheKey]
  } else {
    // 有变更：evict 旧的 fileID（如果 fileID 变了）
    if (imageChanged) {
      const oldFileIDs = cache[cacheKey]?.cloudImageFileIDs || []
      const newFileIDs = transformed.cloudImageFileIDs || []
      oldFileIDs.forEach(fileID => { if (!newFileIDs.includes(fileID)) evict(fileID) })
      const oldCheckinFileID = cache[cacheKey]?.cloudCheckinQrcodeFileID
      if (oldCheckinFileID && oldCheckinFileID !== transformed.cloudCheckinQrcodeFileID) evict(oldCheckinFileID)
    }
    newCache[cacheKey] = {
      lastModified,
      data: { ...transformed },
      cloudImageFileIDs: transformed.cloudImageFileIDs,
      cloudCheckinQrcodeFileID: transformed.cloudCheckinQrcodeFileID
    }
  }

  const { images, image, loaded } = _buildImages(transformed.cloudImageFileIDs)
  return {
    ...transformed,
    images,
    image,
    checkinQrcode: transformed.cloudCheckinQrcodeFileID ? (getCached(transformed.cloudCheckinQrcodeFileID) || '') : '',
    loaded
  }
}

/**
 * 获取飞书活动数据，从五张表格合并数据
 * @returns {{ events: Array, hasChanges: boolean, changedIds: Set, changedImageIds: Set }}
 */
async function fetchFeishuEventsText() {
  try {
    const config = feishuApi.FEISHU_CONFIG
    const cache = loadEventsCache()
    const newCache = {}
    const changedTextIds = new Set()
    const changedImageIds = new Set()

    const [starClubRecords, lunchRecords, salesClinicRecords, salesBuildingRecords, otherActivitiesRecords] = await Promise.all([
      feishuApi.getAllRecords({ appToken: config.starClubAppToken, tableId: config.starClubTableId }),
      feishuApi.getAllRecords({ appToken: config.lunchAppToken, tableId: config.lunchTableId }),
      feishuApi.getAllRecords({ appToken: config.salesClinicAppToken, tableId: config.salesClinicTableId }),
      feishuApi.getAllRecords({ appToken: config.salesBuildingAppToken, tableId: config.salesBuildingTableId }),
      feishuApi.getAllRecords({ appToken: config.otherActivitiesAppToken, tableId: config.otherActivitiesTableId })
    ])

    const allEvents = [
      ...starClubRecords.map(r => processEventRecord(r, '星享会', cache, newCache, changedTextIds, changedImageIds)),
      ...lunchRecords.map(r => processEventRecord(r, '午餐会', cache, newCache, changedTextIds, changedImageIds)),
      ...salesClinicRecords.map(r => processEventRecord(r, '销售门诊', cache, newCache, changedTextIds, changedImageIds)),
      ...salesBuildingRecords.map(r => processEventRecord(r, '销售建设', cache, newCache, changedTextIds, changedImageIds)),
      ...otherActivitiesRecords.map(r => processEventRecord(r, '客户活动', cache, newCache, changedTextIds, changedImageIds))
    ]

    // 去重（基于 record_id）
    const eventsMap = new Map()
    allEvents.forEach(event => {
      if (eventsMap.has(event.id)) {
        console.warn(`发现重复记录 ID: ${event.id}，已跳过`)
      } else {
        eventsMap.set(event.id, event)
      }
    })

    const events = Array.from(eventsMap.values()).sort((a, b) => {
      if (!a.time || !b.time) return 0
      return new Date(b.time) - new Date(a.time)
    })

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
 * 下载单个活动的图片
 * @param {Object} event
 * @param {Function} onImageReady - (eventId, path) => void
 * @param {boolean} downloadAll - false=只下载第一张（列表页），true=全部（详情页）
 * @param {number} startIndex
 */
async function downloadEventImages(event, onImageReady, downloadAll = false, startIndex = 0) {
  const { id, name, cloudImageFileIDs } = event

  if (cloudImageFileIDs && cloudImageFileIDs.length > 0) {
    const endIndex = downloadAll ? cloudImageFileIDs.length : 1
    const downloadedPaths = []

    for (let i = Math.max(0, startIndex); i < endIndex; i++) {
      try {
        const cloudFileID = cloudImageFileIDs[i]
        if (!cloudFileID) {
          console.warn(`[${name}] 图片 ${i + 1} 没有 cloudFileID，跳过`)
          continue
        }
        const path = await getImage(cloudFileID)
        downloadedPaths.push(path)
        console.log(`[${name}] 图片 ${i + 1}/${endIndex} 下载成功: ${path}`)
        if (onImageReady) onImageReady(id, path)
      } catch (error) {
        console.error(`[${name}] 图片 ${i + 1} 下载失败:`, error)
      }
    }

    // 直接使用下载的路径，而不是从缓存重建
    event.images = downloadedPaths
    event.image = downloadedPaths[0] || ''
    event.loaded = downloadedPaths.length > 0

    console.log(`[${name}] 下载完成，共 ${downloadedPaths.length} 张图片`)
  }

  if (downloadAll && event.cloudCheckinQrcodeFileID) {
    try {
      event.checkinQrcode = await getImage(event.cloudCheckinQrcodeFileID)
    } catch (error) {
      console.error(`[${name}] 签到码下载失败:`, error)
    }
  }
}

/**
 * 在后台批量下载活动图片（列表页：每个活动只下载第一张）
 */
async function downloadEventImagesBackground(eventsData, onImageReady) {
  if (eventsData.length === 0) return

  const imageItems = []
  const fileIDToEventId = new Map()

  eventsData.forEach(event => {
    const firstCloudFileID = event.cloudImageFileIDs && event.cloudImageFileIDs[0]
    if (firstCloudFileID) {
      imageItems.push({
        imageKey: firstCloudFileID,  // prefetchImages 需要这个字段名
        cloudFileID: firstCloudFileID
      })
      fileIDToEventId.set(firstCloudFileID, event.id)
    }
  })

  await prefetchImages(imageItems, (fileID, localPath) => {
    const eventId = fileIDToEventId.get(fileID)
    if (eventId && onImageReady) onImageReady(eventId, localPath)
  }, DATA_SOURCE_CONFIG.imageConcurrency || 10)
}

module.exports = {
  getEventsFromCache,
  getEventsDataSync,
  fetchFeishuEventsText,
  downloadEventImagesBackground,
  downloadEventImages,
  downloadImageByKey,   // re-export 供详情页使用
  calculateEventStatus
}
