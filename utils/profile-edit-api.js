// utils/profile-edit-api.js
// 自助编辑新表专用 API 封装

const feishuApi = require('./feishu-api.js')
const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')

/**
 * 从飞书 Bitable 字段值中提取纯文本
 * 文本字段可能返回富文本数组 [{type:"text",text:"值"}]，也可能是普通字符串或数字
 */
function extractFieldText(value) {
  if (!value && value !== 0) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value.map(seg => (seg && seg.text) ? seg.text : '').join('')
  }
  return String(value)
}

/**
 * 获取新表中的所有记录
 * @returns {Promise<Array>} - 返回所有记录数组
 */
async function getAllProfileRecords() {
  const { profileEditAppToken, profileEditTableId } = DATA_SOURCE_CONFIG

  try {
    const token = await feishuApi.getTenantAccessToken()
    const allRecords = []
    let hasMore = true
    let pageToken = undefined

    while (hasMore) {
      const result = await new Promise((resolve, reject) => {
        const requestData = { page_size: 500 }
        if (pageToken) requestData.page_token = pageToken

        wx.request({
          url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${profileEditAppToken}/tables/${profileEditTableId}/records`,
          method: 'GET',
          header: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          data: requestData,
          success: (res) => {
            if (res.statusCode === 200 && res.data.code === 0) {
              resolve(res.data.data)
            } else {
              console.error('获取所有记录失败:', res.data)
              reject(res.data)
            }
          },
          fail: (err) => {
            console.error('获取所有记录网络失败:', err)
            reject(err)
          }
        })
      })

      if (result.items) {
        allRecords.push(...result.items)
      }
      hasMore = result.has_more
      pageToken = result.page_token
    }

    return allRecords
  } catch (error) {
    console.error('getAllProfileRecords 失败:', error)
    return []
  }
}

/**
 * 按 employeeId 查找新表中的自助编辑记录
 * @param {string} employeeId - 营销员工号
 * @returns {Promise<Object|null>} - 找到返回 { record_id, fields }，否则返回 null
 */
async function findProfileEditRecord(employeeId) {
  const { profileEditAppToken, profileEditTableId, feishuFieldMapping } = DATA_SOURCE_CONFIG
  const url = `/open-apis/bitable/v1/apps/${profileEditAppToken}/tables/${profileEditTableId}/records/search`

  try {
    const token = await feishuApi.getTenantAccessToken()
    const result = await new Promise((resolve, reject) => {
      wx.request({
        url: `https://open.feishu.cn${url}`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: {
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: feishuFieldMapping.employeeId,
                operator: 'is',
                value: [String(employeeId)]
              }
            ]
          }
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 0) {
            resolve(res.data.data)
          } else {
            console.error('查询自助编辑记录失败:', res.data)
            reject(res.data)
          }
        },
        fail: (err) => {
          console.error('查询自助编辑记录网络失败:', err)
          reject(err)
        }
      })
    })

    return result.items && result.items.length > 0 ? result.items[0] : null
  } catch (error) {
    console.error('findProfileEditRecord 失败:', error)
    return null
  }
}

/**
 * 创建或更新新表中的自助编辑记录
 * @param {string} employeeId - 营销员工号
 * @param {Object} fields - 飞书字段对象（中文键名）
 * @param {string|null} existingRecordId - 已有记录 ID（null 则创建新记录）
 * @returns {Promise<Object>} - 飞书 API 返回的记录数据
 */
async function saveProfileEditRecord(employeeId, fields, existingRecordId) {
  const { profileEditAppToken, profileEditTableId } = DATA_SOURCE_CONFIG

  if (existingRecordId) {
    return feishuApi.updateRecord(existingRecordId, fields, {
      appToken: profileEditAppToken,
      tableId: profileEditTableId
    })
  } else {
    return feishuApi.createRecord(fields, {
      appToken: profileEditAppToken,
      tableId: profileEditTableId
    })
  }
}

/**
 * 上传图片并返回 image_key（复用现有 IM 上传接口）
 * @param {string} filePath - 本地临时文件路径
 * @returns {Promise<string>} - image_key
 */
function uploadProfileImage(filePath) {
  return feishuApi.uploadImage(filePath)
}

/**
 * 从飞书 IM 下载图片到本地临时文件
 * @param {string} imageKey - IM image_key
 * @returns {Promise<string>} - 本地文件路径
 */
function downloadProfileImage(imageKey) {
  return feishuApi.downloadFeishuImage(imageKey)
}

/**
 * 将飞书日期字段值（Unix ms 时间戳或字符串）转换为 "YYYY-MM" 字符串
 * 飞书 date 类型字段 API 返回 Unix 毫秒时间戳（数字）
 */
function feishuDateToYYYYMM(val) {
  if (!val && val !== 0) return ''
  const raw = Array.isArray(val) ? val.map(s => (s && s.text) ? s.text : '').join('') : String(val)
  const num = Number(raw)
  if (!isNaN(num) && num > 1000000000000) {
    const d = new Date(num)
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }
  // 已是 "YYYY-MM" 或 "YYYY-MM-DD" 字符串
  return raw.slice(0, 7)
}

/**
 * 将 "YYYY-MM" 字符串转换为飞书 date 字段所需的 Unix ms 时间戳
 */
function yyyymmToFeishuDate(dateStr) {
  if (!dateStr) return null
  // 接受 YYYY-MM 或 YYYY-MM-DD，统一补成完整日期
  const normalized = /^\d{4}-\d{2}$/.test(dateStr) ? dateStr + '-01' : dateStr
  const d = new Date(normalized + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d.getTime()
}

/**
 * 通过 openid 查找自助编辑记录
 * @param {string} openid - 微信 openid
 * @returns {Promise<Object|null>} - 返回记录对象或 null
 */
async function findProfileEditRecordByOpenid(openid) {
  const { profileEditAppToken, profileEditTableId, feishuFieldMapping } = DATA_SOURCE_CONFIG
  const url = `/open-apis/bitable/v1/apps/${profileEditAppToken}/tables/${profileEditTableId}/records/search`

  try {
    const token = await feishuApi.getTenantAccessToken()
    const result = await new Promise((resolve, reject) => {
      wx.request({
        url: `https://open.feishu.cn${url}`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        data: {
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: feishuFieldMapping.wxOpenid,
                operator: 'is',
                value: [String(openid)]
              }
            ]
          }
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 0) {
            resolve(res.data.data)
          } else {
            console.error('通过openid查询记录失败:', res.data)
            reject(res.data)
          }
        },
        fail: (err) => {
          console.error('通过openid查询记录网络失败:', err)
          reject(err)
        }
      })
    })

    if (result && result.items && result.items.length > 0) {
      return result.items[0]
    }
    return null
  } catch (error) {
    console.error('通过openid查找记录异常:', error)
    return null
  }
}

module.exports = {
  getAllProfileRecords,
  findProfileEditRecord,
  findProfileEditRecordByOpenid,
  saveProfileEditRecord,
  extractFieldText,
  feishuDateToYYYYMM,
  yyyymmToFeishuDate
}
