// utils/data-source-config.js
// 数据源配置

const DATA_SOURCE_CONFIG = {
  // 数据源类型: 'local' 或 'feishu'
  source: 'feishu',

  // 图片加载模式
  // 'async' — 文本数据立即展示，图片后台渐进加载（默认体验）
  // 'sync'  — 等所有图片下载完成后一次性展示（对比测试用）
  imageLoadMode: 'async',

  // 图片下载并发数（降低并发数可以避免飞书限流）
  imageConcurrency: 2,

  // 飞书数据字段映射配置
  feishuFieldMapping: {
    name: '姓名',
    school: '毕业院校',  // 飞书用的是"毕业院校"而不是"学校"
    title: '前职工作',   // 飞书用的是"前职工作"而不是"职位"
    joinDate: '入司时间',
    customersServed: '截止到目前服务客户数',
    bio: '个人介绍',     // 飞书用的是"个人介绍"而不是"个人简介"
    image: '个人头像',   // 飞书用的是"个人头像"而不是"头像"
    qrcode: '个人微信二维码',  // 飞书用的是"个人微信二维码"
    employeeId: '营销员工号',  // 唯一标识
    badges: '荣誉勋章',  // 飞书用的是"荣誉勋章"
    timeline: '在友邦浙江的成长足迹',  // 成长足迹
    activities: '最近动态',  // 最近动态
    skills: '个人涉及的专业领域',  // 专业领域
    isInstructor: '是否为善心浙江讲师',  // 是否为讲师（用于首页统计）
    lastModifiedDate: 'Last Modified Date',  // 飞书系统字段，用于检测记录是否有变更
    wxOpenid: 'wx_miniprogram_shanxinzaizhe_openid'  // 微信小程序 openid，用于身份识别
  },

  // 活动数据字段映射配置
  eventsFieldMapping: {
    organizer: '组织者',
    time: '开始时间',
    image: '活动海报',
    employeeId: '营销员工号',
    address: '活动地址',
    longitude: '地址经度',
    latitude: '地址纬度',
    lastModifiedDate: 'Last Modified Date'
  }
}

module.exports = {
  DATA_SOURCE_CONFIG
}
