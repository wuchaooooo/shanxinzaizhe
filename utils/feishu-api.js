// utils/feishu-api.js
// 飞书开放平台API封装

const FEISHU_CONFIG = {
  appId: 'cli_a92cddc066e15bd3',
  appSecret: 'BwAhbWxODX67QifoTjl0ydMpM0F2aD4K',
  // 联合创始人 base
  partnersAppToken: 'KeZIbpY9ka7lpfs12KNcoXwenCc',
  partnersTableId: 'tblt44wzHpZlXPBT',
  // 静态资源 base（新建）
  assetsAppToken: 'Ijtdb7F4VaXiPwsUAZCchFzUndb',
  assetsTableId: 'tblJQN5VgacsKNNo',
  // 星享会 base
  starClubAppToken: 'D7r0bisBWamFWLs539YcDYnhnEd',
  starClubTableId: 'tblRZ1TPZlBBwlmG',
  // 午餐会 base
  lunchAppToken: 'NGz1bybL5aq9YDsZK7Tcurozn1b',
  lunchTableId: 'tblvWD7xZ33Usx9I',
  // 销售门诊 base
  salesClinicAppToken: 'HCybbpTQVaOGJysPHFMcktZnn3c',
  salesClinicTableId: 'tbln8UsmvNjSptvl',
  // 销售建设 base
  salesBuildingAppToken: 'KJLNbR0tRaK0LpskYjAcm4nqnRc',
  salesBuildingTableId: 'tbleG2LqgZwV9ac3',
  // 其他活动 base
  otherActivitiesAppToken: 'LmxdbOSfdaPyEZsjlTOcoYbhnFf',
  otherActivitiesTableId: 'tblvK8J71qdF1HvB',
  // 分享追踪统计 base
  shareTrackingAppToken: 'DahQbPH2paBJWvsaMprc6nFRn9f',
  shareTrackingTableId: 'tbl9syGrQRoyPSHk',
  // 前职关键词 base
  titleTagsAppToken: 'Ll5VbNc3MahwYxsdOg1c3SZsnsg',
  titleTagsTableId: 'tblyPz0uldc3aWCH'
}

// 缓存 tenant_access_token
let cachedToken = null
let tokenExpireTime = 0

/**
 * 获取 tenant_access_token
 */
function getTenantAccessToken() {
  return new Promise((resolve, reject) => {
    // 如果缓存的 token 还有效（提前5分钟过期），直接返回
    if (cachedToken && Date.now() < tokenExpireTime - 5 * 60 * 1000) {
      resolve(cachedToken)
      return
    }

    wx.request({
      url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        app_id: FEISHU_CONFIG.appId,
        app_secret: FEISHU_CONFIG.appSecret
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 0) {
          cachedToken = res.data.tenant_access_token
          // token 有效期 2 小时
          tokenExpireTime = Date.now() + res.data.expire * 1000
          console.log('获取 tenant_access_token 成功')
          resolve(cachedToken)
        } else {
          console.error('获取 tenant_access_token 失败:', res.data)
          reject(res.data)
        }
      },
      fail: (err) => {
        console.error('获取 tenant_access_token 网络请求失败:', err)
        reject(err)
      }
    })
  })
}

/**
 * 飞书API请求封装
 */
async function feishuRequest(url, options = {}) {
  // 先获取 token
  const token = await getTenantAccessToken()

  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://open.feishu.cn${url}`,
      method: options.method || 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.header
      },
      data: options.data,
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 0) {
          resolve(res.data.data)
        } else {
          console.error('飞书API请求失败:', res.data)
          reject(res.data)
        }
      },
      fail: (err) => {
        console.error('飞书API网络请求失败:', err)
        reject(err)
      }
    })
  })
}

/**
 * 查询多维表格记录列表
 * @param {Object} params - 查询参数
 * @param {number} params.page_size - 每页记录数，默认20，最大500
 * @param {string} params.page_token - 分页标记
 * @param {string} params.filter - 筛选条件
 * @param {string} params.sort - 排序规则
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
function getRecords(params = {}) {
  const {
    page_size = 100,
    page_token,
    filter,
    sort,
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params

  // 手动构建查询字符串（微信小程序不支持URLSearchParams）
  const queryParts = [`page_size=${page_size}`]

  if (page_token) queryParts.push(`page_token=${encodeURIComponent(page_token)}`)
  if (filter) queryParts.push(`filter=${encodeURIComponent(filter)}`)
  if (sort) queryParts.push(`sort=${encodeURIComponent(sort)}`)

  const queryString = queryParts.join('&')
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${queryString}`

  return feishuRequest(url)
}

/**
 * 获取所有记录（自动处理分页）
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
async function getAllRecords(params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params

  let allRecords = []
  let hasMore = true
  let pageToken = null

  while (hasMore) {
    try {
      const result = await getRecords({
        page_size: 500,
        page_token: pageToken,
        appToken,
        tableId
      })

      if (result.items && result.items.length > 0) {
        allRecords = allRecords.concat(result.items)
      }

      hasMore = result.has_more
      pageToken = result.page_token
    } catch (error) {
      console.error('获取记录失败:', error)
      break
    }
  }

  return allRecords
}

/**
 * 根据记录ID获取单条记录
 * @param {string} recordId - 记录ID
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
function getRecord(recordId, params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`
  return feishuRequest(url)
}

/**
 * 创建记录
 * @param {Object} fields - 记录字段数据
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
function createRecord(fields, params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  return feishuRequest(url, {
    method: 'POST',
    data: { fields }
  })
}

/**
 * 更新记录
 * @param {string} recordId - 记录ID
 * @param {Object} fields - 要更新的字段数据
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
function updateRecord(recordId, fields, params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`
  return feishuRequest(url, {
    method: 'PUT',
    data: { fields }
  })
}

/**
 * 删除记录
 * @param {string} recordId - 记录ID
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token，默认使用partnersAppToken
 * @param {string} params.tableId - 表格ID，默认使用partnersTableId
 */
function deleteRecord(recordId, params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`
  return feishuRequest(url, {
    method: 'DELETE'
  })
}

/**
 * 清除 token 缓存（权限变更后需要调用）
 */
function clearTokenCache() {
  cachedToken = null
  tokenExpireTime = 0
  console.log('已清除 tenant_access_token 缓存')
}

/**
 * 上传图片到飞书（用于多维表格附件字段）
 * @param {string} filePath - 本地图片路径
 * @returns {Promise<string>} - 返回 image_key
 */
async function uploadImage(filePath) {
  const token = await getTenantAccessToken()

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: 'https://open.feishu.cn/open-apis/im/v1/images',
      filePath: filePath,
      name: 'image',
      formData: {
        'image_type': 'message'
      },
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        console.log('上传图片响应 - statusCode:', res.statusCode)
        console.log('上传图片响应 - data:', res.data)
        if (res.statusCode === 200) {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            console.log('解析后的响应:', data)
            if (data.code === 0 && data.data && data.data.image_key) {
              console.log('图片上传成功，image_key:', data.data.image_key)
              resolve(data.data.image_key)
            } else {
              console.error('图片上传失败 - code:', data.code, 'msg:', data.msg)
              reject(new Error(data.msg || '图片上传失败'))
            }
          } catch (e) {
            console.error('解析上传响应失败:', e, res.data)
            reject(new Error('解析响应失败'))
          }
        } else {
          console.error('图片上传HTTP错误:', res.statusCode, res.data)
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('图片上传网络请求失败:', err)
        reject(err)
      }
    })
  })
}

/**
 * 获取表格的所有字段信息（用于调试）
 * @param {Object} params - 查询参数
 * @param {string} params.appToken - base token
 * @param {string} params.tableId - 表格ID
 * @returns {Promise<Array>} - 返回字段列表
 */
async function getTableFields(params = {}) {
  const {
    appToken = FEISHU_CONFIG.partnersAppToken,
    tableId = FEISHU_CONFIG.partnersTableId
  } = params
  const url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`
  return feishuRequest(url)
}

/**
 * 查询分享统计记录
 * @param {string} employeeId - 营销员工号
 */
async function findShareRecord(employeeId) {
  const url = `/open-apis/bitable/v1/apps/${FEISHU_CONFIG.shareTrackingAppToken}/tables/${FEISHU_CONFIG.shareTrackingTableId}/records/search`

  try {
    const result = await feishuRequest(url, {
      method: 'POST',
      data: {
        filter: {
          conjunction: 'and',
          conditions: [
            {
              field_name: '分享者工号',
              operator: 'is',
              value: [employeeId]
            }
          ]
        }
      }
    })

    return result.items && result.items.length > 0 ? result.items[0] : null
  } catch (error) {
    console.error('查询分享记录失败:', error)
    return null
  }
}

/**
 * 更新分享统计（查询 + 更新/创建）
 * @param {string} employeeId - 营销员工号（空字符串表示普通用户）
 * @param {string} employeeName - 营销员姓名
 */
async function updateShareTracking(employeeId, employeeName = '普通用户') {
  // 如果 employeeId 为空，使用特殊标识符 'guest' 表示普通用户
  const actualEmployeeId = employeeId || 'guest'
  const actualEmployeeName = employeeId ? employeeName : '普通用户'

  try {
    // 查询是否已存在该工号的记录
    const existingRecord = await findShareRecord(actualEmployeeId)

    if (existingRecord) {
      // 存在则更新浏览次数和姓名
      const currentCount = existingRecord.fields['浏览总次数'] || 0
      const newCount = currentCount + 1

      await updateRecord(
        existingRecord.record_id,
        {
          '浏览总次数': newCount,
          '分享者姓名': actualEmployeeName
        },
        {
          appToken: FEISHU_CONFIG.shareTrackingAppToken,
          tableId: FEISHU_CONFIG.shareTrackingTableId
        }
      )

      console.log(`更新分享统计: ${actualEmployeeName}(${actualEmployeeId}), 浏览次数: ${currentCount} -> ${newCount}`)
      return { success: true, message: '统计成功', count: newCount }
    } else {
      // 不存在则创建新记录
      await createRecord(
        {
          '分享者工号': actualEmployeeId,
          '分享者姓名': actualEmployeeName,
          '浏览总次数': 1
        },
        {
          appToken: FEISHU_CONFIG.shareTrackingAppToken,
          tableId: FEISHU_CONFIG.shareTrackingTableId
        }
      )

      console.log(`创建分享统计: ${actualEmployeeName}(${actualEmployeeId}), 浏览次数: 1`)
      return { success: true, message: '统计成功', count: 1 }
    }
  } catch (error) {
    console.error('更新分享统计失败:', error)
    return { success: false, message: error.message || '统计失败' }
  }
}

module.exports = {
  getRecords,
  getAllRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getTenantAccessToken,
  clearTokenCache,
  uploadImage,
  getTableFields,
  findShareRecord,
  updateShareTracking,
  FEISHU_CONFIG
}
