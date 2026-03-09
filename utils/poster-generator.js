// utils/poster-generator.js
// 团队海报生成逻辑，供 profile 和 team 页面共用
const { getPartnersDataSync } = require('./partners-data-loader.js')
const { getAssetPath } = require('./assets-loader.js')
const feishuApi = require('./feishu-api.js')

/**
 * 生成团队海报
 * @param {Object} page         - 调用页面的 this（用于 createCanvasContext / setData）
 * @param {string} canvasId     - 页面内 canvas 的 canvas-id
 * @param {Object|null} currentPartner - 需要排在第一的联合创始人，null 则不置顶
 * @param {Array|null} partnersData - 合伙人数据数组，如果不传则使用 getPartnersDataSync()
 */
async function generateTeamPoster(page, canvasId, currentPartner, partnersData = null) {
    try {
        // 立即显示弹窗（骨架屏状态）
        page.setData({
            showPoster: true,
            posterImage: ''
        })

        let partners = partnersData || getPartnersDataSync()

        // 将当前合伙人移到第一个位置
        if (currentPartner) {
            const idx = partners.findIndex(p => p.employeeId === currentPartner.employeeId)
            if (idx > 0) {
                partners = [
                    partners[idx],
                    ...partners.slice(0, idx),
                    ...partners.slice(idx + 1)
                ]
            }
        }

        const personalQRCode = currentPartner ? currentPartner.qrcode : ''
        const headerImageUrl = getAssetPath('team_post_header')
        const qrcodeImageUrl = getAssetPath('mini_program_qr_code')

        if (!headerImageUrl || !qrcodeImageUrl) {
            wx.showToast({ title: '资源加载中，请稍后重试', icon: 'none' })
            return
        }

        const headerHeight = 400
        const cols = 3
        const avatarSize = 150
        const avatarBgSize = avatarSize + 20
        const gap = 30
        const startX = 60
        const startY = headerHeight + 60
        const canvasWidth = 750
        const itemWidth = (canvasWidth - startX * 2 - gap * (cols - 1)) / cols
        const itemHeight = avatarSize + 120
        const rows = Math.ceil(partners.length / cols)
        const gridHeight = rows * (itemHeight + gap)
        const canvasHeight = startY + gridHeight + 500

        page.setData({ canvasHeight })
        await new Promise(resolve => setTimeout(resolve, 100))

        const ctx = wx.createCanvasContext(canvasId, page)

        // 渐变背景
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
        gradient.addColorStop(0, '#911C13')
        gradient.addColorStop(0.5, '#a00000')
        gradient.addColorStop(1, '#c20000')
        ctx.setFillStyle(gradient)
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 头部图片
        if (headerImageUrl) {
            try {
                const imgInfo = await wx.getImageInfo({ src: headerImageUrl })
                const imgRatio = imgInfo.width / imgInfo.height
                const targetRatio = canvasWidth / headerHeight
                let drawWidth, drawHeight, drawX, drawY
                if (imgRatio > targetRatio) {
                    drawHeight = headerHeight; drawWidth = drawHeight * imgRatio
                    drawX = (canvasWidth - drawWidth) / 2; drawY = 0
                } else {
                    drawWidth = canvasWidth; drawHeight = drawWidth / imgRatio
                    drawX = 0; drawY = (headerHeight - drawHeight) / 2
                }
                ctx.save()
                ctx.beginPath()
                ctx.rect(0, 0, canvasWidth, headerHeight)
                ctx.clip()
                ctx.drawImage(headerImageUrl, drawX, drawY, drawWidth, drawHeight)
                ctx.restore()
                const maskHeight = 80
                const maskGradient = ctx.createLinearGradient(0, headerHeight - maskHeight, 0, headerHeight)
                maskGradient.addColorStop(0, 'rgba(145, 28, 19, 0)')
                maskGradient.addColorStop(1, 'rgba(145, 28, 19, 1)')
                ctx.setFillStyle(maskGradient)
                ctx.fillRect(0, headerHeight - maskHeight, canvasWidth, maskHeight)
            } catch (e) { console.error('绘制头部图片失败:', e) }
        }

        // 批量获取头像信息 (限制并发数为5)
        const avatarInfoMap = new Map()
        const executing = []
        for (const partner of partners) {
            if (!partner.image) continue

            const promise = (async () => {
                try {
                    const info = await wx.getImageInfo({ src: partner.image })
                    avatarInfoMap.set(partner.image, { width: info.width, height: info.height, ratio: info.width / info.height })
                } catch (e) {
                    console.error('获取头像信息失败:', partner.name, partner.image, e)
                }
            })()

            // 包装 promise 以便完成后从执行队列移除自己
            const p = promise.then(() => executing.splice(executing.indexOf(p), 1))
            executing.push(p)

            if (executing.length >= 5) {
                await Promise.race(executing)
            }
        }
        await Promise.all(executing)

        // 绘制成员网格
        for (let i = 0; i < partners.length; i++) {
            const partner = partners[i]
            const row = Math.floor(i / cols)
            const col = i % cols
            const x = startX + col * (itemWidth + gap)
            const y = startY + row * (itemHeight + gap)

            ctx.setFillStyle('#E9AE73')
            ctx.beginPath()
            ctx.arc(x + itemWidth / 2, y + avatarBgSize / 2, avatarBgSize / 2, 0, 2 * Math.PI)
            ctx.fill()

            if (partner.image) {
                const avatarInfo = avatarInfoMap.get(partner.image) || { ratio: 1 } // 添加容错兜底
                if (avatarInfo) {
                    try {
                        const imgRatio = avatarInfo.ratio
                        const containerWidth = avatarSize
                        const containerHeight = avatarSize * 1.25
                        const containerRatio = containerWidth / containerHeight
                        let drawWidth, drawHeight, drawX, drawY
                        const avatarCenterY = y + avatarBgSize / 2
                        const avatarLeft = x + (itemWidth - avatarSize) / 2
                        const avatarTop = avatarCenterY - avatarSize / 2
                        if (imgRatio > containerRatio) {
                            drawHeight = containerHeight; drawWidth = drawHeight * imgRatio
                            drawX = avatarLeft - (drawWidth - containerWidth) / 2; drawY = avatarTop
                        } else {
                            drawWidth = containerWidth; drawHeight = drawWidth / imgRatio
                            drawX = avatarLeft; drawY = avatarTop
                        }
                        ctx.save()
                        ctx.beginPath()
                        ctx.arc(x + itemWidth / 2, avatarCenterY, avatarSize / 2, 0, 2 * Math.PI)
                        ctx.clip()
                        ctx.drawImage(partner.image, drawX, drawY, drawWidth, drawHeight)
                        ctx.restore()
                    } catch (e) { console.error('绘制头像失败:', partner.name, e) }
                }
            }

            const leftMargin = 10
            const maxTextWidth = itemWidth - leftMargin * 2
            const truncateText = (text, maxWidth, fontSize) => {
                ctx.setFontSize(fontSize)
                if (ctx.measureText(text).width <= maxWidth) return text
                let truncated = text
                while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
                    truncated = truncated.slice(0, -1)
                }
                return truncated + '...'
            }

            const circleCenterX = x + itemWidth / 2
            const circleCenterY = y + avatarBgSize / 2
            const circleRadius = avatarBgSize / 2
            ctx.save()
            ctx.setFillStyle('#E9AE73')
            ctx.beginPath()
            const chordY = circleCenterY + circleRadius * 0.5
            const chordHalfWidth = circleRadius * Math.sqrt(0.75)
            const leftX = circleCenterX - chordHalfWidth
            const rightX = circleCenterX + chordHalfWidth
            const startAngle = Math.atan2(chordY - circleCenterY, rightX - circleCenterX)
            const endAngle = Math.atan2(chordY - circleCenterY, leftX - circleCenterX)
            ctx.arc(circleCenterX, circleCenterY, circleRadius, startAngle, endAngle)
            ctx.lineTo(rightX, chordY)
            ctx.closePath()
            ctx.fill()
            ctx.restore()

            const nameY = circleCenterY + circleRadius * 0.75
            ctx.setFontSize(22)
            ctx.font = 'bold 22px sans-serif'
            let displayName = partner.name || ''
            if (displayName.length > 3) displayName = displayName.substring(0, 3)
            ctx.setFillStyle('#ffffff')
            ctx.setTextAlign('center')
            ctx.fillText(displayName, circleCenterX, nameY + 6)

            const infoStartY = y + avatarBgSize + 30
            if (partner.school) {
                const schoolLines = partner.school.split(/[、，；\n]/).filter(s => s.trim())
                if (schoolLines.length > 0) {
                    ctx.setFillStyle('#E9AE73'); ctx.setFontSize(16)
                    ctx.font = 'normal 16px sans-serif'; ctx.setTextAlign('center')
                    ctx.fillText(truncateText(schoolLines[0], maxTextWidth, 16), x + itemWidth / 2, infoStartY)
                }
            }
            if (partner.title) {
                const titleLines = partner.title.split(/[、，；\n]/).filter(s => s.trim())
                if (titleLines.length > 0) {
                    ctx.setFillStyle('#E9AE73'); ctx.setFontSize(16)
                    ctx.font = 'normal 16px sans-serif'; ctx.setTextAlign('center')
                    ctx.fillText(truncateText(titleLines[0], maxTextWidth, 16), x + itemWidth / 2, infoStartY + 25)
                }
            }
        }

        // 底部文案
        const bottomTextY = startY + gridHeight + 60
        const lineHeight = 50
        ctx.setFillStyle('#E9AE73')
        ctx.setFontSize(30)
        ctx.font = '900 30px sans-serif'
        ctx.setTextAlign('center')
        const drawTextWithSpacing = (text, x, y, letterSpacing) => {
            const chars = text.split('')
            let currentX = x - (ctx.measureText(text).width + letterSpacing * (chars.length - 1)) / 2
            chars.forEach((char) => {
                const charWidth = ctx.measureText(char).width
                ctx.fillText(char, currentX + charWidth / 2, y)
                ctx.setLineWidth(1); ctx.setStrokeStyle('#E9AE73')
                ctx.strokeText(char, currentX + charWidth / 2, y)
                currentX += charWidth + letterSpacing
            })
        }
        const letterSpacing = 4
        drawTextWithSpacing('以合作互助的态度实现伙伴完美人生，', canvasWidth / 2, bottomTextY, letterSpacing)
        drawTextWithSpacing('以专业用心的态度锁住客户幸福生活，', canvasWidth / 2, bottomTextY + lineHeight, letterSpacing)
        drawTextWithSpacing('善心浙里与您共创丰盛未来！', canvasWidth / 2, bottomTextY + lineHeight * 2, letterSpacing)

        // 二维码
        const qrSize = 150
        const qrGap = 30
        const qrTotalWidth = qrSize * 2 + qrGap
        const qrStartX = (canvasWidth - qrTotalWidth) / 2
        const qrY = bottomTextY + lineHeight * 2 + 50

        if (qrcodeImageUrl) {
            try {
                ctx.setFillStyle('#ffffff')
                ctx.fillRect(qrStartX - 5, qrY - 5, qrSize + 10, qrSize + 10)
                ctx.drawImage(qrcodeImageUrl, qrStartX, qrY, qrSize, qrSize)
            } catch (e) { console.error('绘制团队二维码失败:', e) }
        }

        // 确保个人二维码已下载
        let finalPersonalQRCode = personalQRCode;
        if (!finalPersonalQRCode && currentPartner && currentPartner.qrcodeUrl) {
            try {
                // 获取飞书 token 并临时下载二维码
                const token = await feishuApi.getTenantAccessToken()
                const res = await new Promise((resolve, reject) => {
                    wx.downloadFile({
                        url: currentPartner.qrcodeUrl,
                        header: {
                            'Authorization': `Bearer ${token}`
                        },
                        success: (r) => {
                            if (r.statusCode === 200) resolve(r.tempFilePath)
                            else reject(new Error(`HTTP ${r.statusCode}`))
                        },
                        fail: reject
                    })
                })
                finalPersonalQRCode = res;
            } catch (e) {
                console.error('临时下载个人二维码失败:', e)
            }
        }

        if (finalPersonalQRCode) {
            try {
                const personalQrX = qrStartX + qrSize + qrGap
                ctx.setFillStyle('#ffffff')
                ctx.fillRect(personalQrX - 5, qrY - 5, qrSize + 10, qrSize + 10)
                ctx.drawImage(finalPersonalQRCode, personalQrX, qrY, qrSize, qrSize)
            } catch (e) { console.error('绘制个人二维码失败:', e) }
        }

        // 转换为图片
        ctx.draw(false, () => {
            setTimeout(() => {
                wx.canvasToTempFilePath({
                    canvasId,
                    x: 0, y: 0,
                    width: canvasWidth, height: canvasHeight,
                    destWidth: canvasWidth * 2, destHeight: canvasHeight * 2,
                    success: (res) => {
                        // 延迟显示海报，避免动画卡顿
                        setTimeout(() => {
                            page.setData({ posterImage: res.tempFilePath })
                        }, 50)
                    },
                    fail: (err) => {
                        console.error('生成海报失败:', err)
                        wx.showToast({ title: '生成失败', icon: 'none' })
                    }
                }, page)
            }, 300)
        })

    } catch (error) {
        console.error('生成海报出错:', error)
        wx.showToast({ title: '生成失败', icon: 'none' })
    }
}

/**
 * 生成团队分享图（包含统计数据和头像）
 * @param {Object} page - 调用页面的 this
 * @param {string} canvasId - canvas 的 canvas-id
 * @param {Object} stats - 统计数据 { teamCount, totalBadges, uniqueSkills }
 * @param {Array} partners - 合伙人数据（取前6个显示头像）
 * @returns {Promise<string>} 返回生成的图片路径
 */
async function generateShareImage(page, canvasId, stats, partners) {
    try {
        const canvasWidth = 750
        const canvasHeight = 750

        const ctx = wx.createCanvasContext(canvasId, page)

        // 背景色 - 白色
        ctx.setFillStyle('#ffffff')
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // 绘制统计卡片背景
        const cardX = 32
        const cardY = 40
        const cardWidth = canvasWidth - 64
        const cardHeight = 180

        ctx.setFillStyle('#ffffff')
        ctx.setShadow(0, 2, 8, 'rgba(0, 0, 0, 0.05)')
        ctx.fillRect(cardX, cardY, cardWidth, cardHeight)
        ctx.setShadow(0, 0, 0, 'transparent')

        // 绘制3个统计数据
        const statWidth = cardWidth / 3
        const statsData = [
            { label: '联合创始人', value: stats.teamCount },
            { label: '荣誉徽章', value: stats.totalBadges },
            { label: '专业技能', value: stats.uniqueSkills }
        ]

        statsData.forEach((stat, index) => {
            const x = cardX + statWidth * index + statWidth / 2

            // 绘制数字
            ctx.setFillStyle('#c20000')
            ctx.setFontSize(48)
            ctx.setTextAlign('center')
            ctx.fillText(String(stat.value), x, cardY + 80)

            // 绘制标签
            ctx.setFontSize(24)
            ctx.setFillStyle('#666666')
            ctx.fillText(stat.label, x, cardY + 130)

            // 绘制分隔线（除了最后一个）
            if (index < statsData.length - 1) {
                ctx.setStrokeStyle('rgba(194, 0, 0, 0.1)')
                ctx.setLineWidth(1)
                ctx.beginPath()
                ctx.moveTo(cardX + statWidth * (index + 1), cardY + 40)
                ctx.lineTo(cardX + statWidth * (index + 1), cardY + 140)
                ctx.stroke()
            }
        })

        // 绘制合伙人网格（1行3列，共3个）
        const gridStartY = cardY + cardHeight + 60
        const cols = 3
        const itemWidth = (canvasWidth - 64 - 32) / cols
        const itemHeight = 280
        const gap = 16

        const displayPartners = partners.slice(0, 3).filter(p => p.image)

        // 批量获取头像信息
        const avatarInfoMap = new Map()
        for (const partner of displayPartners) {
            if (partner.image) {
                try {
                    const info = await wx.getImageInfo({ src: partner.image })
                    avatarInfoMap.set(partner.image, { width: info.width, height: info.height, ratio: info.width / info.height })
                } catch (e) {
                    console.error('获取头像信息失败:', partner.name, e)
                    avatarInfoMap.set(partner.image, { ratio: 1 }) // 默认正方形
                }
            }
        }

        const avatarSize = 120
        const avatarOverhang = 40  // 头像突出卡片顶部的高度

        // 先绘制所有卡片背景
        for (let i = 0; i < Math.min(displayPartners.length, 3); i++) {
            const row = Math.floor(i / cols)
            const col = i % cols
            const x = 32 + col * (itemWidth + gap)
            const y = gridStartY + row * (itemHeight + gap)

            const cardStartY = y + avatarOverhang
            const cardHeight = itemHeight - avatarOverhang

            ctx.setFillStyle('#ffffff')
            ctx.setShadow(0, 2, 8, 'rgba(0, 0, 0, 0.05)')
            ctx.fillRect(x, cardStartY, itemWidth, cardHeight)
            ctx.setShadow(0, 0, 0, 'transparent')
        }

        // 再绘制所有头像和文字（在卡片背景之上）
        for (let i = 0; i < Math.min(displayPartners.length, 3); i++) {
            const partner = displayPartners[i]
            const row = Math.floor(i / cols)
            const col = i % cols
            const x = 32 + col * (itemWidth + gap)
            const y = gridStartY + row * (itemHeight + gap)

            const avatarX = x + (itemWidth - avatarSize) / 2
            const avatarY = y  // 头像从卡片顶部开始

            // 绘制头像背景圆
            ctx.setFillStyle('#E9AE73')
            ctx.beginPath()
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, 2 * Math.PI)
            ctx.fill()

            // 绘制头像
            if (partner.image) {
                const avatarInfo = avatarInfoMap.get(partner.image) || { ratio: 1 }
                try {
                    const imgRatio = avatarInfo.ratio
                    // 使用 aspectFill 模式：容器宽高比 1:1.25（参考团队页面）
                    const containerWidth = avatarSize
                    const containerHeight = avatarSize * 1.25
                    const containerRatio = containerWidth / containerHeight
                    let drawWidth, drawHeight, drawX, drawY
                    const avatarCenterY = avatarY + avatarSize / 2
                    const avatarLeft = avatarX
                    const avatarTop = avatarCenterY - avatarSize / 2

                    if (imgRatio > containerRatio) {
                        // 图片更宽，以高度为准
                        drawHeight = containerHeight
                        drawWidth = drawHeight * imgRatio
                        drawX = avatarLeft - (drawWidth - containerWidth) / 2
                        drawY = avatarTop
                    } else {
                        // 图片更高或正方形，以宽度为准
                        drawWidth = containerWidth
                        drawHeight = drawWidth / imgRatio
                        drawX = avatarLeft
                        drawY = avatarTop
                    }

                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(avatarX + avatarSize / 2, avatarCenterY, avatarSize / 2, 0, 2 * Math.PI)
                    ctx.clip()
                    ctx.drawImage(partner.image, drawX, drawY, drawWidth, drawHeight)
                    ctx.restore()
                } catch (e) {
                    console.error('绘制头像失败:', partner.name, e)
                }
            }

            // 绘制姓名
            ctx.setFillStyle('#333333')
            ctx.setFontSize(28)
            ctx.setTextAlign('center')
            ctx.fillText(partner.name, x + itemWidth / 2, avatarY + avatarSize + 40)

            // 绘制学校（只显示第一个）
            if (partner.school) {
                const schoolLines = partner.school.split(/[、，；\n]/).filter(s => s.trim())
                if (schoolLines.length > 0) {
                    ctx.setFillStyle('#666666')
                    ctx.setFontSize(22)
                    const schoolText = schoolLines[0].length > 10 ? schoolLines[0].substring(0, 10) + '...' : schoolLines[0]
                    ctx.fillText(schoolText, x + itemWidth / 2, avatarY + avatarSize + 75)
                }
            }

            // 绘制职位（只显示第一个）
            if (partner.title) {
                const titleLines = partner.title.split(/[、，；\n]/).filter(s => s.trim())
                if (titleLines.length > 0) {
                    ctx.setFillStyle('#999999')
                    ctx.setFontSize(20)
                    const titleText = titleLines[0].length > 10 ? titleLines[0].substring(0, 10) + '...' : titleLines[0]
                    ctx.fillText(titleText, x + itemWidth / 2, avatarY + avatarSize + 105)
                }
            }
        }

        ctx.draw(false, async () => {
            await new Promise(resolve => setTimeout(resolve, 500))
            try {
                const res = await wx.canvasToTempFilePath({
                    canvasId: canvasId,
                    width: canvasWidth,
                    height: canvasHeight,
                    destWidth: canvasWidth,
                    destHeight: canvasHeight,
                    fileType: 'jpg',
                    quality: 0.9
                }, page)

                page.setData({ shareImageUrl: res.tempFilePath })
                console.log('分享图生成成功:', res.tempFilePath)
            } catch (error) {
                console.error('生成分享图失败:', error)
            }
        })
    } catch (error) {
        console.error('生成分享图出错:', error)
        return ''
    }
}

module.exports = { generateTeamPoster, generateShareImage }
