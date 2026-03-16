// pages/team/team.js
const { loadAllProfilesText } = require('../../utils/profile-loader.js')
const { getAssetPath } = require('../../utils/assets-loader.js')
const { animateNumbers } = require('../../utils/animate.js')
const { generateTeamPoster, generateShareImage } = require('../../utils/poster-generator.js')
const { DATA_SOURCE_CONFIG } = require('../../utils/data-source-config.js')
const { runSplashIfNeeded } = require('../../utils/splash.js')
const { getAllRecords } = require('../../utils/feishu-api.js')

// 处理合伙人数据
// team页面只显示第一个学校和职位
function processPartnerData(partner) {
  // school 和 title 现在是数组
  const schoolArray = Array.isArray(partner.school) ? partner.school : [partner.school || '']
  const titleArray = Array.isArray(partner.title) ? partner.title : [partner.title || '']

  return {
    ...partner,
    schoolLines: schoolArray.length > 0 ? [schoolArray[0]] : [''],
    titleLines: titleArray.length > 0 ? [titleArray[0]] : ['']
  }
}

// 按入司时间倒序排序（最新的在前）
function sortByJoinDate(partners) {
  return partners.sort((a, b) => {
    const dateA = a.joinDate || ''
    const dateB = b.joinDate || ''
    // 倒序：dateB > dateA 时返回正数
    return dateB.localeCompare(dateA)
  })
}

// 检测指定 openid 是否有未完善的资料（有 openid 但没有 employeeId）
function checkIncompleteProfile(partners, targetOpenid) {
  if (!targetOpenid) return false

  const incomplete = partners.find(p => {
    const hasOpenid = !!(p.wxOpenid && p.wxOpenid.trim())
    const hasEmployeeId = !!(p.employeeId && p.employeeId.trim())
    const isTargetUser = p.wxOpenid === targetOpenid
    return hasOpenid && !hasEmployeeId && isTargetUser
  })

  return !!incomplete
}

// 过滤掉未完善的资料（用于正常显示）
function filterCompleteProfiles(partners) {
  return partners.filter(p => p.employeeId)
}

// 生成占位符数据（用于首次加载时显示骨架屏）
function generatePlaceholders(count = 15) {
  return Array.from({ length: count }, (_, i) => ({
    name: `加载中...`,
    school: '',
    title: '',
    image: '',
    loaded: false,
    schoolLines: [''],
    titleLines: [''],
    employeeId: `placeholder_${i}`
  }))
}

function getInitialPartners() {
  const app = getApp()
  const cached = app.globalData.partnersData || []

  if (cached.length > 0) {
    // 过滤掉未完善的资料，只显示有 employeeId 的
    const completeProfiles = filterCompleteProfiles(cached)
    const partners = completeProfiles.map(partner => {
      // 修改：初始都设为 false，等待图片下载或确认没有图片
      const result = processPartnerData({
        ...partner,
        loaded: false
      })
      return result
    })

    // 关键修复：确保排序一致性，避免与 onLoad 中的排序不一致
    return sortByJoinDate(partners)
  }
  // 如果没有缓存数据，返回占位符
  return generatePlaceholders()
}

Page({
  data: {
    // 开屏动画
    showSplash: false,
    splashLogoUrl: '',
    splashLogoVisible: false,
    splashHeartbeat: false,
    splashMeltOut: false,
    splashNavBarHeight: 0,
    searchQuery: '',
    partners: getInitialPartners(),
    filteredPartners: getInitialPartners(),  // 使用缓存的图片初始化
    teamCount: 0,
    totalBadges: 0,
    uniqueSkills: 0,
    searchPlaceholder: '搜索善心浙里联合创始人',
    isApplyMode: false,
    isSearching: false,
    activeTab: '全部前职',
    tabs: ['全部前职'],
    visibleTabs: ['全部前职'],  // tabs 前8个，用于 tab 栏渲染
    hasMoreTabs: false,         // tabs.length > 8
    tabScrollLeft: 0,
    showTagPanel: false,
    titleTagsData: [],          // 前职标签数据（包含关键词和别名）
    isCofounder: false,  // 当前用户是否为联合创始人
    identityChecked: false,  // 身份识别是否完成
    loading: false,
    allImagesLoaded: false, // 是否所有合伙人头像已加载完成
    shanxinLogoUrl: '', // 善心logo
    aiaFooterUrl: '', // AIA footer 图片
    posterBtnLogoLoaded: false, // 海报按钮logo是否加载完成
    posterScrollReady: true, // 控制scroll-view的渲染，用于重置滚动位置
    shareImageUrl: '', // 分享图片路径
    hasIncompleteProfile: false, // 是否有未完善的资料（有openid但无employeeId）
    incompleteProfileOpenid: '', // 未完善资料的openid
    enableItemAnimation: false // 保留兼容，已由 item.animated 替代
  },

  checkAllImagesLoaded(partners) {
    if (!partners || partners.length === 0) return false
    return partners.every(p => p.loaded)
  },

  // 防抖更新：合并多个 setData 调用
  _scheduleUpdate() {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer)
    }

    this._updateTimer = setTimeout(() => {
      const pendingCount = Object.keys(this._pendingUpdates).length

      if (pendingCount > 0) {
        // 计算 allImagesLoaded 并合并到同一次 setData
        const updatedPartners = [...this.data.partners]

        // 应用待更新的数据到临时数组
        Object.keys(this._pendingUpdates).forEach(key => {
          const match = key.match(/partners\[(\d+)\]\.(\w+)/)
          if (match) {
            const idx = parseInt(match[1])
            const field = match[2]
            if (updatedPartners[idx]) {
              updatedPartners[idx] = { ...updatedPartners[idx], [field]: this._pendingUpdates[key] }
            }
          }
        })

        // 合并 allImagesLoaded 到同一次 setData
        const allLoaded = this.checkAllImagesLoaded(updatedPartners)
        this._pendingUpdates.allImagesLoaded = allLoaded

        // 一次性更新所有数据
        this.setData(this._pendingUpdates)
        this._pendingUpdates = {}
      }
    }, 100)  // 增加到100ms，进一步减少setData频率
  },

  // 同步已下载的图片路径（从 globalData 到页面数据）
  _syncDownloadedImages() {
    const app = getApp()
    const globalPartners = app.globalData.partnersData || []
    if (globalPartners.length === 0) {
      return
    }

    const partners = this.data.partners
    const updates = {}
    let hasUpdates = false
    let syncCount = 0

    partners.forEach((partner, idx) => {
      // 使用 employeeId 匹配（更可靠）
      const globalPartner = globalPartners.find(p => p.employeeId === partner.employeeId)
      if (!globalPartner) {
        return
      }

      // 新增：如果没有 cloudImageFileID，说明没有图片要下载，立即标记为 loaded
      if (!globalPartner.cloudImageFileID && !partner.loaded) {
        updates[`partners[${idx}].loaded`] = true
        updates[`partners[${idx}].animated`] = true
        hasUpdates = true
        syncCount++

        const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === partner.employeeId)
        if (fidx !== -1) {
          updates[`filteredPartners[${fidx}].loaded`] = true
          updates[`filteredPartners[${fidx}].animated`] = true
        }
        return  // 跳过后续的图片同步逻辑
      }

      // 同步头像：CDN 模式下 globalPartner.image 已是 CDN URL，直接同步
      let imageToSync = null
      if (globalPartner.image && globalPartner.image !== partner.image) {
        imageToSync = globalPartner.image
      }

      if (imageToSync) {
        updates[`partners[${idx}].image`] = imageToSync
        updates[`partners[${idx}].loaded`] = true
        updates[`partners[${idx}].animated`] = true
        hasUpdates = true
        syncCount++

        // 同时更新 filteredPartners
        const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === partner.employeeId)
        if (fidx !== -1) {
          updates[`filteredPartners[${fidx}].image`] = imageToSync
          updates[`filteredPartners[${fidx}].loaded`] = true
          updates[`filteredPartners[${fidx}].animated`] = true
        }
      } else if (partner.image && !partner.loaded) {
        // 图片路径已同步但 loaded 仍为 false（竞态导致），直接修复
        updates[`partners[${idx}].loaded`] = true
        updates[`partners[${idx}].animated`] = true
        hasUpdates = true
        syncCount++

        const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === partner.employeeId)
        if (fidx !== -1) {
          updates[`filteredPartners[${fidx}].loaded`] = true
          updates[`filteredPartners[${fidx}].animated`] = true
        }
      }

      // 同步二维码
      if (globalPartner.qrcode && globalPartner.qrcode !== partner.qrcode) {
        updates[`partners[${idx}].qrcode`] = globalPartner.qrcode
        hasUpdates = true

        const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === partner.employeeId)
        if (fidx !== -1) {
          updates[`filteredPartners[${fidx}].qrcode`] = globalPartner.qrcode
        }
      }
    })

    if (hasUpdates) {

      // 计算更新后的 allImagesLoaded 状态
      const updatedPartners = [...this.data.partners]
      Object.keys(updates).forEach(key => {
        const match = key.match(/partners\[(\d+)\]\.(\w+)/)
        if (match) {
          const idx = parseInt(match[1])
          const field = match[2]
          if (updatedPartners[idx]) {
            updatedPartners[idx] = { ...updatedPartners[idx], [field]: updates[key] }
          }
        }
      })

      // 同时更新 allImagesLoaded
      updates.allImagesLoaded = this.checkAllImagesLoaded(updatedPartners)

      this.setData(updates)
    }
  },

  onLoad() {
    // 开屏动画（全局只播一次）
    runSplashIfNeeded(this)

    // 首次加载时不启用动画，让骨架屏一开始就全部显示
    // （动画会导致骨架屏一个一个出现）

    // 初始化批量更新队列
    this._pendingUpdates = {}  // 待更新的数据
    this._updateTimer = null   // 防抖定时器

    // 加载善心 logo（代码：shanxinzheli）
    const shanxinLogoPath = getAssetPath('shanxinzheli')
    if (shanxinLogoPath) {
      this.setData({
        shanxinLogoUrl: shanxinLogoPath,
        posterBtnLogoLoaded: true  // logo已加载，设置为true
      })
    } else {
      // 路径为空时，等待异步加载完成
    }

    // 加载 AIA footer（代码：aia_footer）
    const aiaFooterPath = getAssetPath('aia_footer')
    if (aiaFooterPath) {
      this.setData({ aiaFooterUrl: aiaFooterPath })
    }

    const app = getApp()
    // 注册静态资源下载完成回调
    this._assetsDataCb = (assets) => {
      if (assets && assets['shanxinzheli']) {
        const path = typeof assets['shanxinzheli'] === 'string' ? assets['shanxinzheli'] : assets['shanxinzheli'].path
        this.setData({
          shanxinLogoUrl: path,
          posterBtnLogoLoaded: true  // logo已加载，设置为true
        })
      }
      if (assets && assets['aia_footer']) {
        const path = typeof assets['aia_footer'] === 'string' ? assets['aia_footer'] : assets['aia_footer'].path
        this.setData({ aiaFooterUrl: path })
      }
    }
    app.globalData.assetsDataListeners.push(this._assetsDataCb)

    const partnersData = app.globalData.partnersData || []

    if (partnersData.length > 0) {
      // 检测当前用户是否有未完善的资料
      const currentOpenid = app.globalData.openid || ''
      const hasIncompleteProfile = checkIncompleteProfile(partnersData, currentOpenid)

      // 过滤掉未完善的资料，只显示有 employeeId 的
      const completeProfiles = filterCompleteProfiles(partnersData)
      const sortedData = sortByJoinDate([...completeProfiles])
      const partners = sortedData.map(partner => {
        const result = processPartnerData({
          ...partner,
          loaded: !!partner.image,   // CDN 模式下有 image URL 即视为已加载
          animated: !!partner.image  // 已加载的立即触发入场动画
        })
        return result
      })
      this.setData({
        partners,
        filteredPartners: partners,
        allImagesLoaded: this.checkAllImagesLoaded(partners),
        hasIncompleteProfile,
        incompleteProfileOpenid: currentOpenid
      })
      this.calculateStats()
      // 同步已下载的图片路径（解决竞态条件）
      this._syncDownloadedImages()
    } else {
      this.loadFeishuData()
    }

    // 注册图片下载完成回调，处理头像和二维码
    this._imageReadyCb = (type, employeeId, path) => {

      if (type !== 'avatar') {
        return  // 只处理头像，二维码不在列表页显示
      }

      const partners = this.data.partners
      const idx = partners.findIndex(p => p.employeeId === employeeId)
      if (idx === -1) {
        return
      }

      // 防御性检查：如果已经是这个路径且已标记为 loaded，跳过
      if (partners[idx].image === path && partners[idx].loaded) {
        return
      }

      // 同时更新 globalData，确保其他页面能获取到最新数据
      const globalPartners = app.globalData.partnersData || []
      const globalIdx = globalPartners.findIndex(p => p.employeeId === employeeId)
      if (globalIdx !== -1) {
        globalPartners[globalIdx].image = path
        app.globalData.partnersData = globalPartners
      }

      // 加入待更新队列（不立即 setData）
      this._pendingUpdates[`partners[${idx}].image`] = path
      this._pendingUpdates[`partners[${idx}].loaded`] = true
      this._pendingUpdates[`partners[${idx}].animated`] = true

      // 同时更新 filteredPartners（WXML 渲染使用）
      const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === employeeId)
      if (fidx !== -1) {
        this._pendingUpdates[`filteredPartners[${fidx}].image`] = path
        this._pendingUpdates[`filteredPartners[${fidx}].loaded`] = true
        this._pendingUpdates[`filteredPartners[${fidx}].animated`] = true
      }

      // 防抖：50ms 内的更新合并为一次 setData
      this._scheduleUpdate()
    }
    app.globalData.imageReadyListeners.push(this._imageReadyCb)

    // 注册文本数据刷新回调，飞书数据更新时只更新有变化的记录
    this._partnersDataCb = (partnersData) => {
      // 检测当前用户是否有未完善的资料
      const currentOpenid = app.globalData.openid || ''
      const hasIncompleteProfile = checkIncompleteProfile(partnersData, currentOpenid)

      // 过滤掉未完善的资料，只显示有 employeeId 的
      const completeProfiles = filterCompleteProfiles(partnersData)
      const sortedData = sortByJoinDate([...completeProfiles])

      // 保存当前的 partners
      const currentPartners = this.data.partners || []

      // 检查是否需要完全重建列表（人数变化、顺序变化等）
      const needRebuild =
        sortedData.length !== currentPartners.length ||
        hasIncompleteProfile !== this.data.hasIncompleteProfile ||
        sortedData.some((p, i) => {
          const curr = currentPartners[i]
          return !curr || p.employeeId !== curr.employeeId
        })

      if (needRebuild) {
        // 需要重建列表：保留已下载的图片
        const imageMap = {}
        const loadedMap = {}
        const animatedMap = {}
        // 优先从 globalData 取（_imageReadyCb 会同步更新 globalData）
        const globalPartners = app.globalData.partnersData || []
        globalPartners.forEach(p => {
          if (p.employeeId && p.image) {
            imageMap[p.employeeId] = p.image
          }
        })
        // 再从当前页面数据补充（可能有 globalData 里没有的）
        currentPartners.forEach(p => {
          if (p.employeeId) {
            if (p.image && !imageMap[p.employeeId]) {
              imageMap[p.employeeId] = p.image
            }
            if (p.loaded) loadedMap[p.employeeId] = true
            if (p.animated) animatedMap[p.employeeId] = true
          }
        })
        // 最后用 partner.image 兜底（CDN 模式下已是 CDN URL）
        sortedData.forEach(p => {
          if (p.employeeId && !imageMap[p.employeeId] && p.image) {
            imageMap[p.employeeId] = p.image
          }
        })

        const partners = sortedData.map(partner => {
          const existingImage = imageMap[partner.employeeId]
          const finalImage = existingImage || partner.image
          const wasLoaded = loadedMap[partner.employeeId]

          // 修改：只有当有图片或没有 cloudImageFileID 时才标记为 loaded
          const shouldBeLoaded = wasLoaded || finalImage || !partner.cloudImageFileID

          return processPartnerData({
            ...partner,
            image: finalImage,
            loaded: !!shouldBeLoaded,
            animated: !!animatedMap[partner.employeeId] || !!shouldBeLoaded
          })
        })

        this.setData({
          partners,
          filteredPartners: partners,
          searchQuery: '',
          allImagesLoaded: this.checkAllImagesLoaded(partners),
          hasIncompleteProfile,
          incompleteProfileOpenid: currentOpenid
        }, () => {
          // setData 完成后立即同步图片，修复 loaded 竞态问题
          this._syncDownloadedImages()
        })
        this.calculateStats()
      } else {
        // 不需要重建列表：只更新有变化的文字数据
        const updates = {}
        let hasChanges = false

        sortedData.forEach((partner, i) => {
          const curr = currentPartners[i]
          if (!curr) return

          // 检查文字数据是否有变化
          if (curr.name !== partner.name ||
              curr.school !== partner.school ||
              curr.title !== partner.title ||
              curr.customersServed !== partner.customersServed ||
              curr.bio !== partner.bio) {
            hasChanges = true
            // 更新文字数据，保留图片
            const processed = processPartnerData({
              ...partner,
              image: curr.image,
              loaded: curr.loaded
            })
            updates[`partners[${i}]`] = processed

            // 同时更新 filteredPartners
            const fidx = this.data.filteredPartners.findIndex(p => p.employeeId === partner.employeeId)
            if (fidx !== -1) {
              updates[`filteredPartners[${fidx}]`] = processed
            }
          }
        })

        // 更新 hasIncompleteProfile
        if (hasIncompleteProfile !== this.data.hasIncompleteProfile) {
          hasChanges = true
          updates.hasIncompleteProfile = hasIncompleteProfile
          updates.incompleteProfileOpenid = currentOpenid
        }

        if (hasChanges) {
          this.setData(updates)
          this.calculateStats()
        }
      }
    }
    app.globalData.partnersDataListeners.push(this._partnersDataCb)

    // 注册身份识别回调，更新底部按钮和占位符显示
    this._currentUserCb = (user) => {
      // 只有当用户有营销员工号时才显示生成海报按钮
      this.setData({
        isCofounder: !!(user && user.employeeId),
        identityChecked: true
      })

      // 重新检查是否需要显示占位符
      const partnersData = app.globalData.partnersData || []
      const currentOpenid = app.globalData.openid || ''
      if (partnersData.length > 0 && currentOpenid) {
        const hasIncompleteProfile = checkIncompleteProfile(partnersData, currentOpenid)
        this.setData({
          hasIncompleteProfile,
          incompleteProfileOpenid: currentOpenid
        })
      }
    }
    app.globalData.currentUserListeners.push(this._currentUserCb)

    // 立即应用已有结果（partnersData 已加载即可，openid 可能还未到）
    if (app.globalData.partnersData && app.globalData.partnersData.length > 0) {
      const currentUser = app.globalData.currentUser
      const currentOpenid = app.globalData.openid || ''
      this.setData({
        isCofounder: !!(currentUser && currentUser.employeeId),
        identityChecked: true,
        hasIncompleteProfile: checkIncompleteProfile(app.globalData.partnersData, currentOpenid),
        incompleteProfileOpenid: currentOpenid
      })
    }

    // 加载前职关键词 tab
    this.loadTitleTags()
  },

  onUnload() {
    const app = getApp()

    // 清理监听器
    const listeners = [
      { list: 'imageReadyListeners', cb: '_imageReadyCb' },
      { list: 'partnersDataListeners', cb: '_partnersDataCb' },
      { list: 'currentUserListeners', cb: '_currentUserCb' },
      { list: 'assetsDataListeners', cb: '_assetsDataCb' }
    ]

    listeners.forEach(({ list, cb }) => {
      if (this[cb]) {
        app.globalData[list] = app.globalData[list].filter(callback => callback !== this[cb])
        this[cb] = null
      }
    })

    // 清理定时器
    const timers = ['_animateTimer', '_posterCheckInterval']
    const timeouts = ['_posterTimeout']

    timers.forEach(timer => {
      if (this[timer]) {
        clearInterval(this[timer])
        this[timer] = null
      }
    })

    timeouts.forEach(timeout => {
      if (this[timeout]) {
        clearTimeout(this[timeout])
        this[timeout] = null
      }
    })
  },

  // 加载飞书数据（缓存为空时的冷启动路径）
  async loadFeishuData() {
    this.setData({ loading: true })
    try {
      // 阶段一：先拿文本数据，立即展示
      const { profiles: partnersData } = await loadAllProfilesText()
      const app = getApp()
      app.globalData.partnersData = partnersData

      // 检测当前用户是否有未完善的资料
      const currentOpenid = app.globalData.openid || ''
      const hasIncompleteProfile = checkIncompleteProfile(partnersData, currentOpenid)

      // 过滤掉未完善的资料，只显示有 employeeId 的
      const completeProfiles = filterCompleteProfiles(partnersData)
      const sortedData = sortByJoinDate([...completeProfiles])
      const partners = sortedData.map(partner => processPartnerData({
        ...partner,
        loaded: !!partner.image,
        animated: !!partner.image
      }))
      this.setData({
        partners,
        filteredPartners: partners,
        loading: false,
        hasIncompleteProfile,
        incompleteProfileOpenid: currentOpenid
      })
      this.calculateStats()
    } catch (error) {
      console.error('加载飞书数据失败:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载数据失败', icon: 'error' })
    }
  },

  onShow() {
    const app = getApp()
    // 同步自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 'pages/team/team', hidden: false })
    }

    // 只在首次显示时同步一次，避免多次调用导致闪烁
    if (!this._hasShownOnce) {
      this._syncDownloadedImages()
      this._hasShownOnce = true
    }

    // 预加载数据（不重新注册监听器）
    app.preloadFeishuTeam()

    // 每次回到页面静默拉取最新前职标签，和缓存比对后更新
    this.loadTitleTags()
  },

  calculateStats() {
    // 计算团队统计数据
    const teamCount = this.data.partners.length

    // 计算总徽章数
    const totalBadges = this.data.partners.reduce((sum, partner) => {
      return sum + (partner.badges ? partner.badges.length : 0)
    }, 0)

    // 计算独特技能数
    const allSkills = this.data.partners.reduce((skills, partner) => {
      return skills.concat(partner.skills || [])
    }, [])
    const uniqueSkills = Array.from(new Set(allSkills)).length

    // 数据变化时清空分享图，下次分享时重新生成（在动画前设置，避免冲突）
    this.setData({ shareImageUrl: '' })

    animateNumbers(this, {
      teamCount: { to: teamCount },
      totalBadges: { to: totalBadges },
      uniqueSkills: { to: uniqueSkills }
    })
  },

  // 生成分享图（如果还没有生成）
  generateShareImageIfNeeded() {
    const stats = {
      teamCount: this.data.teamCount,
      totalBadges: this.data.totalBadges,
      uniqueSkills: this.data.uniqueSkills
    }
    // 只传递已加载的合伙人
    const loadedPartners = this.data.partners.filter(p => p.loaded && p.image)
    if (loadedPartners.length > 0) {
      generateShareImage(this, 'shareCanvas', stats, loadedPartners)
    }
  },

  // ── 前职 Tab 筛选 ────────────────────────────────────────────────

  _setTabs(tabs) {
    const MAX = 8
    const baseTabs = tabs.slice(0, MAX)
    const activeTab = this.data.activeTab

    // 如果当前选中的 tab 不在前8个但在全部 tabs 里，继续保留为额外项
    let visibleTabs = baseTabs
    if (activeTab && !baseTabs.includes(activeTab) && tabs.includes(activeTab)) {
      visibleTabs = [...baseTabs, activeTab]
    }

    this.setData({
      tabs,
      visibleTabs,
      hasMoreTabs: tabs.length > MAX
    })
  },

  async loadTitleTags() {
    const CACHE_KEY = 'title_tags_cache'

    // 读取本地缓存，先快速渲染
    let cachedData = null
    try {
      const cached = wx.getStorageSync(CACHE_KEY)
      if (cached && cached.tags && cached.tags.length > 0) {
        cachedData = cached
        this._setTabs(['全部前职', ...cached.tags])
      }
    } catch (e) { /* ignore */ }

    // 后台静默拉取飞书最新数据，与缓存比对，有变化才刷新
    try {
      const records = await getAllRecords({
        appToken: 'Ll5VbNc3MahwYxsdOg1c3SZsnsg',
        tableId: 'tblyPz0uldc3aWCH'
      })

      if (records.length === 0) return

      const firstFields = records[0].fields
      const keyField = Object.keys(firstFields).find(k => k.includes('关键词') || k.includes('名称') || k.includes('标签') || k.includes('前职'))
      if (!keyField) {
        console.warn('前职关键词表：未找到合适的字段名，可用字段：', Object.keys(firstFields))
        return
      }

      // 查找别名字段
      const aliasField = Object.keys(firstFields).find(k => k.includes('别名'))

      // 构建标签数据：包含关键词和别名
      const tagsData = records
        .map(r => {
          const keyword = r.fields[keyField]
          if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return null

          // 解析别名（JSON 数组格式）
          let aliases = []
          if (aliasField && r.fields[aliasField]) {
            try {
              const aliasValue = r.fields[aliasField]
              if (typeof aliasValue === 'string') {
                aliases = JSON.parse(aliasValue)
              } else if (Array.isArray(aliasValue)) {
                aliases = aliasValue
              }
              // 过滤掉空值
              aliases = aliases.filter(a => a && typeof a === 'string' && a.trim())
            } catch (e) {
              console.warn(`解析别名失败: ${keyword}`, e)
            }
          }

          return {
            keyword: keyword.trim(),
            aliases: aliases
          }
        })
        .filter(v => v !== null)

      const freshTags = tagsData.map(t => t.keyword)

      // 与缓存比对，内容有变化才更新界面和缓存
      const freshDataStr = JSON.stringify(tagsData)
      const cachedDataStr = cachedData ? JSON.stringify(cachedData.tagsData) : ''

      if (freshDataStr !== cachedDataStr) {
        console.log('前职标签有更新，刷新 tab 栏')
        wx.setStorageSync(CACHE_KEY, { tags: freshTags, tagsData: tagsData })
        this._setTabs(['全部前职', ...freshTags])
        // 保存到页面数据，供筛选时使用
        this.setData({ titleTagsData: tagsData })
      } else if (cachedData && cachedData.tagsData) {
        // 没有更新，但需要设置 tagsData 供筛选使用
        this.setData({ titleTagsData: cachedData.tagsData })
      }
    } catch (error) {
      console.error('加载前职关键词失败:', error)
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    const { tabs } = this.data
    const MAX = 8
    const baseTabs = tabs.slice(0, MAX)

    // 选中的 tab 不在前8个里 → 追加到末尾显示；否则恢复为基础列表（移除之前的额外项）
    const newVisibleTabs = baseTabs.includes(tab) ? baseTabs : [...baseTabs, tab]
    const index = newVisibleTabs.indexOf(tab)

    this.setData(
      { activeTab: tab, showTagPanel: false, searchQuery: '', visibleTabs: newVisibleTabs },
      () => { this._scrollTabIntoView(index) }
    )
    this._applyFilters('', tab)
  },

  onTabsScroll(e) {
    // 实时记录用户手动滚动的实际位置，避免 tabScrollLeft data 与真实位置脱节
    this._actualScrollLeft = e.detail.scrollLeft
  },

  _scrollTabIntoView(index) {
    if (index < 0) return
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('.tab-item').boundingClientRect()
    query.select('.tabs-container').boundingClientRect()
    query.exec(res => {
      const tabRects = res[0]
      const containerRect = res[1]
      if (!tabRects || !tabRects[index] || !containerRect) return

      // 优先使用实际滚动位置（用户手动滑动后 data 可能未更新）
      const currentScrollLeft = this._actualScrollLeft != null ? this._actualScrollLeft : this.data.tabScrollLeft
      const tabRect = tabRects[index]
      // tab 在滚动内容中的实际偏移
      const tabContentLeft = tabRect.left - containerRect.left + currentScrollLeft
      // 让点击的 tab 居中
      const newScrollLeft = Math.max(0, tabContentLeft - (containerRect.width - tabRect.width) / 2)
      this._actualScrollLeft = newScrollLeft  // 同步更新，避免下次计算用到旧值
      this.setData({ tabScrollLeft: newScrollLeft })
    })
  },

  onToggleTagPanel() {
    this.setData({ showTagPanel: !this.data.showTagPanel })
  },

  onTagPanelStop() {
    // 阻止面板内点击冒泡到容器（避免面板被立即关闭）
  },

  // 根据 tab 返回过滤后的合伙人（不考虑搜索词）
  _tabFilteredPartners(tab) {
    if (!tab || tab === '全部前职') return this.data.partners

    // 查找该 tab 对应的标签数据（包含别名）
    const tagsData = this.data.titleTagsData || []
    const tagData = tagsData.find(t => t.keyword === tab)

    return this.data.partners.filter(partner => {
      const titleArray = Array.isArray(partner.title) ? partner.title : [partner.title || '']

      // 检查是否匹配关键词
      const keywordMatch = titleArray.some(t => t.includes(tab))

      // 检查是否匹配别名
      let aliasMatch = false
      if (tagData && tagData.aliases && tagData.aliases.length > 0) {
        aliasMatch = titleArray.some(title =>
          tagData.aliases.some(alias => title.includes(alias))
        )
      }

      return keywordMatch || aliasMatch
    })
  },

  // 同时应用 tab 筛选 + 搜索词过滤
  _applyFilters(query, tab) {
    let base = this._tabFilteredPartners(tab)
    if (query) {
      const q = query.toLowerCase()
      base = base.filter(partner => {
        const schoolArray = Array.isArray(partner.school) ? partner.school : [partner.school || '']
        const titleArray = Array.isArray(partner.title) ? partner.title : [partner.title || '']
        const schoolMatch = schoolArray.some(s => s.toLowerCase().includes(q))
        const titleMatch = titleArray.some(t => t.toLowerCase().includes(q))
        return partner.name.toLowerCase().includes(q) || schoolMatch || titleMatch
      })
    }
    this.setData({ filteredPartners: base })
  },

  // ─────────────────────────────────────────────────────────────────

  onSearchInput(e) {
    const query = e.detail.value.toLowerCase()
    this.setData({ searchQuery: query })
    this._applyFilters(query, this.data.activeTab)
  },

  // 点击未完善资料的占位项
  onIncompleteProfileTap() {
    const openid = this.data.incompleteProfileOpenid
    if (openid) {
      wx.navigateTo({
        url: `/pages/profile-edit/profile-edit?openid=${openid}`
      })
    }
  },

  onPartnerTap(e) {
    const name = e.currentTarget.dataset.name
    // 在原始partners数组中查找对应的合伙人
    const partner = this.data.partners.find(p => p.name === name)
    if (partner && partner.employeeId) {
      // 使用营销员工号作为唯一标识
      wx.navigateTo({
        url: `/pages/profile/profile?employeeId=${partner.employeeId}`
      })
    } else if (partner) {
      // 如果没有营销员工号，降级使用索引
      const index = this.data.partners.findIndex(p => p.name === name)
      wx.navigateTo({
        url: `/pages/profile/profile?id=${index}`
      })
    }
  },

  onApplyPartner() {
    // 切换到申请模式
    this.setData({
      isApplyMode: true,
      searchPlaceholder: '请输入引荐人名字',
      searchQuery: ''
    })

    // 聚焦到搜索框
    // 注意：小程序中需要通过设置 focus 属性来实现
  },

  // 点击容器空白处,恢复搜索框状态，关闭展开面板
  onContainerTap() {
    const updates = {}
    if (this.data.isApplyMode) {
      updates.isApplyMode = false
      updates.searchPlaceholder = '搜索善心浙里联合创始人'
      updates.searchQuery = ''
      updates.filteredPartners = this._tabFilteredPartners(this.data.activeTab)
    }
    if (this.data.showTagPanel) {
      updates.showTagPanel = false
    }
    if (Object.keys(updates).length > 0) {
      this.setData(updates)
    }
  },

  // 阻止搜索框点击事件冒泡
  onSearchTap() {
    // 空方法,用于阻止事件冒泡到容器
  },

  onSearchOpen() {
    this.setData({ isSearching: true, showTagPanel: false })
  },

  onSearchClose() {
    this.setData({ isSearching: false, searchQuery: '' })
    this._applyFilters('', this.data.activeTab)
  },

  // 分享功能
  onShareAppMessage() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    const shareFrom = currentUser ? currentUser.employeeId : (app.globalData.initialShareFrom || 'guest')

    // 如果还没有生成分享图，立即生成
    if (!this.data.shareImageUrl && this.data.teamCount > 0) {
      this.generateShareImageIfNeeded()
    }

    return {
      title: `善心浙里-${this.data.teamCount}位联合创始人`,
      path: `/pages/team/team?shareFrom=${shareFrom}`,
      imageUrl: this.data.shareImageUrl || this.data.shanxinLogoUrl || ''
    }
  },

  // 等待所有头像加载完成
  waitForImagesLoaded(callback) {
    wx.showLoading({ title: '等待头像加载...' })

    this._posterCheckInterval = setInterval(() => {
      if (this.checkAllImagesLoaded(this.data.partners)) {
        clearInterval(this._posterCheckInterval)
        this._posterCheckInterval = null
        wx.hideLoading()
        callback()
      }
    }, 300)

    // 设置超时（30秒后强制执行）
    this._posterTimeout = setTimeout(() => {
      if (this._posterCheckInterval) {
        clearInterval(this._posterCheckInterval)
        this._posterCheckInterval = null
      }
      wx.hideLoading()
      wx.showToast({ title: '部分头像未加载完成', icon: 'none', duration: 2000 })
      setTimeout(callback, 2000)
    }, 30000)
  },

  // 海报按钮点击处理
  onPosterBtnTap() {
    if (!this.data.allImagesLoaded) {
      wx.showToast({
        title: '头像加载中...',
        icon: 'loading',
        duration: 1500
      })
    } else {
      this.onGeneratePoster()
    }
  },

  // 联合创始人：生成团队海报
  async onGeneratePoster() {
    const app = getApp()
    const currentUser = app.globalData.currentUser
    if (!currentUser) return

    const generatePoster = () => {
      this.setData({ posterScrollReady: false }, () => {
        this.setData({ posterScrollReady: true }, () => {
          generateTeamPoster(this, 'posterCanvas', currentUser, this.data.partners)
        })
      })
    }

    if (!this.data.allImagesLoaded) {
      this.waitForImagesLoaded(generatePoster)
    } else {
      generatePoster()
    }
  },

  onHidePoster() {
    this.setData({
      showPoster: false,
      posterImage: ''
    })
  },

  // 阻止事件冒泡
  onStopPropagation() {
    // 空方法，用于阻止事件冒泡
  },

  // 海报按钮logo加载完成
  onPosterBtnLogoLoad() {
    this.setData({
      posterBtnLogoLoaded: true
    })
  },

  // 图片加载失败
  onImageError(e) {
    const name = e.currentTarget.dataset.name
    console.log('图片加载失败:', name)

    const partners = this.data.partners
    const idx = partners.findIndex(p => p.name === name)

    if (idx !== -1) {
      // 只清空页面数据，不清空 globalData（避免触发连锁反应导致集体消失）
      const updates = {
        [`partners[${idx}].image`]: '',
        [`partners[${idx}].loaded`]: false
      }
      const fidx = this.data.filteredPartners.findIndex(p => p.name === name)
      if (fidx !== -1) {
        updates[`filteredPartners[${fidx}].image`] = ''
        updates[`filteredPartners[${fidx}].loaded`] = false
      }
      this.setData(updates, () => {
        // 延迟后尝试从 globalData 重新同步（可能是临时失败）
        setTimeout(() => {
          this._syncDownloadedImages()
        }, 500)
      })
    }
  }
})
