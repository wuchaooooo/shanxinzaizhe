// pages/profile-edit/profile-edit.js
const { findProfileEditRecord, findProfileEditRecordByOpenid, saveProfileEditRecord, extractFieldText, feishuDateToYYYYMM, yyyymmToFeishuDate } = require('../../utils/profile-edit-api.js')
const { DATA_SOURCE_CONFIG } = require('../../utils/data-source-config.js')

const BADGE_OPTIONS = [
  { title: '钻石人才DA',    desc: '首3月业绩定级' },
  { title: '铂金人才PA',    desc: '首三月业绩定级' },
  { title: '五星会会员',    desc: '连续3个月达成五星会' },
  { title: '五星会精英会员', desc: '连续6个月达成五星会' },
  { title: '五星会钻石会员', desc: '连续12个月达成五星会' },
  { title: '五星会终身会员', desc: '连续60个月达成五星会' },
  { title: '金五星会员',    desc: '连续3个月达成金五星会' },
  { title: '金五星精英会员', desc: '连续6个月达成金五星会' },
  { title: '金五星钻石会员', desc: '连续12个月达成金五星会' },
  { title: '金五星终身会员', desc: '连续60个月达成金五星会' },
  { title: 'MDRT',         desc: 'MDRT百万圆桌会员' },
  { title: 'COT',          desc: 'COT会员' },
  { title: 'TOT',          desc: 'TOT会员' }
]

function buildBadgeOptions(selectedList) {
  const selectedTitles = new Set((selectedList || []).map(b => b.title))
  return BADGE_OPTIONS.map(b => Object.assign({}, b, { checked: selectedTitles.has(b.title) }))
}

// ── 解析：字符串 → 列表（加载时使用，只支持 JSON 格式）────────────────────

function parseTagsToList(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function parseSkillsToList(str) {
  return parseTagsToList(str)
}

function tagsListToStr(list) {
  return JSON.stringify((list || []).filter(s => s.trim()))
}

function parseBadgesToList(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

// 根据 timeStart / timeEnd 计算展示文本
// 只有开始时间：显示完整日期；两者都有：显示 YYYY-MM ~ YYYY-MM
function computeTimeDisplay(timeStart, timeEnd) {
  if (!timeStart) return ''
  if (timeEnd) return timeStart.slice(0, 7) + ' ~ ' + timeEnd.slice(0, 7)
  return timeStart
}

function parseTimelineToList(str) {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        timeStart: item.timeStart || '',
        timeEnd: item.timeEnd || '',
        timeDisplay: computeTimeDisplay(item.timeStart, item.timeEnd),
        title: item.title || '',
        desc: item.desc || ''
      }))
    }
  } catch (e) {}
  return []
}

// 入司时间：YYYY-MM 补成 YYYY-MM-01
function normalizeJoinDate(d) {
  if (!d) return ''
  if (/^\d{4}-\d{2}$/.test(d)) return d + '-01'
  return d
}

// ── 服务客户数滚轮：两列 picker 数据 ─────────────────────────────────────────

const CUSTOMERS_COL0 = (function () {
  const a = []
  for (let i = 0; i <= 5000; i += 100) a.push(String(i))
  return a
})()
const CUSTOMERS_COL1 = (function () {
  const a = []
  for (let i = 0; i <= 99; i++) a.push(String(i))
  return a
})()

function customersToPickerIndex(n) {
  const num = parseInt(n) || 0
  return [Math.min(Math.floor(num / 100), CUSTOMERS_COL0.length - 1), Math.min(num % 100, 99)]
}

// ── 序列化：列表 → 字符串（保存时使用，统一用 JSON）────────────────────────

function skillsListToStr(list) {
  return JSON.stringify((list || []).filter(s => s.trim()))
}

function badgesListToStr(list) {
  return JSON.stringify((list || []).filter(b => b.title.trim()))
}

function timelineListToStr(list) {
  return JSON.stringify((list || []).filter(l => l.title.trim() || l.timeStart.trim()).map(l => ({
    timeStart: l.timeStart,
    timeEnd: l.timeEnd,
    title: l.title,
    desc: l.desc
  })))
}

Page({
  data: {
    saving: false,
    employeeId: '',
    existingRecordId: null,
    newSkill: '',   // 专业领域新增输入框的临时值
    newSchool: '',  // 毕业院校新增输入框的临时值
    newTitle: '',   // 前职工作新增输入框的临时值
    badgeOptions: buildBadgeOptions([]),  // 勋章复选列表
    drag: { active: false, type: '', fromIndex: -1, toIndex: -1 },  // 拖拽状态
    customersPickerCols: [CUSTOMERS_COL0, CUSTOMERS_COL1],
    customersPickerIndex: [0, 0],
    formData: {
      name: '',
      schoolList: [],       // 毕业院校列表 string[]
      titleList: [],        // 前职工作列表 string[]
      joinDate: '',
      customersServed: '',
      bio: '',
      skillsList: [],       // 专业领域列表 string[]
      badgesList: [],       // 荣誉勋章列表 {title,desc}[]
      timelineList: [],     // 成长足迹列表 {time,title,desc}[]
      activitiesList: [],   // 最近动态列表 {time,title,desc}[]
      avatarImage: null,
      qrcodeImage: null
    }
  },

  async onLoad(options) {
    const employeeId = options.employeeId
    const openid = options.openid

    // 如果是通过 openid 进入（未完善资料），标记为通过 openid 模式
    if (openid && !employeeId) {
      this.setData({ 
        loadByOpenid: true,
        openid: openid
      })
    } else {
      this.setData({ employeeId })
    }

    wx.showLoading({ title: '加载中...' })
    try {
      if (openid && !employeeId) {
        await this._loadFormDataByOpenid(openid)
      } else {
        await this._loadFormData(employeeId)
      }
    } finally {
      wx.hideLoading()
    }
  },

  onUnload() {},

  async _loadFormData(employeeId) {
    const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping

    const record = await findProfileEditRecord(employeeId)

    if (record) {
      // 新表已有记录：直接填充
      this.setData({ existingRecordId: record.record_id })
      const f = record.fields

      const badgesList = parseBadgesToList(extractFieldText(f[mapping.badges]))
      const timelineList = parseTimelineToList(extractFieldText(f[mapping.timeline]))
      const activitiesList = parseTimelineToList(extractFieldText(f[mapping.activities]))

      // 按开始时间倒序排列
      timelineList.sort((a, b) => (b.timeStart || '').localeCompare(a.timeStart || ''))
      activitiesList.sort((a, b) => (b.timeStart || '').localeCompare(a.timeStart || ''))

      this.setData({
        'formData.name':            extractFieldText(f[mapping.name]),
        'formData.schoolList':      parseTagsToList(extractFieldText(f[mapping.school])),
        'formData.titleList':       parseTagsToList(extractFieldText(f[mapping.title])),
        'formData.joinDate':        normalizeJoinDate(feishuDateToYYYYMM(f[mapping.joinDate])),
        'formData.customersServed': f[mapping.customersServed] !== undefined ? extractFieldText(f[mapping.customersServed]) : '',
        customersPickerIndex: customersToPickerIndex(f[mapping.customersServed] !== undefined ? extractFieldText(f[mapping.customersServed]) : 0),
        'formData.bio':             extractFieldText(f[mapping.bio]),
        'formData.skillsList':      parseSkillsToList(extractFieldText(f[mapping.skills])),
        'formData.badgesList':      badgesList,
        'formData.timelineList':    timelineList,
        'formData.activitiesList':  activitiesList,
        badgeOptions:               buildBadgeOptions(badgesList)
      })

      // 从 globalData 中获取已下载的头像和二维码
      const app = getApp()
      const partnersData = app.globalData.partnersData || []
      const partner = partnersData.find(p => p.employeeId === employeeId)
      if (partner) {
        console.log('[ProfileEdit] 找到合伙人数据:', {
          name: partner.name,
          hasImage: !!partner.image,
          hasQrcode: !!partner.qrcode,
          imageKey: partner.imageKey,
          qrcodeKey: partner.qrcodeKey
        })
        if (partner.image) {
          this.setData({ 'formData.avatarImage': { path: partner.image, imageKey: partner.imageKey, isNew: false } })
        }
        if (partner.qrcode) {
          this.setData({ 'formData.qrcodeImage': { path: partner.qrcode, qrcodeKey: partner.qrcodeKey, isNew: false } })
        }
      } else {
        console.log('[ProfileEdit] 未找到合伙人数据，employeeId:', employeeId)
      }
    } else {
      // 新表无记录：显示空表单
      console.log('新表无记录，显示空表单')
    }
  },

  async _loadFormDataByOpenid(openid) {
    const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping

    const record = await findProfileEditRecordByOpenid(openid)

    if (record) {
      // 找到记录：填充数据
      this.setData({ existingRecordId: record.record_id })
      const f = record.fields

      // 获取 employeeId（可能为空）
      const employeeId = extractFieldText(f[mapping.employeeId])
      if (employeeId) {
        this.setData({ employeeId })
      }

      const badgesList = parseBadgesToList(extractFieldText(f[mapping.badges]))
      const timelineList = parseTimelineToList(extractFieldText(f[mapping.timeline]))
      const activitiesList = parseTimelineToList(extractFieldText(f[mapping.activities]))

      // 按开始时间倒序排列
      timelineList.sort((a, b) => (b.timeStart || '').localeCompare(a.timeStart || ''))
      activitiesList.sort((a, b) => (b.timeStart || '').localeCompare(a.timeStart || ''))

      this.setData({
        'formData.name':            extractFieldText(f[mapping.name]),
        'formData.schoolList':      parseTagsToList(extractFieldText(f[mapping.school])),
        'formData.titleList':       parseTagsToList(extractFieldText(f[mapping.title])),
        'formData.joinDate':        normalizeJoinDate(feishuDateToYYYYMM(f[mapping.joinDate])),
        'formData.customersServed': f[mapping.customersServed] !== undefined ? extractFieldText(f[mapping.customersServed]) : '',
        customersPickerIndex: customersToPickerIndex(f[mapping.customersServed] !== undefined ? extractFieldText(f[mapping.customersServed]) : 0),
        'formData.bio':             extractFieldText(f[mapping.bio]),
        'formData.skillsList':      parseSkillsToList(extractFieldText(f[mapping.skills])),
        'formData.badgesList':      badgesList,
        'formData.timelineList':    timelineList,
        'formData.activitiesList':  activitiesList,
        badgeOptions:               buildBadgeOptions(badgesList)
      })

      // 从 globalData 中获取已下载的头像和二维码
      const app = getApp()
      const partnersData = app.globalData.partnersData || []
      const partner = partnersData.find(p => p.wxOpenid === openid || (employeeId && p.employeeId === employeeId))
      if (partner) {
        console.log('[ProfileEdit] 找到合伙人数据 (by openid):', {
          name: partner.name,
          hasImage: !!partner.image,
          hasQrcode: !!partner.qrcode,
          imageKey: partner.imageKey,
          qrcodeKey: partner.qrcodeKey
        })
        if (partner.image) {
          this.setData({ 'formData.avatarImage': { path: partner.image, imageKey: partner.imageKey, isNew: false } })
        }
        if (partner.qrcode) {
          this.setData({ 'formData.qrcodeImage': { path: partner.qrcode, qrcodeKey: partner.qrcodeKey, isNew: false } })
        }
      } else {
        console.log('[ProfileEdit] 未找到合伙人数据 (by openid):', openid, employeeId)
      }
    } else {
      // 没有找到记录：显示空表单
      console.log('通过openid未找到记录，显示空表单')
    }
  },

  // ── 基本信息输入 ────────────────────────────────────────────────────────────

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`formData.${field}`]: e.detail.value })
  },

  onEmployeeIdInput(e) {
    this.setData({ employeeId: e.detail.value })
  },

  // ── 毕业院校 ────────────────────────────────────────────────────────────

  onNewSchoolInput(e) {
    this.setData({ newSchool: e.detail.value })
  },

  onAddSchool() {
    const school = this.data.newSchool.trim()
    if (!school) return
    const list = [...this.data.formData.schoolList, school]
    this.setData({
      'formData.schoolList': list,
      newSchool: ''
    })
  },

  onDeleteSchool(e) {
    const index = e.currentTarget.dataset.index
    const list = [...this.data.formData.schoolList]
    list.splice(index, 1)
    this.setData({ 'formData.schoolList': list })
  },

  // ── 前职工作 ────────────────────────────────────────────────────────────

  onNewTitleInput(e) {
    this.setData({ newTitle: e.detail.value })
  },

  onAddTitle() {
    const title = this.data.newTitle.trim()
    if (!title) return
    const list = [...this.data.formData.titleList, title]
    this.setData({
      'formData.titleList': list,
      newTitle: ''
    })
  },

  onDeleteTitle(e) {
    const index = e.currentTarget.dataset.index
    const list = [...this.data.formData.titleList]
    list.splice(index, 1)
    this.setData({ 'formData.titleList': list })
  },

  // ── 入司时间 ────────────────────────────────────────────────────────────

  onJoinDateChange(e) {
    this.setData({ 'formData.joinDate': e.detail.value })
  },

  // ── 专业领域 ────────────────────────────────────────────────────────────

  onNewSkillInput(e) {
    this.setData({ newSkill: e.detail.value })
  },

  onAddSkill() {
    const skill = this.data.newSkill.trim()
    if (!skill) return
    const list = [...this.data.formData.skillsList, skill]
    this.setData({
      'formData.skillsList': list,
      newSkill: ''
    })
  },

  onDeleteSkill(e) {
    const index = e.currentTarget.dataset.index
    const list = [...this.data.formData.skillsList]
    list.splice(index, 1)
    this.setData({ 'formData.skillsList': list })
  },

  // ── 图片上传 ────────────────────────────────────────────────────────────

  onChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFilePaths[0]

        // 检查文件大小
        wx.getFileInfo({
          filePath: filePath,
          success: (fileInfo) => {
            const maxSize = 8 * 1024 * 1024 // 8MB
            if (fileInfo.size > maxSize) {
              wx.showToast({
                title: '图片大小不能超过8MB',
                icon: 'none'
              })
              return
            }

            this.setData({
              'formData.avatarImage': { path: filePath, isNew: true }
            })
          },
          fail: () => {
            // 如果获取文件信息失败，仍然允许上传
            this.setData({
              'formData.avatarImage': { path: filePath, isNew: true }
            })
          }
        })
      }
    })
  },

  onChooseQrcode() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFilePaths[0]

        // 检查文件大小
        wx.getFileInfo({
          filePath: filePath,
          success: (fileInfo) => {
            const maxSize = 8 * 1024 * 1024 // 8MB
            if (fileInfo.size > maxSize) {
              wx.showToast({
                title: '图片大小不能超过8MB',
                icon: 'none'
              })
              return
            }

            this.setData({
              'formData.qrcodeImage': { path: filePath, isNew: true }
            })
          },
          fail: () => {
            // 如果获取文件信息失败，仍然允许上传
            this.setData({
              'formData.qrcodeImage': { path: filePath, isNew: true }
            })
          }
        })
      }
    })
  },

  // ── 保存 ────────────────────────────────────────────────────────────

  async onSave() {
    if (this.data.saving) return

    // 验证必填字段
    const { formData, employeeId, loadByOpenid, openid } = this.data

    // 姓名必填
    if (!formData.name || !formData.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    // 如果是通过 openid 模式，需要验证营销员工号
    if (loadByOpenid && (!employeeId || !employeeId.trim())) {
      wx.showToast({ title: '请输入营销员工号', icon: 'none' })
      return
    }

    // 个人头像必填
    if (!formData.avatarImage || !formData.avatarImage.path) {
      wx.showToast({ title: '请上传个人头像', icon: 'none' })
      return
    }

    // 微信二维码必填
    if (!formData.qrcodeImage || !formData.qrcodeImage.path) {
      wx.showToast({ title: '请上传微信二维码', icon: 'none' })
      return
    }

    // 毕业院校必填
    if (!formData.schoolList || formData.schoolList.length === 0) {
      wx.showToast({ title: '请至少添加一个毕业院校', icon: 'none' })
      return
    }

    // 前职工作必填
    if (!formData.titleList || formData.titleList.length === 0) {
      wx.showToast({ title: '请至少添加一个前职工作', icon: 'none' })
      return
    }

    // 入司时间必填
    if (!formData.joinDate || !formData.joinDate.trim()) {
      wx.showToast({ title: '请选择入司时间', icon: 'none' })
      return
    }

    // 服务客户数必填且必须是数字
    if (!formData.customersServed || formData.customersServed.trim() === '') {
      wx.showToast({ title: '请输入服务客户数', icon: 'none' })
      return
    }

    const customersNum = Number(formData.customersServed)
    if (isNaN(customersNum) || customersNum < 0) {
      wx.showToast({ title: '服务客户数必须是有效的数字', icon: 'none' })
      return
    }

    // 个人介绍必填
    if (!formData.bio || !formData.bio.trim()) {
      wx.showToast({ title: '请输入个人介绍', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      const finalEmployeeId = loadByOpenid ? employeeId : this.data.employeeId
      const mapping = DATA_SOURCE_CONFIG.feishuFieldMapping

      // 构建飞书字段
      const fields = {
        [mapping.employeeId]: finalEmployeeId,
        [mapping.name]: formData.name,
        [mapping.school]: tagsListToStr(formData.schoolList),
        [mapping.title]: tagsListToStr(formData.titleList),
        [mapping.joinDate]: yyyymmToFeishuDate(formData.joinDate),
        [mapping.customersServed]: formData.customersServed,
        [mapping.bio]: formData.bio,
        [mapping.skills]: tagsListToStr(formData.skillsList),
        [mapping.badges]: JSON.stringify(formData.badgesList || []),
        [mapping.timeline]: JSON.stringify(formData.timelineList || []),
        [mapping.activities]: JSON.stringify(formData.activitiesList || [])
      }

      // 如果是通过 openid 模式，添加 openid 字段
      if (loadByOpenid && openid) {
        fields[mapping.wxOpenid] = openid
      }

      // 处理图片上传
      const feishuApi = require('../../utils/feishu-api.js')

      // 上传头像
      if (formData.avatarImage && formData.avatarImage.isNew) {
        wx.showLoading({ title: '上传头像中...' })
        try {
          const imageKey = await feishuApi.uploadImage(formData.avatarImage.path)
          fields[mapping.imageKey] = imageKey
        } catch (err) {
          console.error('头像上传失败:', err)
          wx.hideLoading()
          wx.showToast({ title: '头像上传失败', icon: 'none' })
          this.setData({ saving: false })
          return
        }
        wx.hideLoading()
      } else if (formData.avatarImage && formData.avatarImage.imageKey) {
        // 保留原有的 imageKey
        fields[mapping.imageKey] = formData.avatarImage.imageKey
      }

      // 上传二维码
      if (formData.qrcodeImage && formData.qrcodeImage.isNew) {
        wx.showLoading({ title: '上传二维码中...' })
        try {
          const qrcodeKey = await feishuApi.uploadImage(formData.qrcodeImage.path)
          fields[mapping.qrcodeKey] = qrcodeKey
        } catch (err) {
          console.error('二维码上传失败:', err)
          wx.hideLoading()
          wx.showToast({ title: '二维码上传失败', icon: 'none' })
          this.setData({ saving: false })
          return
        }
        wx.hideLoading()
      } else if (formData.qrcodeImage && formData.qrcodeImage.qrcodeKey) {
        // 保留原有的 qrcodeKey
        fields[mapping.qrcodeKey] = formData.qrcodeImage.qrcodeKey
      }

      wx.showLoading({ title: '保存中...' })
      await saveProfileEditRecord(finalEmployeeId, fields, this.data.existingRecordId)
      wx.hideLoading()

      wx.showToast({ title: '保存成功', icon: 'success' })

      // 保存成功后，触发飞书数据刷新
      const app = getApp()
      if (app.preloadFeishuData) {
        // 延迟刷新，让用户看到成功提示
        setTimeout(() => {
          app.preloadFeishuData()
        }, 500)
      }

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      console.error('保存失败:', err)
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // ── 勋章编辑 ────────────────────────────────────────────────────────────

  onEditBadges() {
    const app = getApp()
    app.globalData._badgeOptions = this.data.badgeOptions
    wx.navigateTo({
      url: '/pages/badge-select/badge-select'
    })
  },

  onBadgesSave(data) {
    const { badgeOptions } = data
    const selectedBadges = badgeOptions.filter(b => b.checked).map(b => ({ title: b.title, desc: b.desc }))
    this.setData({
      badgeOptions: badgeOptions,
      'formData.badgesList': selectedBadges
    })
  },

  // ── 时间线项目 ────────────────────────────────────────────────────────────

  onAddItem(e) {
    const type = e.currentTarget.dataset.type
    wx.navigateTo({
      url: `/pages/timeline-item-edit/timeline-item-edit?mode=add&type=${type}`
    })
  },

  onEditItem(e) {
    const type = e.currentTarget.dataset.type
    const index = e.currentTarget.dataset.index
    const listKey = type === 'timeline' ? 'timelineList' : 'activitiesList'
    const item = this.data.formData[listKey][index]

    const app = getApp()
    app.globalData._editingTimelineItem = item

    wx.navigateTo({
      url: `/pages/timeline-item-edit/timeline-item-edit?mode=edit&type=${type}&index=${index}`
    })
  },

  onTimelineItemSave(data) {
    const { type, item, index } = data
    const listKey = type === 'timeline' ? 'timelineList' : 'activitiesList'
    const list = [...this.data.formData[listKey]]

    // 计算 timeDisplay
    const itemWithDisplay = {
      ...item,
      timeDisplay: computeTimeDisplay(item.timeStart, item.timeEnd)
    }

    if (index !== undefined && index >= 0) {
      list[index] = itemWithDisplay
    } else {
      list.push(itemWithDisplay)
    }

    // 按开始时间倒序排列
    list.sort((a, b) => (b.timeStart || '').localeCompare(a.timeStart || ''))

    this.setData({
      [`formData.${listKey}`]: list
    })
  },

  onTimelineItemDelete(data) {
    const { type, index } = data
    const listKey = type === 'timeline' ? 'timelineList' : 'activitiesList'
    const list = [...this.data.formData[listKey]]
    list.splice(index, 1)

    this.setData({
      [`formData.${listKey}`]: list
    })
  },

  // ── 删除记录 ────────────────────────────────────────────────────────────

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条个人资料吗？删除后将无法恢复。',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            const feishuApi = require('../../utils/feishu-api.js')

            // 删除记录
            await feishuApi.deleteRecord(this.data.existingRecordId, {
              appToken: DATA_SOURCE_CONFIG.profileEditAppToken,
              tableId: DATA_SOURCE_CONFIG.profileEditTableId
            })

            wx.hideLoading()
            wx.showToast({ title: '删除成功', icon: 'success' })

            // 延迟返回，让用户看到成功提示
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          } catch (err) {
            console.error('删除失败:', err)
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  }
})
