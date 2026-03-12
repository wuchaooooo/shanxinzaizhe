// utils/profile-loader.js
// 从新表加载所有合伙人数据

const { getAllProfileRecords, extractFieldText, feishuDateToYYYYMM } = require('./profile-edit-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { getCached, getImage, prefetchImages, evict } = require('./image-cache.js')
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
      // 图片路径：头像从缓存同步获取，二维码延迟到详情页再加载
      image: getCached(cloudImageFileID) || '',
      qrcode: '',  // 二维码不在启动时检查缓存，按需加载
      loaded: false
    }
  })

  cacheManager.save(newCache)

  const incompleteProfiles = results.filter(r => r.wxOpenid && !r.employeeId)
  if (incompleteProfiles.length > 0) {
    console.log(`发现 ${incompleteProfiles.length} 条未完善资料:`, incompleteProfiles.map(p => ({ wxOpenid: p.wxOpenid })))
  }

  console.log(`[飞书] 加载${results.length}条 | 文字变更${changedTextIds.size}条 | 图片变更${changedImageIds.size}条`)

  const changedIds = new Set([...changedTextIds, ...changedImageIds])
  return { profiles: results, changedIds, changedImageIds }
}

// ─── 图片下载 ─────────────────────────────────────────────────────────────────

/**
 * 后台批量下载合伙人头像。
 * 通过 image-cache.js 的 prefetchImages 统一管理，已缓存的自动跳过。
 * @param {Array} profiles - 需要下载图片的合伙人列表
 * @param {Function} onImageReady - (type, path, employeeId, name) => void
 * @param {number} concurrency
 */
async function downloadAllProfileImages(profiles, onImageReady, concurrency = 10) {
  if (!profiles || profiles.length === 0) return

  // 只收集头像，二维码按需下载（详情页或海报生成时）
  const fileIDToProfile = {}
  const avatarItems = []

  profiles.forEach(p => {
    if (p.cloudImageFileID) {
      fileIDToProfile[p.cloudImageFileID] = { profile: p, type: 'avatar' }
      avatarItems.push({
        cloudFileID: p.cloudImageFileID
      })
    }
  })

  if (avatarItems.length === 0) return

  console.log(`[飞书] 开始下载: 头像${avatarItems.length}张`)

  await prefetchImages(avatarItems, (fileID, localPath) => {
    const item = fileIDToProfile[fileID]
    if (!item || !onImageReady) return
    const { profile, type } = item
    onImageReady(type, profile.employeeId, localPath)
  }, concurrency)

  console.log('[飞书] 团队图片下载完成')
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

// ─── 存储诊断工具 ─────────────────────────────────────────────────────────────

async function getStorageInfo() {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getSavedFileList({
      success: (res) => {
        const totalSize = res.fileList.reduce((sum, file) => sum + file.size, 0)
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
        const usagePercent = ((totalSize / (200 * 1024 * 1024)) * 100).toFixed(2)
        const info = { totalSize, totalSizeMB, fileCount: res.fileList.length, limitMB: 200, usagePercent, fileList: res.fileList }
        console.log(`[存储空间] 已使用: ${totalSizeMB}MB / 200MB (${usagePercent}%), 文件数: ${res.fileList.length}`)
        resolve(info)
      },
      fail: () => resolve({ totalSize: 0, totalSizeMB: '0', fileCount: 0, limitMB: 200, usagePercent: '0' })
    })
  })
}

function getImageFilesInfo() {
  const fs = wx.getFileSystemManager()
  const userDataPath = wx.env.USER_DATA_PATH
  try {
    const files = fs.readdirSync(userDataPath)
    const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
    const fileDetails = []
    let totalSize = 0
    imageFiles.forEach(fileName => {
      const filePath = `${userDataPath}/${fileName}`
      try {
        const stats = fs.statSync(filePath)
        fileDetails.push({ fileName, filePath, size: stats.size, sizeKB: (stats.size / 1024).toFixed(2), sizeMB: (stats.size / 1024 / 1024).toFixed(2) })
        totalSize += stats.size
      } catch (e) {}
    })
    fileDetails.sort((a, b) => b.size - a.size)
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
    const usagePercent = ((totalSize / (200 * 1024 * 1024)) * 100).toFixed(2)
    console.log(`[图片文件] 共${imageFiles.length}个, ${totalSizeMB}MB (${usagePercent}%)`)
    return { totalSize, totalSizeMB, fileCount: imageFiles.length, limitMB: 200, usagePercent, files: fileDetails }
  } catch (e) {
    return { totalSize: 0, totalSizeMB: '0', fileCount: 0, limitMB: 200, usagePercent: '0', files: [] }
  }
}

module.exports = {
  loadAllProfilesText,
  downloadAllProfileImages,
  getProfilesDataSync,
  getStorageInfo,
  getImageFilesInfo,
  ensureQrcodeDownloaded
}
