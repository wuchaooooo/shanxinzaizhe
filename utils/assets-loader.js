// utils/assets-loader.js
// 静态资源加载器 - CDN 模式，直接从 cloudAssets 配置转换 CDN URL

const { DATA_SOURCE_CONFIG } = require('./data-source-config.js')
const { fileIDToCdnUrl } = require('./image-cache.js')

/**
 * 加载静态资源（CDN 模式：直接返回 CDN URL）
 * @param {Function} onAssetReady - 单个资源就绪的回调 (code, url)
 */
async function fetchAssets(onAssetReady) {
  const cloudAssets = DATA_SOURCE_CONFIG.cloudAssets || {}
  const codes = Object.keys(cloudAssets)
  const assets = {}
  codes.forEach(code => {
    const url = fileIDToCdnUrl(cloudAssets[code])
    if (url) {
      assets[code] = { code, path: url }
      if (onAssetReady) onAssetReady(code, url)
    }
  })
  return { assets, hasChanges: true }
}

/**
 * 根据 code 获取资源 CDN URL
 */
function getAssetPath(code) {
  const cloudAssets = DATA_SOURCE_CONFIG.cloudAssets || {}
  return fileIDToCdnUrl(cloudAssets[code]) || ''
}

/**
 * 批量获取资源 CDN URL
 */
function getAssetPaths(codes) {
  const paths = {}
  codes.forEach(code => { paths[code] = getAssetPath(code) })
  return paths
}

// 兼容旧调用，返回空对象
function getAssetsFromCache() { return {} }

module.exports = {
  fetchAssets,
  getAssetsFromCache,
  getAssetPath,
  getAssetPaths
}
