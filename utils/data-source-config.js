// utils/data-source-config.js
// 数据源配置

const DATA_SOURCE_CONFIG = {
  // 数据源类型: 'local' 或 'feishu'
  source: 'feishu',

  // 图片下载并发数（微信小程序 wx.downloadFile 最大并发 10）
  imageConcurrency: 10,

  // 云存储功能开关（默认关闭，测试通过后再开启）
  useCloudStorage: true,

  // 静态资源源类型: 'feishu' 或 'cloud'
  assetsSource: 'cloud',

  // 腾讯云静态资源路径配置
  cloudAssets: {
    // 首页核心价值的3张图
    mission_banner: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/banner/使命.png',
    vision_banner: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/banner/愿景.png',
    value_banner: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/banner/价值观.png',
    // 首页了解友邦保险的logo
    aia: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/logo/aia.png',
    // 首页左上角的logo，以及其他用到这个logo的地方
    shanxinzheli: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/logo/shanxin.PNG',
    // 三个页面头部块的右下角的图片
    aia_footer: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/logo/mountains.png',
    // 团队海报生成时，头部图片
    team_poster_header: 'cloud://shanxinzaizhe-1g0sxfo695003783.7368-shanxinzaizhe-1g0sxfo695003783-1405846505/images/banner/team_poster_header.jpg'
  },

  // 自助编辑功能开关（false = 原有逻辑完全不变，true = 详情页从新表读取数据并显示编辑按钮）
  useNewProfileTable: true,

  // 自助编辑新表配置
  profileEditAppToken: 'RCQKb4Gb5aTxSFstU8NccgiDn1g',
  profileEditTableId: 'tblvPv0CTmePIHge',

  // 飞书数据字段映射配置
  feishuFieldMapping: {
    name: '姓名',
    school: '毕业院校',  // 飞书用的是"毕业院校"而不是"学校"
    title: '前职工作',   // 飞书用的是"前职工作"而不是"职位"
    joinDate: '入司时间',
    customersServed: '截止到目前服务客户数',
    bio: '个人介绍',     // 飞书用的是"个人介绍"而不是"个人简介"
    cloudImageFileID: '头像链接_腾讯云_image_file_id',  // 云存储头像 fileID
    cloudQrcodeFileID: '个人微信二维码链接_腾讯云_image_file_id',  // 云存储二维码 fileID
    employeeId: '营销员工号',  // 唯一标识
    badges: '荣誉勋章',  // 飞书用的是"荣誉勋章"
    timeline: '在友邦浙江的成长足迹',  // 成长足迹
    activities: '最近动态',  // 最近动态
    skills: '个人涉及的专业领域',  // 专业领域
    isInstructor: '是否为善心浙里讲师',  // 是否为讲师（用于首页统计）
    lastModifiedDate: 'Last Modified Date',  // 飞书系统字段，用于检测记录是否有变更
    wxOpenid: 'wx_miniprogram_shanxinzaizhe_openid'  // 微信小程序 openid，用于身份识别
  },

  // 活动数据字段映射配置
  eventsFieldMapping: {
    name: '活动主题',
    organizer: '组织者',
    time: '开始时间',
    endTime: '结束时间',
    cloudImageFileID: '活动海报链接_腾讯云_file_id',  // 云存储活动海报 fileID（多个用逗号分隔）
    employeeId: '营销员工号',
    address: '活动地址',
    latitude: '地址纬度',
    longitude: '地址经度',
    cloudCheckinQrcodeFileID: '活动签到码链接_腾讯云_file_id',  // 云存储签到码 fileID
    lastModifiedDate: 'Last Modified Date'
  }
}

module.exports = {
  DATA_SOURCE_CONFIG
}
