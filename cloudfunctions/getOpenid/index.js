// 云函数：getOpenid
// 利用云函数天然可从 context 获取 openid，无需 AppSecret
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    return { openid: OPENID }
}
