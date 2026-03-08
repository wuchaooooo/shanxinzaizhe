// pages/about-aia/about-aia.js
const { getAssetPath } = require('../../utils/assets-loader.js')

Page({
  data: {
    heroImage: '',
    heroTitle: '我们以专业、诚信与爱，助力家庭和企业健康长久好生活！',
    companyIntro: '友邦保险愿成为中国最受信赖的保险公司，陪伴与守护每一份对于未来的努力与向往，助您实现健康、财富、养老的梦想，携手共同奔赴"健康长久好生活"。',
    keyFigures: [
      { number: '1919', label: '创立于上海' },
      { number: '1,300万+', label: '服务客户' },
      { number: '1,600万+', label: '保单持有人' },
      { number: '100万+', label: '营销员' }
    ],
    milestones: [
      {
        year: '1919',
        desc: '史带先生在上海创立向华人提供保险服务的外资机构，开启了友邦与中国的世纪之缘。'
      },
      {
        year: '1992',
        desc: '重回中国内地，成为改革开放后最早一批获发个人人身保险业务营业执照的非本土保险机构之一。'
      },
      {
        year: '1993',
        desc: '率先引入营销员制度，将现代商业保险理念和制度植入中国内地寿险市场。'
      },
      {
        year: '2009',
        desc: '友邦保险正式迁回外滩中山东一路17号"友邦大厦"。'
      },
      {
        year: '2010',
        desc: '香港上市，是当时全球第三大首次公开发售（IPO）。'
      },
      {
        year: '2013',
        desc: '与托特纳姆热刺足球俱乐部签订重要伙伴协议。'
      },
      {
        year: '2016',
        desc: '推出个人移动健康管理平台。2021年推出全场景保险生活数字平台"友邦友享"。'
      },
      {
        year: '2019',
        desc: '友邦迎来百年华诞。获批在天津市和河北省石家庄市开设营销服务部。'
      },
      {
        year: '2020',
        desc: '友邦人寿成为中国内地首家外资独资人身保险公司。'
      },
      {
        year: '2021',
        desc: '3月，友邦人寿四川分公司完成筹建获准开业。10月，友邦人寿湖北分公司完成筹建获准开业。'
      },
      {
        year: '2022',
        desc: '12月，友邦人寿成功投得上海北外滩地标地产项目，并正式揭牌为"友邦金融中心"。'
      },
      {
        year: '2023',
        desc: '4月，友邦人寿河南分公司完成筹建获准开业。'
      },
      {
        year: '2025',
        desc: '3月，友邦人寿浙江分公司获监管批准开业。'
      }
    ],
    advantages: [
      {
        icon: '🏆',
        title: '百年品牌',
        desc: '1919年创立于上海，超过100年的历史'
      },
      {
        icon: '🌏',
        title: '亚太领先',
        desc: '覆盖亚太18个市场的独立上市人寿保险集团'
      },
      {
        icon: '💼',
        title: '首家外资独资',
        desc: '中国内地首家外资独资人身保险公司'
      },
      {
        icon: '🛡️',
        title: '值得信赖',
        desc: '香港上市，强大的财务实力和偿付能力'
      }
    ],
    socialResponsibility: [
      { icon: '🚶', title: '10亿个旅程', desc: '携手前行每一步' },
      { icon: '🏫', title: 'AIA健康校园计划', desc: '关注青少年健康成长' },
      { icon: '👼', title: '友邦天使心', desc: '关爱特殊儿童' },
      { icon: '🌸', title: '春蕾计划', desc: '助力女童教育' },
      { icon: '👴', title: '乐龄计划', desc: '关注老年人生活' },
      { icon: '⚽', title: '足球公益', desc: '推广体育运动' }
    ],
    businessScope: [
      { icon: '👨‍👩‍👧‍👦', name: '人寿保险' },
      { icon: '🏥', name: '健康保险' },
      { icon: '💰', name: '储蓄保险' },
      { icon: '📈', name: '投资连结保险' },
      { icon: '🎓', name: '教育金保险' },
      { icon: '👴', name: '养老保险' }
    ]
  },

  onLoad() {
    // 从飞书 base 加载 hero 图片（代码：aia）
    const heroImagePath = getAssetPath('aia')
    if (heroImagePath) {
      this.setData({ heroImage: heroImagePath })
    }
  },

  onContact() {
    wx.switchTab({
      url: '/pages/team/team'
    })
  },

  onShareAppMessage() {
    return {
      title: '友邦保险 - 百年基业 值得信赖',
      path: '/pages/about-aia/about-aia'
    }
  }
})
