// utils/data-parser.js
// 通用数据解析工具

/**
 * 解析 JSON 数组
 * @param {string} str - JSON 字符串
 * @returns {Array} - 解析后的数组
 */
function parseToArray(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {}
  // 如果不是 JSON 数组，返回单元素数组
  return [str]
}

/**
 * 解析徽章数据
 * @param {string} data - 徽章数据字符串
 * @returns {Array} - 徽章数组
 */
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

/**
 * 解析时间线数据
 * @param {string} data - 时间线数据字符串
 * @returns {Array} - 时间线数组
 */
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

/**
 * 解析是否为讲师字段
 * @param {*} value - 字段值
 * @returns {boolean} - 是否为讲师
 */
function parseIsInstructor(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    return lower === 'true' || lower === '是' || lower === 'yes' || lower === '1'
  }
  return false
}

/**
 * 计算时间显示文本
 * @param {string} timeStart - 开始时间
 * @param {string} timeEnd - 结束时间
 * @returns {string} - 时间显示文本
 */
function computeTimeDisplay(timeStart, timeEnd) {
  if (!timeStart) return ''
  if (timeEnd) return timeStart.slice(0, 7) + ' ~ ' + timeEnd.slice(0, 7)
  return timeStart
}

module.exports = {
  parseToArray,
  parseBadges,
  parseTimeline,
  parseIsInstructor,
  computeTimeDisplay
}
