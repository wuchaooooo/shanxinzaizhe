// utils/partners-data-loader.js
// 合伙人数据加载器 - 支持本地和飞书数据源

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

// 图标池 - 用于时间线、荣誉徽章等场景
const ICON_POOL = [
  '🏆', '⭐', '🎯', '💎', '🔥', '✨', '🌟', '💫', '🎖️', '🏅',
  '👑', '🎪', '🎨', '🎭', '🎬', '🎤', '🎧', '🎼', '🎹', '🎺',
  '📚', '📖', '📝', '📊', '📈', '📌', '📍', '🔖', '💼', '🎓'
]

/**
 * 从图标池中随机选择一个图标
 */
function getRandomIcon() {
  return ICON_POOL[Math.floor(Math.random() * ICON_POOL.length)]
}

/**
 * 将飞书记录转换为本地数据格式
 */
function transformFeishuRecord(record) {
  const fields = record.fields
  const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping

  // 解析荣誉徽章、成长足迹等字段
  // 这些字段是特定格式的文本，需要解析
  const parseBadges = (data) => {
    if (!data) return []
    try {

      // 如果是JSON字符串，尝试解析
      if (typeof data === 'string' && (data.startsWith('[') || data.startsWith('{'))) {
        return JSON.parse(data)
      }
      // 如果已经是对象数组，直接返回
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return data
      }

      // 如果是字符串数组且包含 $ 格式，按新格式解析
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string' && data[0].includes('$')) {
        const badges = []
        data.forEach((item, index) => {
          // 按 & 分割每个徽章（如果有多个徽章在一个字符串中）
          const subItems = item.split('&').filter(part => part.trim())
          subItems.forEach(subItem => {
            // 按 $ 分割获取主标题和副标题
            const parts = subItem.split('$').filter(part => part.trim())
            console.log(`parseBadges 解析徽章:`, parts)

            if (parts.length > 0) {
              badges.push({
                icon: getRandomIcon(),
                title: parts[0].trim(),
                desc: parts.length > 1 ? parts[1].trim() : '',
                color: badges.length % 2 === 0 ? 'amber' : 'blue'
              })
            }
          })
        })
        console.log('parseBadges 解析后的数组:', badges)
        return badges
      }

      // 新格式：$主标题$副标题& 或 $主标题&（单个字符串）
      if (typeof data === 'string' && data.includes('$')) {
        const badges = []
        // 按 & 分割每个徽章
        const items = data.split('&').filter(item => item.trim())
        console.log('parseBadges 按&分割后:', items)

        items.forEach((item, index) => {
          // 按 $ 分割获取主标题和副标题
          const parts = item.split('$').filter(part => part.trim())
          console.log(`parseBadges 第${index + 1}个徽章解析:`, parts)

          if (parts.length > 0) {
            badges.push({
              icon: getRandomIcon(),
              title: parts[0].trim(),
              desc: parts.length > 1 ? parts[1].trim() : '',
              color: index % 2 === 0 ? 'amber' : 'blue'
            })
          }
        })

        console.log('parseBadges 解析后的数组:', badges)
        return badges
      }

      // 如果是普通字符串数组，转换为对象数组
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        return data.map((badge, index) => ({
          icon: getRandomIcon(),
          title: badge,
          desc: '',
          color: index % 2 === 0 ? 'amber' : 'blue'
        }))
      }
      // 否则返回空数组
      return []
    } catch (e) {
      console.error('解析荣誉徽章失败:', e)
      return []
    }
  }

  const parseTimeline = (data) => {
    if (!data) return []
    try {
      console.log('parseTimeline 接收到的数据类型:', typeof data)
      console.log('parseTimeline 接收到的数据:', data)

      // 如果是JSON字符串，尝试解析
      if (typeof data === 'string' && (data.startsWith('[') || data.startsWith('{'))) {
        return JSON.parse(data)
      }
      // 如果已经是对象数组，直接返回
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return data
      }
      // 如果是字符串数组，转换为对象数组
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        return data.map((item, index) => ({
          icon: getRandomIcon(),
          title: item,
          time: '',
          desc: '',
          color: index % 2 === 0 ? 'blue' : 'green'
        }))
      }

      // 新格式：$2026-01$主标题$副标题$
      if (typeof data === 'string' && data.includes('$')) {
        const timeline = []
        // 按换行符分割
        const lines = data.split(/[\n]/).filter(line => line.trim())
        console.log('parseTimeline 分割后的行数:', lines.length)
        console.log('parseTimeline 分割后的行:', lines)

        lines.forEach((line, index) => {
          // 按 $ 分割
          const parts = line.split('$').filter(part => part.trim())
          console.log(`parseTimeline 第${index + 1}行解析结果:`, parts)

          if (parts.length > 0) {
            timeline.push({
              time: parts[0] ? parts[0].trim() : '',
              title: parts.length > 1 ? parts[1].trim() : '',
              desc: parts.length > 2 ? parts[2].trim() : '',
              icon: getRandomIcon(),
              color: index % 2 === 0 ? 'blue' : 'green'
            })
          }
        })

        console.log('parseTimeline 解析后的数组:', timeline)

        // 按时间倒序排列（最新的在前面）
        timeline.sort((a, b) => {
          if (!a.time || !b.time) return 0
          return b.time.localeCompare(a.time)
        })
        console.log('parseTimeline 排序后的数组:', timeline)

        return timeline
      }

      // 旧格式：时间：2025-05，主标题：xxx，副标题：xxx
      if (typeof data === 'string' && data.includes('时间：')) {
        const timeline = []
        // 按换行符分割（↵ 或 \n）
        const lines = data.split(/[\n↵]/).filter(line => line.trim())
        console.log('parseTimeline 分割后的行数:', lines.length)
        console.log('parseTimeline 分割后的行:', lines)

        lines.forEach((line, index) => {
          // 解析每一行：时间：xxx，主标题：xxx，副标题：xxx
          const timeMatch = line.match(/时间：([^，,]+)/)
          const titleMatch = line.match(/主标题：([^，,]+)/)
          const descMatch = line.match(/副标题：(.+)$/)

          console.log(`parseTimeline 第${index + 1}行解析结果:`, {
            line,
            time: timeMatch ? timeMatch[1] : null,
            title: titleMatch ? titleMatch[1] : null,
            desc: descMatch ? descMatch[1] : null
          })

          if (timeMatch) {
            timeline.push({
              time: timeMatch[1].trim(),
              title: titleMatch ? titleMatch[1].trim() : '',
              desc: descMatch ? descMatch[1].trim() : '',
              icon: getRandomIcon(),
              color: index % 2 === 0 ? 'blue' : 'green'
            })
          }
        })

        console.log('parseTimeline 解析后的数组:', timeline)

        // 按时间倒序排列（最新的在前面）
        timeline.sort((a, b) => {
          if (!a.time || !b.time) return 0
          return b.time.localeCompare(a.time)
        })
        console.log('parseTimeline 排序后的数组:', timeline)

        return timeline
      }

      console.log('parseTimeline 数据格式不匹配，返回空数组')
      return []
    } catch (e) {
      console.error('解析成长足迹失败:', e)
      return []
    }
  }

  const parseActivities = (data) => {
    if (!data) return []
    try {
      console.log('parseActivities 接收到的数据类型:', typeof data)
      console.log('parseActivities 接收到的数据:', data)

      // 如果是JSON字符串，尝试解析
      if (typeof data === 'string' && (data.startsWith('[') || data.startsWith('{'))) {
        return JSON.parse(data)
      }
      // 如果已经是数组，直接返回
      if (Array.isArray(data)) {
        return data
      }

      // 新格式：$2026-01$主标题$副标题$
      if (typeof data === 'string' && data.includes('$')) {
        const activities = []
        // 按换行符分割
        const lines = data.split(/[\n]/).filter(line => line.trim())
        console.log('parseActivities 分割后的行数:', lines.length)
        console.log('parseActivities 分割后的行:', lines)

        lines.forEach((line, index) => {
          // 按 $ 分割
          const parts = line.split('$').filter(part => part.trim())
          console.log(`parseActivities 第${index + 1}行解析结果:`, parts)

          if (parts.length > 0) {
            activities.push({
              time: parts[0] ? parts[0].trim() : '',
              title: parts.length > 1 ? parts[1].trim() : '',
              desc: parts.length > 2 ? parts[2].trim() : '',
              icon: getRandomIcon(),
              color: 'blue'
            })
          }
        })

        console.log('parseActivities 解析后的数组:', activities)

        // 按时间倒序排列（最新的在前面）
        activities.sort((a, b) => {
          if (!a.time || !b.time) return 0
          return b.time.localeCompare(a.time)
        })
        console.log('parseActivities 排序后的数组:', activities)

        return activities
      }

      // 旧格式：时间：2025-05，主标题：xxx，副标题：xxx
      if (typeof data === 'string' && data.includes('时间：')) {
        const activities = []
        // 按换行符分割（↵ 或 \n）
        const lines = data.split(/[\n↵]/).filter(line => line.trim())
        console.log('分割后的行数:', lines.length)
        console.log('分割后的行:', lines)

        lines.forEach((line, index) => {
          // 解析每一行：时间：xxx，主标题：xxx，副标题：xxx
          const timeMatch = line.match(/时间：([^，,]+)/)
          const titleMatch = line.match(/主标题：([^，,]+)/)
          const descMatch = line.match(/副标题：(.+)$/)

          console.log(`第${index + 1}行解析结果:`, {
            line,
            time: timeMatch ? timeMatch[1] : null,
            title: titleMatch ? titleMatch[1] : null,
            desc: descMatch ? descMatch[1] : null
          })

          if (timeMatch) {
            activities.push({
              time: timeMatch[1].trim(),
              title: titleMatch ? titleMatch[1].trim() : '',
              desc: descMatch ? descMatch[1].trim() : '',
              icon: getRandomIcon(),
              color: 'blue'
            })
          }
        })

        console.log('解析后的 activities 数组:', activities)

        // 按时间倒序排列（最新的在前面）
        activities.sort((a, b) => {
          if (!a.time || !b.time) return 0
          return b.time.localeCompare(a.time)
        })
        console.log('排序后的 activities 数组:', activities)

        return activities
      }

      console.log('数据格式不匹配，返回空数组')
      return []
    } catch (e) {
      console.error('解析在友邦浙江的成长足迹失败:', e)
      return []
    }
  }

  const parseSkills = (data) => {
    if (!data) return []
    try {
      console.log('parseSkills 接收到的数据类型:', typeof data)
      console.log('parseSkills 接收到的数据:', data)

      // 如果已经是数组，直接返回
      if (Array.isArray(data)) {
        return data
      }

      // 如果是字符串，按常见分隔符拆分
      if (typeof data === 'string') {
        // 按 $ 符号分隔，保留文本中的标点符号
        const skills = data.split('$').map(item => item.trim()).filter(item => item)
        console.log('parseSkills 解析后的数组:', skills)
        return skills
      }

      return []
    } catch (e) {
      console.error('解析专业领域失败:', e)
      return []
    }
  }

  // 解析"是否为讲师"字段，支持多种飞书字段类型（勾选框/文本）
  const parseIsInstructor = (val) => {
    if (!val) return false
    if (typeof val === 'boolean') return val
    if (typeof val === 'string') return val === '是' || val === 'true' || val === '1'
    return false
  }

  // 打印头像字段结构用于对比
  if (fields[mapping.image] && fields[mapping.image].length > 0) {
    console.log('合伙人头像字段结构:', JSON.stringify(fields[mapping.image][0], null, 2))
  }

  return {
    name: fields[mapping.name] || '',
    school: fields[mapping.school] || '',
    title: fields[mapping.title] || '',
    employeeId: fields[mapping.employeeId] || '', // 营销员工号（唯一标识）
    joinDate: fields[mapping.joinDate] || '',
    customersServed: fields[mapping.customersServed] || '',
    bio: fields[mapping.bio] || '',
    isInstructor: parseIsInstructor(fields[mapping.isInstructor]),
    // 使用飞书 Base 返回的 url 字段（已验证可用）
    imageUrl: fields[mapping.image] ? fields[mapping.image][0]?.url : '',
    qrcodeUrl: fields[mapping.qrcode] ? fields[mapping.qrcode][0]?.url : '',
    image: '', // 稍后填充本地路径
    qrcode: '', // 稍后填充本地路径
    // 解析复杂字段
    badges: parseBadges(fields[mapping.badges]),
    timeline: parseTimeline(fields[mapping.timeline]),
    activities: parseActivities(fields[mapping.activities]),
    skills: parseSkills(fields[mapping.skills]),
    contacts: []
  }
}

/**
 * 带重试的下载（失败后最多重试 maxRetries 次，间隔递增）
 */
function downloadWithRetry(url, token, employeeId = '', type = 'avatar', maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const tryDownload = () => {
      attempt++
      downloadImageWithAuth(url, token, employeeId, type)
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
 * 使用 fs.saveFile 保存到永久路径
 * @param {string} url - 图片URL
 * @param {string} token - 认证token
 * @param {string} employeeId - 员工ID，用于生成缓存文件名
 * @param {string} type - 图片类型 'avatar' 或 'qrcode'
 */
function downloadImageWithAuth(url, token, employeeId = '', type = 'avatar') {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: url,
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200) {
          // 直接使用临时路径，不持久化保存
          console.log(`[${employeeId}] ${type} 下载成功（临时路径）:`, res.tempFilePath)
          resolve(res.tempFilePath)
        } else {
          console.error('下载图片HTTP状态码错误:', {
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
        console.error('下载图片网络请求失败:', {
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
 * 并发控制下载图片
 * @param {Array} tasks - 下载任务数组
 * @param {number} limit - 并发限制数量
 */
async function downloadWithLimit(tasks, limit = 5) {
  const results = []
  const executing = []

  for (const task of tasks) {
    // 添加延迟避免飞书限流（每个任务间隔50ms）
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

// ─── 本地缓存：基于 employeeId + Last Modified Date 增量更新 ─────────────────
// 缓存版本号：新增字段映射或修改 transform 逻辑时手动递增，旧缓存自动失效
const CACHE_VERSION = 'v2'
const CACHE_KEY = `partners_cache_${CACHE_VERSION}`

function loadPartnersCache() {
  try { return wx.getStorageSync(CACHE_KEY) || {} } catch (e) { return {} }
}

function savePartnersCache(cache) {
  try { wx.setStorageSync(CACHE_KEY, cache) } catch (e) { console.error('保存合伙人缓存失败:', e) }
}

/**
 * 从本地缓存同步读取合伙人列表，并尝试从缓存恢复图片路径
 * 注意：使用 saveFile 保存的文件路径已经存储在缓存的 imagePath/qrcodePath 中
 */
function getPartnersFromCache() {
  const cache = loadPartnersCache()
  const fs = wx.getFileSystemManager()

  console.log(`getPartnersFromCache: 缓存中有 ${Object.keys(cache).length} 条记录`)

  return Object.values(cache).map(entry => {
    const partner = { ...entry.data }

    // 优先使用 imagePath/qrcodePath（验证文件存在），否则保留 data 中的路径
    if (entry.imagePath) {
      try {
        fs.accessSync(entry.imagePath)
        partner.image = entry.imagePath
        console.log(`[${partner.name}] 从 imagePath 恢复头像: ${entry.imagePath}`)
      } catch (e) {
        console.warn(`[${partner.name}] imagePath 文件不存在:`, entry.imagePath)
        // 文件不存在，清空路径以触发重新下载
        partner.image = ''
      }
    } else if (!partner.image) {
      // 既没有 imagePath 也没有 data.image，设为空
      partner.image = ''
      console.log(`[${partner.name}] 没有头像路径`)
    } else {
      console.log(`[${partner.name}] 从 data.image 保留头像: ${partner.image}`)
    }

    if (entry.qrcodePath) {
      try {
        fs.accessSync(entry.qrcodePath)
        partner.qrcode = entry.qrcodePath
      } catch (e) {
        console.warn(`[${partner.name}] qrcodePath 文件不存在:`, entry.qrcodePath)
        // 文件不存在，清空路径以触发重新下载
        partner.qrcode = ''
      }
    } else if (!partner.qrcode) {
      // 既没有 qrcodePath 也没有 data.qrcode，设为空
      partner.qrcode = ''
    }

    return partner
  }).sort((a, b) => {
    const numA = parseInt(a.employeeId, 10)
    const numB = parseInt(b.employeeId, 10)
    if (!isNaN(numA) && !isNaN(numB)) return numB - numA
    return (b.employeeId || '').localeCompare(a.employeeId || '')
  })
}

/**
 * 同步获取合伙人数据（有缓存就返回，否则返回空数组）
 */
function getPartnersDataSync() {
  const app = getApp()
  if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
    return app.globalData.partnersData
  }
  return []
}

/**
 * 获取飞书文本数据，与本地缓存对比，仅重新解析有变更的记录
 * @returns {{ partners: Array, hasChanges: boolean }}
 */
async function fetchFeishuPartnersText() {
  try {
    console.log('获取飞书文本数据...')
    const records = await feishuApi.getAllRecords()
    const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping
    const cache = loadPartnersCache()
    const newCache = {}
    let hasChanges = false

    // 获取当前内存中的合伙人（保留已下载的图片路径，避免重复下载）
    const changedIds = new Set()
    const currentMap = {}
    getPartnersDataSync().forEach(p => { if (p.employeeId) currentMap[p.employeeId] = p })

    const partners = records.map(record => {
      const fields = record.fields
      // 优先用营销员工号作为缓存 key，退而用 record_id
      const cacheKey = String(fields[mapping.employeeId] || record.record_id || '')
      const lastModified = String(fields[mapping.lastModifiedDate] || '')

      if (cacheKey && cache[cacheKey] && cache[cacheKey].lastModified === lastModified) {
        // 未变更：复用缓存数据，优先使用内存中的图片路径，否则尝试从缓存的 imagePath 恢复
        newCache[cacheKey] = cache[cacheKey]
        const existing = currentMap[cacheKey]
        const fs = wx.getFileSystemManager()

        let imagePath = existing ? existing.image : ''
        let qrcodePath = existing ? existing.qrcode : ''

        // 如果内存中没有图片路径，尝试从缓存的 imagePath 恢复
        if (!imagePath && cache[cacheKey].imagePath) {
          try {
            fs.accessSync(cache[cacheKey].imagePath)
            imagePath = cache[cacheKey].imagePath
          } catch (e) {
            // 文件不存在，保持为空
          }
        }

        if (!qrcodePath && cache[cacheKey].qrcodePath) {
          try {
            fs.accessSync(cache[cacheKey].qrcodePath)
            qrcodePath = cache[cacheKey].qrcodePath
          } catch (e) {
            // 文件不存在，保持为空
          }
        }

        return {
          ...cache[cacheKey].data,
          image: imagePath,
          qrcode: qrcodePath
        }
      }

      // 有变更或新记录：重新 transform，加入变更集合
      hasChanges = true
      changedIds.add(cacheKey)
      const transformed = transformFeishuRecord(record)
      if (cacheKey) {
        newCache[cacheKey] = { lastModified, data: { ...transformed, image: '', qrcode: '' } }
      }
      return transformed
    })

    // 按营销员工号倒序排列（数值比较）
    partners.sort((a, b) => {
      const idA = a.employeeId || ''
      const idB = b.employeeId || ''

      // 尝试转换为数字进行比较
      const numA = parseInt(idA, 10)
      const numB = parseInt(idB, 10)

      // 如果都是有效数字，按数值比较
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA // 倒序
      }

      // 否则按字符串比较
      return idB.localeCompare(idA)
    })

    // 检查是否有记录被删除（旧缓存中有但本次拉取中没有）
    if (!hasChanges && Object.keys(cache).some(k => !newCache[k])) {
      hasChanges = true
    }

    savePartnersCache(newCache)
    console.log(`飞书数据加载完成，共 ${partners.length} 条，${hasChanges ? `有变更(${changedIds.size}条)` : '无变更'}`)
    return { partners, hasChanges, changedIds }
  } catch (error) {
    console.error('获取飞书文本数据失败:', error)
    throw error
  }
}

/**
 * 在后台下载头像和二维码
 * @param {Array} partnersData
 * @param {Function} onAvatarReady (partnerName, localPath) - 有变更的合伙人下载完成后回调
 * @param {Set} changedIds - 有变更（新增或字段变化）的合伙人 employeeId 集合
 *   - 在集合中：下载 + 触发 onAvatarReady（重渲染头像和统计）
 *   - 不在集合且已有图片路径：跳过下载（无需重渲染）
 *   - 不在集合但无图片路径：静默下载，不触发回调
 */
async function downloadImagesBackground(partnersData, onAvatarReady, changedIds) {
  try {
    const token = await feishuApi.getTenantAccessToken()
    const avatarTasks = []  // 头像下载任务
    const qrcodeTasks = []  // 二维码下载任务
    const cache = loadPartnersCache()  // 加载缓存以保存图片路径

    for (const partner of partnersData) {
      const p = partner
      const isChanged = !changedIds || changedIds.has(p.employeeId)

      console.log(`[${p.name}] 检查头像: isChanged=${isChanged}, hasImage=${!!p.image}, imageUrl=${!!p.imageUrl}`)

      if (p.imageUrl) {
        // 检查缓存中是否有图片路径
        const cachedImagePath = cache[p.employeeId]?.imagePath
        let cacheExists = false

        if (cachedImagePath) {
          try {
            const fs = wx.getFileSystemManager()
            fs.accessSync(cachedImagePath)
            cacheExists = true
            // 如果缓存存在且内存中没有路径，直接使用缓存
            if (!p.image) {
              p.image = cachedImagePath
            }
          } catch (e) {
            // 缓存文件不存在
          }
        }

        if (!isChanged && cacheExists) {
          // 数据未变更且缓存文件存在：跳过下载
          console.log(`[${p.name}] 跳过下载: 数据未变更且缓存文件存在`)
        } else if (!cacheExists || isChanged) {
          // 缓存不存在或数据有变更：需要下载
          const needNotify = isChanged || !p.image
          console.log(`[${p.name}] 需要下载头像: needNotify=${needNotify}`)
          avatarTasks.push(() =>
            downloadWithRetry(p.imageUrl, token, p.employeeId, 'avatar')
              .then(path => {
                console.log(`[${p.name}] 头像下载成功:`, path)

                // 删除旧文件（如果存在且路径不同）
                const oldPath = cache[p.employeeId]?.imagePath
                if (oldPath && oldPath !== path) {
                  try {
                    const fs = wx.getFileSystemManager()
                    fs.unlinkSync(oldPath)
                    console.log(`[${p.name}] 已删除旧头像:`, oldPath)
                  } catch (e) {
                    console.warn(`[${p.name}] 删除旧头像失败:`, oldPath, e)
                  }
                }

                p.image = path
                // 更新缓存
                if (!cache[p.employeeId]) {
                  cache[p.employeeId] = { data: p }
                }
                cache[p.employeeId].imagePath = path
                cache[p.employeeId].data = p  // 更新 data 确保最新

                console.log(`[${p.name}] 保存缓存: imagePath=${path}`)
                savePartnersCache(cache)
                console.log(`[${p.name}] 缓存已保存`)

                if (needNotify && onAvatarReady) {
                  console.log(`[${p.name}] 触发头像就绪回调`)
                  onAvatarReady(p.name, path)
                }
              })
              .catch((err) => {
                console.error(`[${p.name}] 头像下载失败:`, err)
              })
          )
        }
      }

      if (p.qrcodeUrl) {
        // 检查缓存中是否有二维码路径
        const cachedQrcodePath = cache[p.employeeId]?.qrcodePath
        let cacheExists = false

        if (cachedQrcodePath) {
          try {
            const fs = wx.getFileSystemManager()
            fs.accessSync(cachedQrcodePath)
            cacheExists = true
            // 如果缓存存在且内存中没有路径，直接使用缓存
            if (!p.qrcode) {
              p.qrcode = cachedQrcodePath
            }
          } catch (e) {
            // 缓存文件不存在
          }
        }

        if (!isChanged && cacheExists) {
          // 数据未变更且缓存文件存在：跳过下载
        } else if (!cacheExists || isChanged) {
          // 缓存不存在或数据有变更：需要下载
          qrcodeTasks.push(() =>
            downloadWithRetry(p.qrcodeUrl, token, p.employeeId, 'qrcode')
              .then(path => {
                // 删除旧文件（如果存在且路径不同）
                const oldPath = cache[p.employeeId]?.qrcodePath
                if (oldPath && oldPath !== path) {
                  try {
                    const fs = wx.getFileSystemManager()
                    fs.unlinkSync(oldPath)
                    console.log(`[${p.name}] 已删除旧二维码:`, oldPath)
                  } catch (e) {
                    console.warn(`[${p.name}] 删除旧二维码失败:`, oldPath, e)
                  }
                }

                p.qrcode = path
                // 更新缓存
                if (!cache[p.employeeId]) {
                  cache[p.employeeId] = { data: p }
                }
                cache[p.employeeId].qrcodePath = path
                cache[p.employeeId].data = p  // 更新 data 确保最新
                savePartnersCache(cache)

                // 二维码下载完成，不触发回调（team页面不需要二维码通知）
              })
              .catch(() => {})
          )
        }
      }
    }

    // 优先下载头像，然后下载二维码
    const tasks = [...avatarTasks, ...qrcodeTasks]

    console.log(`准备下载 ${avatarTasks.length} 个头像, ${qrcodeTasks.length} 个二维码`)

    // 同步模式：limit=1，逐张下载渲染；异步模式：使用配置的并发数
    const concurrency = DATA_SOURCE_CONFIG.imageLoadMode === 'sync' ? 1 : (DATA_SOURCE_CONFIG.imageConcurrency || 2)
    await downloadWithLimit(tasks, concurrency)

    if (tasks.length === 0) {
      console.log('所有图片已从缓存加载')
    } else {
      console.log(`所有图片下载完成（共${tasks.length}张）`)
    }
  } catch (error) {
    console.error('后台下载图片出错:', error)
  }
}

module.exports = {
  getPartnersFromCache,
  getPartnersDataSync,
  fetchFeishuPartnersText,
  downloadImagesBackground
}
