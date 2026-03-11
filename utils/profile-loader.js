// utils/new-profile-loader.js
// 从新表加载所有合伙人数据

const { getAllProfileRecords, extractFieldText, feishuDateToYYYYMM } = require('./profile-edit-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { downloadImageByKey } = require('./image-downloader.js')
const {
  createCacheManager,
  isRecordChanged,
  isImageKeyChanged,
  restoreImagePaths,
  updateCacheEntry
} = require('./cache-helper.js')

// ─── 缓存配置 ────────────────────────────────────────────────────────────
const CACHE_VERSION = 'v1'
const CACHE_KEY = `profiles_cache_${CACHE_VERSION}`
const cacheManager = createCacheManager(CACHE_KEY)

/**
 * 从新表缓存读取图片路径映射（用于恢复图片路径）
 * 注意：新表缓存只存储元数据，不存储完整数据
 * @returns {Object} employeeId -> {image, qrcode} 的映射
 */
function getProfilesFromCache() {
  const cache = cacheManager.get()
  const fs = wx.getFileSystemManager()
  const imageMap = {}

  Object.entries(cache).forEach(([employeeId, entry]) => {
    imageMap[employeeId] = {
      image: '',
      qrcode: ''
    }

    // 验证并恢复图片路径
    if (entry.imagePath) {
      try {
        fs.accessSync(entry.imagePath)
        imageMap[employeeId].image = entry.imagePath
      } catch (e) {
        // 文件不存在
      }
    }

    if (entry.qrcodePath) {
      try {
        fs.accessSync(entry.qrcodePath)
        imageMap[employeeId].qrcode = entry.qrcodePath
      } catch (e) {
        // 文件不存在
      }
    }
  })

  console.log(`[新表缓存] 加载 ${Object.keys(cache).length} 条图片路径`)
  return imageMap
}

/**
 * 同步获取合伙人数据（从 globalData 读取）
 * @returns {Array} 合伙人数据数组
 */
function getProfilesDataSync() {
  const app = getApp()
  if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
    return app.globalData.partnersData
  }
  return []
}

// 解析 JSON 数组
function parseToArray(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {}
  // 如果不是 JSON 数组，返回单元素数组
  return [str]
}

// 解析徽章数据
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

// 解析时间线数据
function parseTimeline(data) {
  if (!data) return []
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      const items = parsed.map(item => {
        const timeStart = item.timeStart || ''
        const timeEnd = item.timeEnd || ''
        let timeDisplay

        // 如果有结束时间，显示 YYYY-MM ~ YYYY-MM
        // 如果只有开始时间，显示完整的 YYYY-MM-DD
        if (timeEnd) {
          timeDisplay = timeStart.slice(0, 7) + ' ~ ' + timeEnd.slice(0, 7)
        } else {
          timeDisplay = timeStart
        }

        return {
          time: timeDisplay,
          title: item.title || '',
          desc: item.desc || '',
          _sortKey: timeStart
        }
      })
      // 按时间倒序排列（最新的在前面）
      items.sort((a, b) => {
        if (!a._sortKey || !b._sortKey) return 0
        return b._sortKey.localeCompare(a._sortKey)
      })
      return items
    }
  } catch (e) {}
  return []
}

// 解析是否为讲师字段
function parseIsInstructor(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    return lower === 'true' || lower === '是' || lower === 'yes' || lower === '1'
  }
  return false
}

/**
 * 从新表加载所有合伙人数据（仅文本数据，不下载图片）
 * 使用 lastModified 检测文字变化，imageKey 检测图片变化
 * @returns {Promise<{profiles: Array, changedIds: Set, changedImageIds: Set}>} - 返回处理后的合伙人数据数组、文字变化的ID集合、图片变化的ID集合
 */
async function loadAllProfilesText() {
  const records = await getAllProfileRecords()
  const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping
  const cache = cacheManager.get()
  const newCache = {}
  const changedTextIds = new Set()  // 文字数据变化的记录
  const changedImageIds = new Set()  // 图片key变化的记录

  const results = records.map((record) => {
    const f = record.fields
    const employeeId = extractFieldText(f[mapping.employeeId])
    const name = extractFieldText(f[mapping.name])
    const schoolData = extractFieldText(f[mapping.school])
    const titleData = extractFieldText(f[mapping.title])
    const joinDate = feishuDateToYYYYMM(f[mapping.joinDate])
    const customersServed = extractFieldText(f[mapping.customersServed])
    const bio = extractFieldText(f[mapping.bio])
    const badgesData = extractFieldText(f[mapping.badges])
    const timelineData = extractFieldText(f[mapping.timeline])
    const activitiesData = extractFieldText(f[mapping.activities])
    const skillsData = extractFieldText(f[mapping.skills])
    const isInstructor = parseIsInstructor(f[mapping.isInstructor])
    const wxOpenid = extractFieldText(f[mapping.wxOpenid])
    const imageKey = extractFieldText(f[mapping.imageKey])
    const qrcodeKey = extractFieldText(f[mapping.qrcodeKey])
    const lastModified = String(f[mapping.lastModifiedDate] || '')

    // 使用 employeeId 作为缓存 key（如果没有则用 record_id）
    const cacheKey = employeeId || record.record_id || ''

    // 检查文字数据是否有变化（基于 lastModified）
    const isTextChanged = isRecordChanged(cache, cacheKey, lastModified)

    // 检查图片 key 是否变化（检查头像和二维码）
    const avatarKeyChanged = isImageKeyChanged(cache, cacheKey, imageKey)
    const qrcodeKeyChanged = cacheKey && cache[cacheKey] && cache[cacheKey].qrcodeKey !== qrcodeKey
    const hasImageKeyChanged = avatarKeyChanged || qrcodeKeyChanged

    const transformed = {
      employeeId,
      name,
      school: parseToArray(schoolData),
      title: parseToArray(titleData),
      joinDate,
      customersServed,
      bio,
      badges: parseBadges(badgesData),
      timeline: parseTimeline(timelineData),
      activities: parseTimeline(activitiesData),
      skills: parseToArray(skillsData),
      isInstructor,
      wxOpenid,
      imageKey,
      qrcodeKey,
      image: '',
      qrcode: '',
      loaded: false
    }

    // 分别记录文字变化和图片变化
    if (isTextChanged && cacheKey) {
      changedTextIds.add(cacheKey)
    }
    if (hasImageKeyChanged && cacheKey) {
      changedImageIds.add(cacheKey)
    }

    if (isTextChanged || hasImageKeyChanged || !cache[cacheKey]) {
      // 有变化或新记录：更新缓存
      if (cacheKey) {
        newCache[cacheKey] = {
          lastModified,
          imageKey,
          qrcodeKey,
          imagePath: cache[cacheKey]?.imagePath || '',  // 保留旧的图片路径
          qrcodePath: cache[cacheKey]?.qrcodePath || ''
        }
      }

      // 如果只是文字变化，图片key没变，保留缓存的图片路径
      if (isTextChanged && !hasImageKeyChanged && cache[cacheKey]) {
        return {
          ...transformed,
          image: restoreImagePaths(cache, cacheKey, false),
          qrcode: cache[cacheKey].qrcodePath || ''
        }
      }

      return transformed
    } else {
      // 文字和图片key都没变化：复用缓存数据
      newCache[cacheKey] = cache[cacheKey]
      return {
        ...transformed,
        image: restoreImagePaths(cache, cacheKey, false),
        qrcode: cache[cacheKey].qrcodePath || ''
      }
    }
  })

  // 保存新缓存
  cacheManager.save(newCache)

  console.log(`[飞书] 加载${results.length}条 | 文字变更${changedTextIds.size}条 | 图片变更${changedImageIds.size}条`)

  // 只记录未完善的资料
  const incompleteProfiles = results.filter(r => r.wxOpenid && !r.employeeId)
  if (incompleteProfiles.length > 0) {
    console.log(`发现 ${incompleteProfiles.length} 条未完善资料:`, incompleteProfiles.map(p => ({ wxOpenid: p.wxOpenid })))
  }

  // 返回文字变化和图片变化的并集（用于通知页面刷新）
  const changedIds = new Set([...changedTextIds, ...changedImageIds])
  return { profiles: results, changedIds, changedImageIds }
}

/**
 * 下载单个合伙人的图片并更新缓存
 * @param {Object} profile - 合伙人数据对象
 * @param {Function} onImageReady - 图片下载完成回调 (type, path) => void，type为'avatar'或'qrcode'
 * @param {boolean} downloadQrcode - 是否下载二维码（默认 true）
 * @returns {Promise<void>}
 */
async function downloadProfileImages(profile, onImageReady, downloadQrcode = true, downloadAvatar = true) {
  const { employeeId, name, imageKey, qrcodeKey } = profile
  const cacheKey = employeeId || ''
  const cache = cacheManager.get()
  const fs = wx.getFileSystemManager()

  // 下载头像（可选）
  if (downloadAvatar && imageKey) {
    try {
      // 删除旧的头像文件（如果存在且路径不同）
      const oldImagePath = cache[cacheKey]?.imagePath

      const path = await downloadImageByKey(imageKey, 'profile_avatar', employeeId)

      // 如果新旧路径不同，删除旧文件
      if (oldImagePath && oldImagePath !== path) {
        try {
          fs.unlinkSync(oldImagePath)
          console.log(`[${name}] 已删除旧头像:`, oldImagePath)
        } catch (e) {
          // 忽略删除失败（文件可能已不存在）
        }
      }

      // 更新缓存中的图片路径和 imageKey
      if (cacheKey && cache[cacheKey]) {
        cache[cacheKey].imagePath = path
        cache[cacheKey].imageKey = imageKey
        cacheManager.save(cache)
      }

      if (onImageReady) onImageReady('avatar', path, employeeId, name)
    } catch (error) {
      console.error(`[${name}] 头像下载失败:`, error)
    }
  }

  // 下载二维码（可选）
  if (downloadQrcode && qrcodeKey) {
    try {
      // 删除旧的二维码文件（如果存在且路径不同）
      const oldQrcodePath = cache[cacheKey]?.qrcodePath

      const path = await downloadImageByKey(qrcodeKey, 'profile_qrcode', employeeId)

      // 如果新旧路径不同，删除旧文件
      if (oldQrcodePath && oldQrcodePath !== path) {
        try {
          fs.unlinkSync(oldQrcodePath)
          console.log(`[${name}] 已删除旧二维码:`, oldQrcodePath)
        } catch (e) {
          // 忽略删除失败
        }
      }

      // 更新缓存中的二维码路径和 qrcodeKey
      if (cacheKey && cache[cacheKey]) {
        cache[cacheKey].qrcodePath = path
        cache[cacheKey].qrcodeKey = qrcodeKey
        cacheManager.save(cache)
      }

      if (onImageReady) onImageReady('qrcode', path, employeeId, name)
    } catch (error) {
      console.error(`[${name}] 二维码下载失败:`, error)
    }
  }
}

/**
 * 后台下载所有合伙人的图片（串行或并发）
 * @param {Array} profiles - 合伙人数据数组
 * @param {Function} onImageReady - 图片下载完成回调
 * @param {number} concurrency - 并发数（1=串行，>1=并发）
 * @param {boolean} downloadQrcode - 是否下载二维码（默认 false，启动时不下载）
 */
async function downloadAllProfileImages(profiles, onImageReady, concurrency = 2, downloadQrcode = false) {
  if (profiles.length === 0) return

  console.log(`开始下载 ${profiles.length} 个合伙人图片${downloadQrcode ? '（含二维码）' : '（仅头像）'}`)

  if (concurrency === 1) {
    // 串行下载
    for (const profile of profiles) {
      await downloadProfileImages(profile, onImageReady, downloadQrcode)
    }
  } else {
    // 并发下载
    const queue = [...profiles]
    const workers = []

    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const profile = queue.shift()
          if (profile) {
            await downloadProfileImages(profile, onImageReady, downloadQrcode)
          }
        }
      })())
    }

    await Promise.all(workers)
  }

  console.log('图片下载完成')
}

/**
 * 获取存储空间使用情况
 * @returns {Promise<Object>} - 返回存储信息
 */
async function getStorageInfo() {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getSavedFileList({
      success: (res) => {
        const totalSize = res.fileList.reduce((sum, file) => sum + file.size, 0)
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
        const fileCount = res.fileList.length
        const limitMB = 200
        const usagePercent = ((totalSize / (limitMB * 1024 * 1024)) * 100).toFixed(2)

        const info = {
          totalSize,
          totalSizeMB,
          fileCount,
          limitMB,
          usagePercent,
          fileList: res.fileList
        }

        console.log(`[存储空间] 已使用: ${totalSizeMB}MB / ${limitMB}MB (${usagePercent}%), 文件数: ${fileCount}`)
        resolve(info)
      },
      fail: () => {
        resolve({ totalSize: 0, totalSizeMB: '0', fileCount: 0, limitMB: 200, usagePercent: '0' })
      }
    })
  })
}

/**
 * 获取 USER_DATA_PATH 中所有图片文件的详细信息
 * @returns {Object} 包含文件列表、总大小等信息
 */
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
        const sizeKB = (stats.size / 1024).toFixed(2)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

        fileDetails.push({
          fileName,
          filePath,
          size: stats.size,
          sizeKB,
          sizeMB,
          modifiedTime: new Date(stats.lastModifiedTime).toLocaleString('zh-CN')
        })

        totalSize += stats.size
      } catch (e) {
        console.error(`[文件信息] 无法读取文件 ${fileName}:`, e)
      }
    })

    // 按文件大小降序排序
    fileDetails.sort((a, b) => b.size - a.size)

    const totalSizeKB = (totalSize / 1024).toFixed(2)
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)
    const limitMB = 200
    const usagePercent = ((totalSize / (limitMB * 1024 * 1024)) * 100).toFixed(2)

    const info = {
      totalSize,
      totalSizeKB,
      totalSizeMB,
      fileCount: imageFiles.length,
      limitMB,
      usagePercent,
      files: fileDetails
    }

    console.log(`\n========== 图片文件存储信息 ==========`)
    console.log(`总文件数: ${imageFiles.length}`)
    console.log(`总大小: ${totalSizeMB}MB (${totalSizeKB}KB)`)
    console.log(`存储限制: ${limitMB}MB`)
    console.log(`使用率: ${usagePercent}%`)
    console.log(`\n文件列表（按大小降序）:`)
    fileDetails.forEach((file, index) => {
      console.log(`${index + 1}. ${file.fileName}`)
      console.log(`   大小: ${file.sizeMB}MB (${file.sizeKB}KB)`)
      console.log(`   修改时间: ${file.modifiedTime}`)
    })
    console.log(`=====================================\n`)

    return info
  } catch (e) {
    console.error('[文件信息] 读取目录失败:', e)
    return {
      totalSize: 0,
      totalSizeKB: '0',
      totalSizeMB: '0',
      fileCount: 0,
      limitMB: 200,
      usagePercent: '0',
      files: []
    }
  }
}

/**
 * 确保指定用户的二维码已下载（统一的二维码下载入口）
 * @param {string} employeeId - 员工ID
 * @returns {Promise<string|null>} - 返回二维码本地路径，失败返回 null
 */
async function ensureQrcodeDownloaded(employeeId) {
  if (!employeeId) {
    console.error('[ensureQrcodeDownloaded] employeeId 不能为空')
    return null
  }

  const app = getApp()
  const partnersData = app.globalData.partnersData || []

  // 1. 查找对应的 profile
  const profile = partnersData.find(p => p.employeeId === employeeId)
  if (!profile) {
    console.error(`[ensureQrcodeDownloaded] 未找到 employeeId=${employeeId} 的用户`)
    return null
  }

  console.log(`[ensureQrcodeDownloaded] 检查用户 ${profile.name} 的二维码`)

  // 2. 检查是否有 qrcodeKey
  if (!profile.qrcodeKey) {
    console.log(`[${profile.name}] 没有 qrcodeKey，无法下载二维码`)
    return null
  }

  // 3. 检查二维码文件是否存在且有效
  if (profile.qrcode) {
    try {
      const fs = wx.getFileSystemManager()
      fs.accessSync(profile.qrcode)
      console.log(`[${profile.name}] 二维码文件验证通过:`, profile.qrcode)
      return profile.qrcode // 文件存在且有效，直接返回
    } catch (e) {
      console.log(`[${profile.name}] 二维码文件已失效，需要重新下载`)
      profile.qrcode = '' // 清空失效的路径
    }
  }

  // 4. 下载二维码
  console.log(`[${profile.name}] 开始下载二维码，qrcodeKey: ${profile.qrcodeKey}`)

  return new Promise((resolve) => {
    downloadProfileImages(
      profile,
      (type, path, empId, name) => {
        if (type === 'qrcode') {
          console.log(`[${name}] 二维码下载完成:`, path)
          // 更新 globalData
          const updatedProfile = partnersData.find(p => p.employeeId === empId)
          if (updatedProfile) {
            updatedProfile.qrcode = path
            console.log(`[${name}] 已更新 globalData.partnersData 中的二维码路径`)
          }
          resolve(path)
        }
      },
      true,  // downloadQrcode = true
      false  // downloadAvatar = false
    ).catch((error) => {
      console.error(`[${profile.name}] 下载二维码失败:`, error)
      resolve(null)
    })
  })
}

module.exports = {
  loadAllProfilesText,
  downloadProfileImages,
  downloadAllProfileImages,
  getProfilesFromCache,
  getProfilesDataSync,
  getStorageInfo,
  getImageFilesInfo,
  ensureQrcodeDownloaded
}

