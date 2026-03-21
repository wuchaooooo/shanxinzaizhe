// utils/profile-loader.js
// 从新表加载所有合伙人数据

const { getAllProfileRecords, extractFieldText, feishuDateToYYYYMM } = require('./profile-edit-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { getImage, evict, fileIDToCdnUrl } = require('./image-cache.js')
const { createCacheManager, isRecordChanged } = require('./text-cache.js')

// ─── 文字缓存配置 ─────────────────────────────────────────────────────────────
const CACHE_VERSION = 'v1'
const CACHE_KEY = `profiles_cache_${CACHE_VERSION}`
const cacheManager = createCacheManager(CACHE_KEY)

// ─── 数据解析工具 ─────────────────────────────────────────────────────────────

function parseToArray(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {}
  return [str]
}

function parseBadges(data) {
  if (!data) return []
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        icon: index % 2 === 0 ? '🏆' : '🎖️',
        title: item.title || '',
        desc: item.desc || '',
        color: index % 2 === 0 ? 'amber' : 'blue'
      }))
    }
  } catch (e) {}
  return []
}

function parseTimeline(data) {
  if (!data) return []
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      const items = parsed.map(item => {
        const timeStart = item.timeStart || ''
        const timeEnd = item.timeEnd || ''
        const timeDisplay = timeEnd
          ? timeStart.slice(0, 7) + ' ~ ' + timeEnd.slice(0, 7)
          : timeStart
        return { time: timeDisplay, title: item.title || '', desc: item.desc || '', _sortKey: timeStart }
      })
      items.sort((a, b) => {
        if (!a._sortKey || !b._sortKey) return 0
        return b._sortKey.localeCompare(a._sortKey)
      })
      return items
    }
  } catch (e) {}
  return []
}

function parseIsInstructor(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    return lower === 'true' || lower === '是' || lower === 'yes' || lower === '1'
  }
  return false
}

// ─── 同步工具 ─────────────────────────────────────────────────────────────────

function getProfilesDataSync() {
  const app = getApp()
  if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
    return app.globalData.partnersData
  }
  return []
}

// ─── 核心：加载文字数据 ───────────────────────────────────────────────────────

/**
 * 从飞书加载所有合伙人数据（仅文字，不下载图片）。
 * 图片路径通过 image-cache.js 的 getCached(cloudFileID) 同步获取。
 * @returns {Promise<{profiles: Array, changedIds: Set, changedImageIds: Set}>}
 */
async function loadAllProfilesText() {
  const records = await getAllProfileRecords()
  const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping
  const cache = cacheManager.get()
  const newCache = {}
  const changedTextIds = new Set()
  const changedImageIds = new Set()
  const currentEmployeeIds = new Set()

  const results = records.map((record) => {
    const f = record.fields
    const employeeId = extractFieldText(f[mapping.employeeId])
    const name = extractFieldText(f[mapping.name])

    // 解析 cloudFileID（支持 JSON 数组格式和字符串格式）
    const parseCloudFileID = (fieldValue) => {
      const str = (extractFieldText(fieldValue) || '').trim()
      if (!str) return ''

      // 尝试解析 JSON 数组
      try {
        const parsed = JSON.parse(str)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 取第一个元素并清理
          return String(parsed[0]).trim().replace(/^[\["\s]+|[\]"\s]+$/g, '')
        }
      } catch (e) {
        // 不是 JSON，直接使用字符串
      }

      // 兼容旧格式：直接使用字符串
      return str.replace(/^[\["\s]+|[\]"\s]+$/g, '')
    }

    const cloudImageFileID = parseCloudFileID(f[mapping.cloudImageFileID])
    const cloudQrcodeFileID = parseCloudFileID(f[mapping.cloudQrcodeFileID])
    const lastModified = String(f[mapping.lastModifiedDate] || '')
    const cacheKey = employeeId || record.record_id || ''

    const isTextChanged = isRecordChanged(cache, cacheKey, lastModified)
    const oldCloudImageFileID = cache[cacheKey]?.cloudImageFileID || ''
    const oldCloudQrcodeFileID = cache[cacheKey]?.cloudQrcodeFileID || ''
    const hasImageChanged = (cloudImageFileID && cloudImageFileID !== oldCloudImageFileID) || (cloudQrcodeFileID && cloudQrcodeFileID !== oldCloudQrcodeFileID)

    if (isTextChanged && cacheKey) changedTextIds.add(cacheKey)
    if (hasImageChanged && cacheKey) {
      changedImageIds.add(cacheKey)
      // fileID 变了，清除旧缓存（让 image-cache 重新下载）
      if (oldCloudImageFileID && oldCloudImageFileID !== cloudImageFileID) evict(oldCloudImageFileID)
      if (oldCloudQrcodeFileID && oldCloudQrcodeFileID !== cloudQrcodeFileID) evict(oldCloudQrcodeFileID)
    }

    // 记录当前存在的 employeeId
    if (cacheKey) currentEmployeeIds.add(cacheKey)

    // 更新文字缓存（只存文字元数据 + cloudFileID，不存路径）
    newCache[cacheKey] = { lastModified, cloudImageFileID, cloudQrcodeFileID }

    return {
      employeeId,
      name,
      school: parseToArray(extractFieldText(f[mapping.school])),
      title: parseToArray(extractFieldText(f[mapping.title])),
      joinDate: feishuDateToYYYYMM(f[mapping.joinDate]),
      customersServed: extractFieldText(f[mapping.customersServed]),
      bio: extractFieldText(f[mapping.bio]),
      badges: parseBadges(extractFieldText(f[mapping.badges])),
      timeline: parseTimeline(extractFieldText(f[mapping.timeline])),
      activities: parseTimeline(extractFieldText(f[mapping.activities])),
      skills: parseToArray(extractFieldText(f[mapping.skills])),
      isInstructor: parseIsInstructor(f[mapping.isInstructor]),
      wxOpenid: extractFieldText(f[mapping.wxOpenid]),
      cloudImageFileID,
      cloudQrcodeFileID,
      image: fileIDToCdnUrl(cloudImageFileID) || '',
      qrcode: '',
      loaded: !!fileIDToCdnUrl(cloudImageFileID)
    }
  })

  // 检测被删除的成员（在旧缓存中存在但在新数据中不存在）
  // 注意：自动删除云存储文件有误删风险（飞书 API 返回不完整时会误判），已禁用。
  // 如需手动清理，请在云开发控制台操作。
  const deletedEmployeeIds = Object.keys(cache).filter(id => !currentEmployeeIds.has(id))
  if (deletedEmployeeIds.length > 0) {
    console.log(`[飞书数据源] 检测到 ${deletedEmployeeIds.length} 个本地缓存中多余的条目（可能是已删除成员或缓存遗留），仅更新本地缓存，不自动删除云存储文件:`, deletedEmployeeIds)
  }

  cacheManager.save(newCache)

  const incompleteProfiles = results.filter(r => r.wxOpenid && !r.employeeId)
  if (incompleteProfiles.length > 0) {
    console.log(`发现 ${incompleteProfiles.length} 条未完善资料:`, incompleteProfiles.map(p => ({ wxOpenid: p.wxOpenid })))
  }

  console.log(`[飞书数据源] 加载${results.length}条 | 文字变更${changedTextIds.size}条 | 图片变更${changedImageIds.size}条`)

  const changedIds = new Set([...changedTextIds, ...changedImageIds])
  return { profiles: results, changedIds, changedImageIds }
}

/**
 * 确保指定用户的二维码已下载（按需下载入口）。
 * @param {string} employeeId
 * @returns {Promise<string|null>}
 */
async function ensureQrcodeDownloaded(employeeId) {
  if (!employeeId) return null

  const app = getApp()
  const profile = (app.globalData.partnersData || []).find(p => p.employeeId === employeeId)
  if (!profile) {
    console.error(`[ensureQrcodeDownloaded] 未找到 employeeId=${employeeId}`)
    return null
  }
  if (!profile.cloudQrcodeFileID) {
    console.warn(`[ensureQrcodeDownloaded] ${profile.name} 没有 cloudQrcodeFileID`)
    return null
  }

  try {
    const path = await getImage(profile.cloudQrcodeFileID)
    profile.qrcode = path
    return path
  } catch (err) {
    console.error(`[${profile.name}] 二维码下载失败:`, err)
    return null
  }
}

module.exports = {
  loadAllProfilesText,
  getProfilesDataSync,
  ensureQrcodeDownloaded
}
