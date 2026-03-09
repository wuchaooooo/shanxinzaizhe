// utils/new-profile-loader.js
// 从新表加载所有合伙人数据

const { getAllProfileRecords, extractFieldText, feishuDateToYYYYMM } = require('./profile-edit-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { downloadImageByKey } = require('./image-downloader.js')

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
      return parsed.map(item => ({
        time: item.timeDisplay || item.timeStart || '',
        title: item.title || '',
        desc: item.desc || ''
      }))
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
 * @returns {Promise<Array>} - 返回处理后的合伙人数据数组
 */
async function loadAllProfilesText() {
  const records = await getAllProfileRecords()
  const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping

  return records.map(record => {
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

    return {
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
  })
}

/**
 * 下载单个合伙人的图片
 * @param {Object} profile - 合伙人数据对象
 * @param {Function} onImageReady - 图片下载完成回调 (type, path) => void，type为'avatar'或'qrcode'
 * @returns {Promise<void>}
 */
async function downloadProfileImages(profile, onImageReady) {
  const { employeeId, name, imageKey, qrcodeKey } = profile

  // 下载头像
  if (imageKey) {
    try {
      const path = await downloadImageByKey(imageKey, 'profile_avatar', employeeId)
      console.log(`[${name}] 头像下载成功:`, path)
      if (onImageReady) onImageReady('avatar', path, employeeId, name)
    } catch (error) {
      console.error(`[${name}] 头像下载失败:`, error)
    }
  }

  // 下载二维码
  if (qrcodeKey) {
    try {
      const path = await downloadImageByKey(qrcodeKey, 'profile_qrcode', employeeId)
      console.log(`[${name}] 二维码下载成功:`, path)
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
 */
async function downloadAllProfileImages(profiles, onImageReady, concurrency = 2) {
  console.log(`开始下载 ${profiles.length} 个合伙人的图片，并发数: ${concurrency}`)

  if (concurrency === 1) {
    // 串行下载
    for (const profile of profiles) {
      await downloadProfileImages(profile, onImageReady)
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
            await downloadProfileImages(profile, onImageReady)
          }
        }
      })())
    }

    await Promise.all(workers)
  }

  console.log('所有合伙人图片下载完成')
}

module.exports = {
  loadAllProfilesText,
  downloadProfileImages,
  downloadAllProfileImages
}

