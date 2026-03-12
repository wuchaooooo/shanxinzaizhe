// pages/admin-migrate/admin-migrate.js
const { DATA_SOURCE_CONFIG } = require('../../utils/data-source-config.js')
const { getAllRecords, getTenantAccessToken, updateRecord, FEISHU_CONFIG } = require('../../utils/feishu-api.js')

Page({
  data: {
    status: 'idle', // idle, loading, migrating, completed, error
    progress: {
      total: 0,
      current: 0,
      success: 0,
      failed: 0
    },
    logs: [],
    feishuToken: null
  },

  onLoad() {
    console.log('[迁移管理] 页面加载')
  },

  // 开始迁移
  async onStartMigration() {
    this.setData({
      status: 'loading',
      logs: ['正在加载飞书数据...']
    })

    try {
      // 1. 获取飞书 token
      this.addLog('获取飞书访问令牌...')
      const token = await getTenantAccessToken()
      this.setData({ feishuToken: token })
      this.addLog('✓ 飞书令牌获取成功')

      // 2. 加载所有记录
      this.addLog('加载个人资料数据...')
      const profiles = await this.loadProfiles()
      this.addLog(`✓ 加载了 ${profiles.length} 条个人资料`)

      this.addLog('加载活动数据...')
      const events = await this.loadEvents()
      this.addLog(`✓ 加载了 ${events.length} 条活动数据`)

      // 3. 收集所有需要迁移的图片
      const imagesToMigrate = this.collectImages(profiles, events)
      this.addLog(`共需迁移 ${imagesToMigrate.length} 张图片`)

      if (imagesToMigrate.length === 0) {
        this.setData({ status: 'completed' })
        this.addLog('没有需要迁移的图片')
        return
      }

      // 4. 开始迁移
      this.setData({
        status: 'migrating',
        'progress.total': imagesToMigrate.length,
        'progress.current': 0,
        'progress.success': 0,
        'progress.failed': 0
      })

      await this.migrateImages(imagesToMigrate)

      this.setData({ status: 'completed' })
      this.addLog(`✓ 迁移完成！成功: ${this.data.progress.success}, 失败: ${this.data.progress.failed}`)

    } catch (err) {
      console.error('[迁移管理] 错误:', err)
      this.setData({ status: 'error' })
      this.addLog(`✗ 错误: ${err.message}`)
    }
  },

  // 加载个人资料（包括新表和联合创始人信息表）
  async loadProfiles() {
    // 1. 加载新表（个人资料编辑表）
    const newTableRecords = await getAllRecords({
      appToken: DATA_SOURCE_CONFIG.profileEditAppToken,
      tableId: DATA_SOURCE_CONFIG.profileEditTableId
    })
    newTableRecords.forEach(record => {
      record.sourceTable = 'profile_edit'
      record.appToken = DATA_SOURCE_CONFIG.profileEditAppToken
      record.tableId = DATA_SOURCE_CONFIG.profileEditTableId
    })
    this.addLog(`✓ 加载个人资料编辑表: ${newTableRecords.length} 条`)

    // 2. 加载联合创始人信息表
    const partnersRecords = await getAllRecords({
      appToken: FEISHU_CONFIG.partnersAppToken,
      tableId: FEISHU_CONFIG.partnersTableId
    })
    partnersRecords.forEach(record => {
      record.sourceTable = 'partners'
      record.appToken = FEISHU_CONFIG.partnersAppToken
      record.tableId = FEISHU_CONFIG.partnersTableId
    })
    this.addLog(`✓ 加载联合创始人信息表: ${partnersRecords.length} 条`)

    return [...newTableRecords, ...partnersRecords]
  },

  // 加载活动数据
  async loadEvents() {
    const eventTables = [
      { appToken: FEISHU_CONFIG.starClubAppToken, tableId: FEISHU_CONFIG.starClubTableId, type: '星享会' },
      { appToken: FEISHU_CONFIG.lunchAppToken, tableId: FEISHU_CONFIG.lunchTableId, type: '午餐会' },
      { appToken: FEISHU_CONFIG.salesClinicAppToken, tableId: FEISHU_CONFIG.salesClinicTableId, type: '销售门诊' },
      { appToken: FEISHU_CONFIG.salesBuildingAppToken, tableId: FEISHU_CONFIG.salesBuildingTableId, type: '销售建设' },
      { appToken: FEISHU_CONFIG.otherActivitiesAppToken, tableId: FEISHU_CONFIG.otherActivitiesTableId, type: '其他活动' }
    ]

    const allEvents = []

    for (const table of eventTables) {
      const records = await getAllRecords({
        appToken: table.appToken,
        tableId: table.tableId
      })

      // 给每条记录添加来源表信息
      records.forEach(record => {
        record.appToken = table.appToken
        record.tableId = table.tableId
        record.eventType = table.type
      })

      allEvents.push(...records)
      this.addLog(`✓ 加载 ${table.type}: ${records.length} 条`)
    }

    return allEvents
  },

  // 收集所有需要迁移的图片
  collectImages(profiles, events) {
    const images = []
    const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping
    const eventsMapping = DATA_SOURCE_CONFIG.eventsFieldMapping

    // 个人资料图片
    profiles.forEach(profile => {
      const fields = profile.fields

      // 头像
      const imageKey = fields[mapping.imageKey]
      const cloudFileID = fields[mapping.cloudImageFileID]
      if (imageKey && !cloudFileID) {
        images.push({
          type: 'profile_avatar',
          recordId: profile.record_id,
          imageKey,
          updateField: mapping.cloudImageFileID,
          appToken: DATA_SOURCE_CONFIG.profileEditAppToken,
          tableId: DATA_SOURCE_CONFIG.profileEditTableId
        })
      }

      // 二维码
      const qrcodeKey = fields[mapping.qrcodeKey]
      const cloudQrcodeFileID = fields[mapping.cloudQrcodeFileID]
      if (qrcodeKey && !cloudQrcodeFileID) {
        images.push({
          type: 'profile_qrcode',
          recordId: profile.record_id,
          imageKey: qrcodeKey,
          updateField: mapping.cloudQrcodeFileID,
          appToken: DATA_SOURCE_CONFIG.profileEditAppToken,
          tableId: DATA_SOURCE_CONFIG.profileEditTableId
        })
      }
    })

    // 活动图片
    events.forEach(event => {
      const fields = event.fields

      // 活动海报（可能多张）
      const imageKeys = fields[eventsMapping.imageKey]
      const cloudFileIDs = fields[eventsMapping.cloudImageFileID]

      if (imageKeys && !cloudFileIDs) {
        const keys = imageKeys.split(',').map(k => k.trim()).filter(k => k)
        keys.forEach(key => {
          images.push({
            type: 'event_poster',
            recordId: event.record_id,
            imageKey: key,
            updateField: eventsMapping.cloudImageFileID,
            appToken: event.appToken, // 需要记录来源表
            tableId: event.tableId,
            isMultiple: true // 标记为多图片字段
          })
        })
      }

      // 签到码
      const checkinKey = fields[eventsMapping.checkinQrcodeKey]
      const cloudCheckinFileID = fields[eventsMapping.cloudCheckinQrcodeFileID]
      if (checkinKey && !cloudCheckinFileID) {
        images.push({
          type: 'event_checkin',
          recordId: event.record_id,
          imageKey: checkinKey,
          updateField: eventsMapping.cloudCheckinQrcodeFileID,
          appToken: event.appToken,
          tableId: event.tableId
        })
      }
    })

    return images
  },

  // 迁移图片
  async migrateImages(images) {
    const concurrency = 3 // 并发数

    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency)

      await Promise.all(batch.map(async (image) => {
        try {
          // 确定图片类型（avatar 或 event）
          const imageType = image.type.startsWith('event_') ? 'event' : 'avatar'

          // 调用云函数迁移
          const result = await wx.cloud.callFunction({
            name: 'migrateImagesToCloud',
            data: {
              feishuImageKey: image.imageKey,
              feishuToken: this.data.feishuToken,
              imageType: imageType
            }
          })

          if (result.result.success) {
            // 更新飞书记录
            await this.updateFeishuRecord(image, result.result.fileID)

            this.setData({
              'progress.current': this.data.progress.current + 1,
              'progress.success': this.data.progress.success + 1
            })
            this.addLog(`✓ [${this.data.progress.current}/${this.data.progress.total}] ${image.type}: ${image.imageKey}`)
          } else {
            throw new Error(result.result.error)
          }
        } catch (err) {
          console.error('[迁移] 失败:', image.imageKey, err)
          this.setData({
            'progress.current': this.data.progress.current + 1,
            'progress.failed': this.data.progress.failed + 1
          })
          this.addLog(`✗ [${this.data.progress.current}/${this.data.progress.total}] ${image.type}: ${image.imageKey} - ${err.message}`)
        }
      }))
    }
  },

  // 更新飞书记录
  async updateFeishuRecord(image, fileID) {
    console.log('[迁移] 更新飞书记录:', {
      recordId: image.recordId,
      field: image.updateField,
      fileID
    })

    // 如果是多图片字段，需要追加而不是覆盖
    if (image.isMultiple) {
      // 读取现有的 cloudFileIDs
      const existingFileIDs = image.existingCloudFileIDs || ''
      const newFileIDs = existingFileIDs ? `${existingFileIDs},${fileID}` : fileID

      await updateRecord(
        image.recordId,
        { [image.updateField]: newFileIDs },
        {
          appToken: image.appToken,
          tableId: image.tableId
        }
      )
    } else {
      // 单图片字段，直接更新
      await updateRecord(
        image.recordId,
        { [image.updateField]: fileID },
        {
          appToken: image.appToken,
          tableId: image.tableId
        }
      )
    }
  },

  // 添加日志
  addLog(message) {
    const logs = this.data.logs
    logs.push(`[${new Date().toLocaleTimeString()}] ${message}`)
    this.setData({ logs })

    // 滚动到底部
    this.setData({
      scrollIntoView: `log-${logs.length - 1}`
    })
  }
})
