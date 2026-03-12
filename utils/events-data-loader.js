// utils/events-data-loader.js
// 活动数据加载器 - 从飞书 Base 加载星享会和午餐会数据

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { downloadImageByKey } = require('./image-downloader.js')
const { createCacheManager, isRecordChanged } = require('./text-cache.js')
const { getCached, getImage, prefetchImages, evict } = require('./image-cache.js')

// ─── 本地缓存：基于 record_id + Last Modified Date 增量更新 ─────────────────
const CACHE_KEY = 'events_cache_v1'
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

  const imageKeyStr = fields[mapping.imageKey] || ''
  const imageKeys = imageKeyStr ? imageKeyStr.split(',').map(k => k.trim()).filter(k => k) : []
  const checkinQrcodeKey = fields[mapping.checkinQrcodeKey] || ''

  // 解析云存储 fileID（多个用逗号分隔）
  const cloudImageFileIDStr = fields[mapping.cloudImageFileID] || ''
  const cloudImageFileIDs = cloudImageFileIDStr ? cloudImageFileIDStr.split(',').map(k => k.trim()).filter(k => k) : []
  const cloudCheckinQrcodeFileID = fields[mapping.cloudCheckinQrcodeFileID] || ''

  return {
    id: record.record_id,
    name: fields[mapping.name] || '',
    type: eventType,
    organizer: fields[mapping.organizer] || '',
    time: startTime,
    endTime: endTime,
    employeeId: fields[mapping.employeeId] || '',
    status: autoStatus,
    imageKeys: imageKeys,
    imageKey: imageKeys[0] || '',
    cloudImageFileIDs: cloudImageFileIDs,  // 新增：云存储 fileID 数组
    cloudCheckinQrcodeFileID: cloudCheckinQrcodeFileID,  // 新增：签到码云存储 fileID
    images: [],
    image: '',
    checkinQrcodeKey: checkinQrcodeKey,
    checkinQrcode: '',
    address: fields[mapping.address] || '',
    latitude: fields[mapping.latitude] ? parseFloat(fields[mapping.latitude]) : null,
    longitude: fields[mapping.longitude] ? parseFloat(fields[mapping.longitude]) : null,
    lastModified: String(fields[mapping.lastModifiedDate] || '')
  }
}

// ─── 辅助：从 imageKeys 构建图片路径（使用统一缓存层）────────────────────────

function _buildImages(imageKeys) {
  if (!imageKeys || imageKeys.length === 0) return { images: [], image: '', loaded: true }
  const images = imageKeys.map(k => getCached(k) || '').filter(p => p)
  return { images, image: images[0] || '', loaded: images.length > 0 }
}

/**
 * 从本地缓存同步读取活动列表
 */
function getEventsFromCache() {
  const cache = loadEventsCache()
  return Object.values(cache).map(entry => {
    const event = { ...entry.data }
    const { images, image, loaded } = _buildImages(entry.imageKeys)
    event.images = images
    event.image = image
    event.loaded = loaded
    event.checkinQrcode = entry.checkinQrcodeKey ? (getCached(entry.checkinQrcodeKey) || '') : ''
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
  const imageKeyChanged = cache[cacheKey] && (
    JSON.stringify(cache[cacheKey].imageKeys) !== JSON.stringify(transformed.imageKeys)
  )

  if (isTextChanged && cacheKey) changedTextIds.add(cacheKey)
  if (imageKeyChanged && cacheKey) changedImageIds.add(cacheKey)

  if (!isTextChanged && !imageKeyChanged && cache[cacheKey]) {
    // 未变更：复用缓存
    newCache[cacheKey] = cache[cacheKey]
  } else {
    // 有变更：evict 旧的 imageKey（如果 key 变了）
    if (imageKeyChanged) {
      const oldKeys = cache[cacheKey]?.imageKeys || []
      const newKeys = transformed.imageKeys || []
      oldKeys.forEach(k => { if (!newKeys.includes(k)) evict(k) })
      const oldCheckin = cache[cacheKey]?.checkinQrcodeKey
      if (oldCheckin && oldCheckin !== transformed.checkinQrcodeKey) evict(oldCheckin)
    }
    newCache[cacheKey] = {
      lastModified,
      data: { ...transformed },
      imageKeys: transformed.imageKeys,
      checkinQrcodeKey: transformed.checkinQrcodeKey
    }
  }

  const { images, image, loaded } = _buildImages(transformed.imageKeys)
  return {
    ...transformed,
    images,
    image,
    checkinQrcode: transformed.checkinQrcodeKey ? (getCached(transformed.checkinQrcodeKey) || '') : '',
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
  const { id, name, imageKeys, cloudImageFileIDs } = event

  if (imageKeys && imageKeys.length > 0) {
    const endIndex = downloadAll ? imageKeys.length : 1
    for (let i = Math.max(0, startIndex); i < endIndex; i++) {
      try {
        const cloudFileID = cloudImageFileIDs && cloudImageFileIDs[i]
        if (!cloudFileID) {
          console.warn(`[${name}] 图片 ${i + 1} 没有 cloudFileID，跳过`)
          continue
        }
        const path = await getImage(cloudFileID)
        if (onImageReady) onImageReady(id, path)
      } catch (error) {
        console.error(`[${name}] 图片 ${i + 1} 下载失败:`, error)
      }
    }
    const { images, image, loaded } = _buildImages(imageKeys)
    event.images = images
    event.image = image
    event.loaded = loaded
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
  const keyToEventId = new Map()

  eventsData.forEach(event => {
    const firstKey = event.imageKeys && event.imageKeys[0]
    const firstCloudFileID = event.cloudImageFileIDs && event.cloudImageFileIDs[0]
    if (firstKey) {
      imageItems.push({
        imageKey: firstKey,
        cloudFileID: firstCloudFileID || null
      })
      keyToEventId.set(firstKey, event.id)
    }
  })

  await prefetchImages(imageItems, (imageKey, localPath) => {
    const eventId = keyToEventId.get(imageKey)
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
