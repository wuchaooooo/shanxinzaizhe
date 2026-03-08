// pages/developer/developer.js
Page({
    data: {
        openid: '',
        systemInfo: {}
    },

    onLoad() {
        const app = getApp()
        this.setData({
            openid: app.globalData.openid || '',
            systemInfo: app.globalData.systemInfo || {}
        })

        // 如果 openid 尚未获取，发起 wx.login
        if (!app.globalData.openid) {
            this.fetchOpenid()
        }
    },

    fetchOpenid() {
        wx.login({
            success: (res) => {
                if (!res.code) {
                    this.setData({ openid: '登录失败，请重试' })
                    return
                }
                // 调用云函数获取 openid
                wx.cloud.callFunction({
                    name: 'getOpenid',
                    success: (r) => {
                        const openid = r.result && r.result.openid
                        if (openid) {
                            getApp().globalData.openid = openid
                            this.setData({ openid })
                        } else {
                            this.setData({ openid: '获取失败' })
                        }
                    },
                    fail: () => {
                        // 若没有云函数，则直接显示 code 供调试
                        this.setData({ openid: `无云函数，code: ${res.code}` })
                    }
                })
            },
            fail: () => {
                this.setData({ openid: 'wx.login 调用失败' })
            }
        })
    },

    onCopyOpenid() {
        wx.setClipboardData({
            data: this.data.openid,
            success: () => {
                wx.showToast({ title: '已复制', icon: 'success' })
            }
        })
    },

    onBack() {
        wx.navigateBack({ delta: 1 })
    }
})
